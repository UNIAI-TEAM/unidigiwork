// Server-only helpers cho Meeting Intelligence V1.
import type {
  MeetingActionItem,
  MeetingDecision,
  MeetingFollowUp,
  MeetingOpenQuestion,
  MeetingRisk,
  MeetingSummary,
  SummaryChunkProgress,
  SummaryProgress,
  SummarySource,
} from "@/domain/meeting-intelligence/contracts";

const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX = 5;
const buckets = new Map<string, number[]>();

/** Giới hạn 5 lần tạo tóm tắt / 5 phút / user. */
export function checkMeetingSummaryRateLimit(userId: string): boolean {
  const now = Date.now();
  const hits = (buckets.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    buckets.set(userId, hits);
    return false;
  }
  hits.push(now);
  buckets.set(userId, hits);
  return true;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function mapSummaryRow(row: Record<string, unknown>): MeetingSummary {
  return {
    meetingId: String(row.meeting_id),
    status: (row.status as MeetingSummary["status"]) ?? "ready",
    model: (row.model as string | null) ?? null,
    summary: String(row.summary ?? ""),
    highlights: arr<string>(row.highlights),
    decisions: arr<MeetingDecision>(row.decisions),
    actionItems: arr<MeetingActionItem>(row.action_items),
    sources: arr<SummarySource>(row.sources),
    segmentCount: Number(row.segment_count ?? 0),
    generatedAt: String(row.generated_at ?? row.created_at ?? new Date().toISOString()),
    risks: arr<MeetingRisk>(row.risks),
    openQuestions: arr<MeetingOpenQuestion>(row.open_questions),
    followUp:
      row.followup && typeof row.followup === "object" && (row.followup as MeetingFollowUp).subject
        ? (row.followup as MeetingFollowUp)
        : null,
    transcriptChecksum: (row.transcript_checksum as string | null) ?? null,
    version: Number(row.version ?? 1),
  };
}
/* ---------------- Tiến độ staged summarization ---------------- */

export function mapProgressRow(row: Record<string, unknown>): SummaryProgress {
  return {
    meetingId: String(row.meeting_id),
    runId: String(row.run_id),
    phase: (row.phase as SummaryProgress["phase"]) ?? "PREPARING",
    staged: Boolean(row.staged),
    truncated: Boolean(row.truncated),
    totalChunks: Number(row.total_chunks ?? 0),
    completedChunks: Number(row.completed_chunks ?? 0),
    failedChunks: Number(row.failed_chunks ?? 0),
    chunks: Array.isArray(row.chunks) ? (row.chunks as SummaryChunkProgress[]) : [],
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    finishedAt: (row.finished_at as string | null) ?? null,
  };
}

type ProgressClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> };

/** Ghi tiến độ; lỗi ghi không bao giờ làm hỏng việc tạo tóm tắt. */
export async function writeSummaryProgress(
  client: ProgressClient,
  args: {
    meetingId: string;
    runId: string;
    phase: SummaryProgress["phase"];
    staged: boolean;
    truncated: boolean;
    chunks: SummaryChunkProgress[];
  },
): Promise<void> {
  try {
    await client.rpc("save_meeting_summary_progress", {
      _meeting_id: args.meetingId,
      _run_id: args.runId,
      _phase: args.phase,
      _staged: args.staged,
      _truncated: args.truncated,
      _chunks: args.chunks,
    });
  } catch {
    /* bỏ qua */
  }
}
