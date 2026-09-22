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
  const reportWorkProductId = (row.report_work_product_id as string | null) ?? null;
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
    report: {
      workProductId: reportWorkProductId,
      status: (row.report_status as MeetingSummary["report"]["status"]) ?? "PENDING",
      error: (row.report_error as string | null) ?? null,
      generatedAt: (row.report_generated_at as string | null) ?? null,
      href: reportWorkProductId ? `/work-products/${reportWorkProductId}` : null,
      mobileHref: reportWorkProductId ? `/m/work-products/${reportWorkProductId}` : null,
    },
  };
}

type MeetingReportTask = {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  progressPct: number;
  assignees: Array<{ userId: string; name: string; role: string }>;
};

export type MeetingReportContext = {
  meeting: { id: string; title: string; agenda: string | null; startAt: string; endAt: string };
  summary: {
    id: string;
    version: number;
    summary: string;
    highlights: string[];
    decisions: Array<{ text?: string; title?: string; status?: string }>;
    actionItems: Array<{ title?: string; owner?: string; dueAt?: string }>;
    risks: Array<{ text?: string; title?: string }>;
    openQuestions: Array<{ text?: string; question?: string }>;
    sources: Array<{ sourceId?: string; excerpt?: string }>;
  };
  tasks: MeetingReportTask[];
};

const line = (value: unknown, fallback = "Chưa xác định") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const list = (rows: unknown[], render: (row: Record<string, unknown>, index: number) => string) =>
  rows.length
    ? rows.map((row, index) => render((row ?? {}) as Record<string, unknown>, index)).join("\n")
    : "- Chưa xác định";

export function fallbackMeetingReport(context: MeetingReportContext): string {
  const tasks = context.tasks ?? [];
  const completed = tasks.filter((task) => task.status === "done").length;
  const average = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progressPct ?? 0), 0) / tasks.length)
    : 0;
  return [
    `# Báo cáo cuộc họp — ${line(context.meeting.title, "Cuộc họp")}`,
    "",
    "## Tóm tắt điều hành",
    line(context.summary.summary),
    "",
    "## Mục tiêu",
    context.summary.highlights?.length
      ? context.summary.highlights.map((item) => `- ${line(item)}`).join("\n")
      : `- ${line(context.meeting.agenda)}`,
    "",
    "## Chỉ tiêu/KPI",
    tasks.length
      ? `- Hoàn thành ${completed}/${tasks.length} công việc đã xác nhận\n- Tiến độ trung bình: ${average}%`
      : "- AI đề xuất: Chưa có công việc được xác nhận để đo tiến độ.",
    "",
    "## Kế hoạch hành động",
    list(tasks, (task, index) => `${index + 1}. ${line(task.title)} — ${line(task.status)}`),
    "",
    "## Deadline",
    list(tasks, (task) => `- ${line(task.title)}: ${task.dueAt ? new Date(String(task.dueAt)).toISOString() : "Chưa xác định"}`),
    "",
    "## Phân công",
    tasks.length
      ? tasks
          .map((task) => `- ${task.title}: ${task.assignees?.map((person) => person.name).join(", ") || "Chưa xác định"}`)
          .join("\n")
      : "- Chưa xác định",
    "",
    "## Tiến độ Work Graph",
    tasks.length
      ? tasks.map((task) => `- ${task.title}: ${task.progressPct ?? 0}% · ${task.status}`).join("\n")
      : "- Chưa có Task thật được liên kết từ cuộc họp.",
    "",
    "## Quyết định đã xác nhận",
    list(context.summary.decisions ?? [], (decision) => `- ${line(decision.text ?? decision.title)}${decision.status ? ` — ${decision.status}` : ""}`),
    "",
    "## Rủi ro và kiến nghị",
    list(context.summary.risks ?? [], (risk) => `- ${line(risk.text ?? risk.title)}`),
    "",
    "## Nguồn",
    `- Cuộc họp: ${context.meeting.id}`,
    `- Tóm tắt phiên bản: ${context.summary.version}`,
    ...tasks.map((task) => `- Task: ${task.taskId}`),
  ].join("\n");
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

type ProgressClient = { rpc: (...args: never[]) => unknown };

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
    const rpc = client.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>;
    await rpc("save_meeting_summary_progress", {
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
