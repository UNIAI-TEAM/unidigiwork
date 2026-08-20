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
  SummaryChunkProgress,
  SummaryProgress,
  TranscriptSegment,
} from "@/domain/meeting-intelligence/contracts";
import {
  buildMeetingSummarySystemPrompt,
  buildMeetingSummaryUserPrompt,
  buildTranscriptWindow,
  parseMeetingSummaryOutput,
  renderTranscriptForModel,
  shouldUseStagedSummary,
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

/** Nạp biên bản dạng văn bản (dán tay hoặc file .txt/.vtt đã có sẵn). */
export const importMeetingTranscriptText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        text: z.string().min(1).max(200_000),
        durationSeconds: z.number().int().min(0).max(86_400).nullish(),
        source: z.enum(["MANUAL", "RECORDING"]).default("MANUAL"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inserted: number }> => {
    const { splitTranscriptText } = await import("./meeting-transcription.server");
    const segments = splitTranscriptText(data.text, data.durationSeconds ?? null);
    if (segments.length === 0) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "Nội dung biên bản trống." });
    }
    let inserted = 0;
    for (let i = 0; i < segments.length; i += 100) {
      const { data: count, error } = await context.supabase.rpc("append_meeting_transcript", {
        _meeting_id: data.meetingId,
        _segments: segments.slice(i, i + 100) as never,
        _source: data.source,
      });
      if (error) mapPgError(error, "MEETING_NOT_FOUND");
      inserted += Number(count ?? 0);
    }
    return { inserted };
  });

/** Phiên âm file ghi âm cuộc họp bằng Lovable AI rồi lưu thành biên bản thật. */
export const transcribeMeetingRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
        // base64 (không kèm data: prefix); giới hạn ~12MB nhị phân.
        base64: z.string().min(16).max(17_000_000),
        durationSeconds: z.number().int().min(0).max(86_400).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inserted: number; characters: number }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể phiên âm. Vui lòng thử lại." });
    }
    const { transcribeAudio, splitTranscriptText } = await import("./meeting-transcription.server");

    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binary.byteLength < 2048) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "File ghi âm rỗng hoặc quá ngắn. Hãy ghi âm lại." });
    }

    let text = "";
    try {
      text = await transcribeAudio(binary, data.fileName, data.mimeType, apiKey);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      const message =
        status === 402
          ? "Workspace đã hết credit AI. Vui lòng nạp thêm để tiếp tục phiên âm."
          : status === 429
            ? "Đang bị giới hạn tốc độ. Vui lòng thử lại sau ít phút."
            : status === 400
              ? "Định dạng file ghi âm không được hỗ trợ. Hãy dùng WAV hoặc MP3."
              : "Không phiên âm được file ghi âm. Vui lòng thử lại.";
      throw new ApiError({ code: status === 402 ? "AI_QUOTA_EXCEEDED" : "AI_GATEWAY_UNAVAILABLE", message });
    }
    if (!text) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "Không nhận được nội dung nào từ file ghi âm." });
    }

    const segments = splitTranscriptText(text, data.durationSeconds ?? null);
    let inserted = 0;
    for (let i = 0; i < segments.length; i += 100) {
      const { data: count, error } = await context.supabase.rpc("append_meeting_transcript", {
        _meeting_id: data.meetingId,
        _segments: segments.slice(i, i + 100) as never,
        _source: "RECORDING",
      });
      if (error) mapPgError(error, "MEETING_NOT_FOUND");
      inserted += Number(count ?? 0);
    }
    return { inserted, characters: text.length };
  });

const _unusedGetMeetingSummary = createServerFn({ method: "POST" })
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

export const getMeetingSummaryProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<SummaryProgress | null> => {
    const { mapProgressRow } = await import("./meeting-intelligence.server");
    const { data: row, error } = await context.supabase
      .from("meeting_summary_progress")
      .select("*")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return row ? mapProgressRow(row as Record<string, unknown>) : null;
  });

