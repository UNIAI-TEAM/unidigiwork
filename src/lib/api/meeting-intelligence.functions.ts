// MEETING INTELLIGENCE V1 — transcript + tóm tắt cuộc họp. Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";
import type {
  ActionItemState,
  MeetingSummary,
  TranscriptSegment,
} from "@/domain/meeting-intelligence/contracts";
import {
  buildMeetingSummarySystemPrompt,
  buildMeetingSummaryUserPrompt,
  buildTranscriptWindow,
  parseMeetingSummaryOutput,
  renderTranscriptForModel,
  toSummarySources,
  transcriptChecksum,
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
          title: "Cuộc họp",
          startAt: segments[0]?.createdAt ?? "",
          agenda: null,
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
    const { validateGroundedSummary } = await import("@/domain/meeting-intelligence/grounding");
    const grounded = validateGroundedSummary(parsed, sources);
    const usedIds = new Set([
      ...grounded.decisions.flatMap((d) => d.sourceIds),
      ...grounded.actionItems.flatMap((a) => a.sourceIds),
    ]);
    const citedSources = sources.filter((s) => usedIds.has(s.sourceId));

    const { data: saved, error: sErr } = await context.supabase.rpc("save_meeting_summary", {
      _meeting_id: data.meetingId,
      _status: truncated ? "partial" : "ready",
      _model: MODEL,
      _summary: parsed.summary,
      _highlights: parsed.highlights as never,
      _decisions: grounded.decisions as never,
      _action_items: grounded.actionItems as never,
      _sources: (citedSources.length ? citedSources : sources.slice(0, 10)) as never,
      _segment_count: segments.length,
      _risks: grounded.risks as never,
      _open_questions: grounded.openQuestions as never,
      _followup: (grounded.followUp ?? {}) as never,
      _transcript_checksum: transcriptChecksum(segments),
    });
    if (sErr) mapPgError(sErr, "MEETING_NOT_FOUND");
    return mapSummaryRow(saved as unknown as Record<string, unknown>);
  });

/* ------------------- Action item: PROPOSE → CONFIRM → TASK ------------------- */

const mapStateRow = (r: Record<string, unknown>): ActionItemState => ({
  itemKey: String(r.item_key),
  status: (r.status as ActionItemState["status"]) ?? "PROPOSED",
  taskId: (r.task_id as string | null) ?? null,
  confirmedAt: (r.confirmed_at as string | null) ?? null,
});

export const listMeetingActionItemStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<ActionItemState[]> => {
    const { data: rows, error } = await context.supabase
      .from("meeting_action_item_states")
      .select("item_key, status, task_id, confirmed_at")
      .eq("meeting_id", data.meetingId);
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return ((rows ?? []) as Array<Record<string, unknown>>).map(mapStateRow);
  });

/** Chỉ chạy khi người dùng xác nhận rõ ràng — AI không bao giờ tự tạo công việc. */
export const confirmMeetingActionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        itemKey: z.string().min(1).max(200),
        workspaceId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullish(),
        dueAt: z.string().datetime().nullish(),
        assigneeId: z.string().uuid().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ActionItemState> => {
    const { data: row, error } = await context.supabase.rpc("confirm_meeting_action_item", {
      _meeting_id: data.meetingId,
      _item_key: data.itemKey,
      _workspace_id: data.workspaceId,
      _title: data.title,
      _description: data.description ?? undefined,
      _due_at: data.dueAt ?? undefined,
      _assignee_id: data.assigneeId ?? undefined,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return mapStateRow(row as unknown as Record<string, unknown>);
  });

export const dismissMeetingActionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema.extend({ itemKey: z.string().min(1).max(200), title: z.string().max(200).default("") }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ActionItemState> => {
    const { data: row, error } = await context.supabase.rpc("dismiss_meeting_action_item", {
      _meeting_id: data.meetingId,
      _item_key: data.itemKey,
      _title: data.title,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return mapStateRow(row as unknown as Record<string, unknown>);
  });