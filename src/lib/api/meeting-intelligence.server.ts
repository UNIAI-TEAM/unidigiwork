// Server-only helpers cho Meeting Intelligence V1.
import type {
  MeetingActionItem,
  MeetingDecision,
  MeetingSummary,
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
  };
}