export const generateMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<MeetingSummary> => {
    const { mapSummaryRow, checkMeetingSummaryRateLimit, writeSummaryProgress } = await import(
      "./meeting-intelligence.server"
    );

    if (!checkMeetingSummaryRateLimit(context.userId)) {
      throw new ApiError({ code: "RATE_LIMITED", message: "Bạn đang tạo tóm tắt quá nhanh. Thử lại sau ít phút." });
    }

    // Họp 2–3 giờ: nạp theo trang để không mất phần cuối transcript.
    const PAGE = 1000;
    const MAX_SEGMENTS = 6000;
    const rows: Array<Record<string, unknown>> = [];
    for (let from = 0; from < MAX_SEGMENTS; from += PAGE) {
      const { data: page, error: tErr } = await context.supabase
        .from("meeting_transcript_segments")
        .select("id, speaker_name, offset_seconds, content, source, created_at")
        .eq("meeting_id", data.meetingId)
        .order("offset_seconds", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (tErr) mapPgError(tErr, "MEETING_NOT_FOUND");
      const list = (page ?? []) as Array<Record<string, unknown>>;
      rows.push(...list);
      if (list.length < PAGE) break;
    }

    const segments: TranscriptSegment[] = rows.map((r) => ({
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

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể tạo tóm tắt. Vui lòng thử lại." });
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);
    const startAt = segments[0]?.createdAt ?? "";

    let parsed: ReturnType<typeof parseMeetingSummaryOutput>;
    let sources: ReturnType<typeof toSummarySources>;
    let truncated: boolean;
    let degraded = false;
    const runId = crypto.randomUUID();
    const staged = shouldUseStagedSummary(segments);
    let lastChunks: SummaryChunkProgress[] = [];
    await writeSummaryProgress(context.supabase, {
      meetingId: data.meetingId,
      runId,
      phase: "PREPARING",
      staged,
      truncated: false,
      chunks: [],
    });

    if (staged) {
      // Họp dài: map theo chunk → reduce synthesis (trích dẫn vẫn là sourceId toàn cục).
      const { runStagedMeetingSummary } = await import("./meeting-staged-summary.server");
      const staged = await runStagedMeetingSummary({
        provider,
        model: MODEL,
        title: "Cuộc họp",
        startAt,
        segments,
        onProgress: ({ phase, chunks }) => {
          lastChunks = chunks;
          return writeSummaryProgress(context.supabase, {
            meetingId: data.meetingId,
            runId,
            phase,
            staged: true,
            truncated: false,
            chunks,
          });
        },
      });
      if (staged.failedStages > 0 && staged.parsed.decisions.length === 0 && !staged.parsed.summary) {
        await writeSummaryProgress(context.supabase, {
          meetingId: data.meetingId,
          runId,
          phase: "FAILED",
          staged: true,
          truncated: staged.truncated,
          chunks: [],
        });
        throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể tạo tóm tắt. Vui lòng thử lại." });
      }
      parsed = staged.parsed;
      sources = staged.sources;
      truncated = staged.truncated;
      degraded = staged.failedStages > 0 || !staged.synthesized;
    } else {
      const built = buildTranscriptWindow(segments);
      sources = toSummarySources(built.window);
      truncated = built.truncated;
      let raw = "";
      try {
        await writeSummaryProgress(context.supabase, {
          meetingId: data.meetingId,
          runId,
          phase: "MAPPING",
          staged: false,
          truncated,
          chunks: [
            {
              index: 0,
              status: "RUNNING",
              startOffsetSeconds: built.window[0]?.offsetSeconds ?? 0,
              endOffsetSeconds: built.window.at(-1)?.offsetSeconds ?? 0,
              segmentCount: built.window.length,
              charCount: built.window.reduce((n, s) => n + s.content.length, 0),
            },
          ],
        });
        const result = streamText({
          model: provider.responses(MODEL),
          system: buildMeetingSummarySystemPrompt(),
          prompt: buildMeetingSummaryUserPrompt({
            title: "Cuộc họp",
            startAt,
            agenda: null,
            transcriptBlock: renderTranscriptForModel(built.window),
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
        await writeSummaryProgress(context.supabase, {
          meetingId: data.meetingId,
          runId,
          phase: "FAILED",
          staged: false,
          truncated,
          chunks: [],
        });
        throw new ApiError({ code: "AI_GATEWAY_UNAVAILABLE", message: "Chưa thể tạo tóm tắt. Vui lòng thử lại." });
      }
      parsed = parseMeetingSummaryOutput(raw, sources.map((s) => s.sourceId));
    }

    await writeSummaryProgress(context.supabase, {
      meetingId: data.meetingId,
      runId,
      phase: "DONE",
      staged,
      truncated,
      chunks: lastChunks,
    });

    const { validateGroundedSummary } = await import("@/domain/meeting-intelligence/grounding");
    const grounded = validateGroundedSummary(parsed, sources);
    const usedIds = new Set([
      ...grounded.decisions.flatMap((d) => d.sourceIds),
      ...grounded.actionItems.flatMap((a) => a.sourceIds),
    ]);
    const citedSources = sources.filter((s) => usedIds.has(s.sourceId));

    const { data: saved, error: sErr } = await context.supabase.rpc("save_meeting_summary", {
      _meeting_id: data.meetingId,
      _status: truncated || degraded ? "partial" : "ready",
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