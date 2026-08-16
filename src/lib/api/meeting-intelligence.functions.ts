// MEETING INTELLIGENCE V1 — transcript + tóm tắt cuộc họp. Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";
import type { MeetingSummary, TranscriptSegment } from "@/domain/meeting-intelligence/contracts";
import {
  buildMeetingSummarySystemPrompt,
  buildMeetingSummaryUserPrompt,
  buildTranscriptWindow,
  parseMeetingSummaryOutput,
  renderTranscriptForModel,
  toSummarySources,
} from "@/domain/meeting-intelligence/contracts";

const MODEL = "openai/gpt-5.6-sol";
const meetingIdSchema = z.object({ meetingId: z.string().uuid() });

export const listMeetingTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<TranscriptSegment[]> => {
    const { data: rows, error } = await context.supabase
      .from("meeting_transcript_segments")
      .select("id, speaker_name, offset_seconds, content, source, created_at")
      .eq("meeting_id", data.meetingId)
      .order("offset_seconds", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      speakerName: (r.speaker_name as string | null) ?? null,
      offsetSeconds: Number(r.offset_seconds ?? 0),
      content: String(r.content ?? ""),
      source: (r.source as TranscriptSegment["source"]) ?? "LIVE_CAPTION",
      createdAt: String(r.created_at),
    }));
  });

export const appendMeetingTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        source: z.enum(["LIVE_CAPTION", "RECORDING", "MANUAL"]).default("LIVE_CAPTION"),
        segments: z
          .array(
            z.object({
              content: z.string().min(1).max(4000),
              speakerName: z.string().max(120).nullish(),
              offsetSeconds: z.number().int().min(0).max(86_400).default(0),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inserted: number }> => {
    const { data: count, error } = await context.supabase.rpc("append_meeting_transcript", {
      _meeting_id: data.meetingId,
      _segments: data.segments as never,
      _source: data.source,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return { inserted: Number(count ?? 0) };
  });

export const getMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<MeetingSummary | null> => {
    const { mapSummaryRow } = await import("./meeting-intelligence.server");
    const { data: row, error } = await context.supabase
      .from("meeting_summaries")
      .select("*")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return row ? mapSummaryRow(row as Record<string, unknown>) : null;
  });

export const generateMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<MeetingSummary> => {
    const { mapSummaryRow, checkMeetingSummaryRateLimit } = await import("./meeting-intelligence.server");

    if (!checkMeetingSummaryRateLimit(context.userId)) {
      throw new ApiError({ code: "RATE_LIMITED", message: "Bạn đang tạo tóm tắt quá nhanh. Thử lại sau ít phút." });
    }

    const { data: meeting, error: mErr } = await context.supabase
      .from("meetings")
      .select("id, title, agenda, start_at")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (mErr) mapPgError(mErr, "MEETING_NOT_FOUND");
    if (!meeting) throw new ApiError({ code: "MEETING_NOT_FOUND", message: "Không tìm thấy cuộc họp." });

    const { data: rows, error: tErr } = await context.supabase
      .from("meeting_transcript_segments")
      .select("id, speaker_name, offset_seconds, content, source, created_at")
      .eq("meeting_id", data.meetingId)
      .order("offset_seconds", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1000);
    if (tErr) mapPgError(tErr, "MEETING_NOT_FOUND");

    const segments: TranscriptSegment[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      speakerName: (r.speaker_name as string | null) ?? null,
      offsetSeconds: Number(r.offset_seconds ?? 0),
      content: String(r.content ?? ""),
      source: (r.source as TranscriptSegment["source"]) ?? "LIVE_CAPTION",
      createdAt: String(r.created_at),
    }));
    if (segments.length === 0) {
      throw new ApiError({
        code: "VALIDATION_FAILED",
        message: "Chưa có biên bản hoặc phụ đề nào cho cuộc họp này để tóm tắt.",
      });
    }

    const { window, truncated } = buildTranscriptWindow(segments);
    const sources = toSummarySources(window);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể tạo tóm tắt. Vui lòng thử lại." });
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);

    let raw = "";
    try {
      const result = streamText({
        model: provider.responses(MODEL),
        system: buildMeetingSummarySystemPrompt(),
        prompt: buildMeetingSummaryUserPrompt({
          title: String(meeting.title ?? "Cuộc họp"),
          startAt: String(meeting.start_at ?? ""),
          agenda: (meeting.agenda as string | null) ?? null,
          transcriptBlock: renderTranscriptForModel(window),
          truncated,
        }),
        maxOutputTokens: 1600,
        temperature: 0.2,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false },
        },
      });
      raw = await result.text;
    } catch {
      throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể tạo tóm tắt. Vui lòng thử lại." });
    }

    const parsed = parseMeetingSummaryOutput(raw, sources.map((s) => s.sourceId));
    const usedIds = new Set([
      ...parsed.decisions.flatMap((d) => d.sourceIds),
      ...parsed.actionItems.flatMap((a) => a.sourceIds),
    ]);
    const citedSources = sources.filter((s) => usedIds.has(s.sourceId));

    const { data: saved, error: sErr } = await context.supabase.rpc("save_meeting_summary", {
      _meeting_id: data.meetingId,
      _status: truncated ? "partial" : "ready",
      _model: MODEL,
      _summary: parsed.summary,
      _highlights: parsed.highlights as never,
      _decisions: parsed.decisions as never,
      _action_items: parsed.actionItems as never,
      _sources: (citedSources.length ? citedSources : sources.slice(0, 10)) as never,
      _segment_count: segments.length,
    });
    if (sErr) mapPgError(sErr, "MEETING_NOT_FOUND");
    return mapSummaryRow(saved as unknown as Record<string, unknown>);
  });