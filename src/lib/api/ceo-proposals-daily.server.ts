// ĐỀ XUẤT TỰ ĐỘNG MỖI SÁNG — dựa trên việc sắp đến hạn / quá hạn chưa có người phụ trách,
// hệ thống tạo đề xuất, tự gán nhân sự AI phù hợp và ghi vào nhật ký đề xuất.
/* eslint-disable @typescript-eslint/no-explicit-any */

const DUE_WINDOW_HOURS = 72; // sắp đến hạn trong 3 ngày tới
const MAX_PROPOSALS_PER_TENANT = 10;
const PROPOSAL_PREFIX = "[Đề xuất tự động]";

export type DailyProposalResult = {
  created: number;
  assigned: number;
  skipped: number;
};

type TaskRow = {
  id: string;
  workspace_id: string | null;
  title: string;
  status: string;
  priority: string | null;
  due_at: string | null;
  progress_pct: number | null;
  ai_worker_id: string | null;
  execution_mode: string | null;
  expected_deliverable: string | null;
  acceptance_criteria: string | null;
};

type WorkerRow = { id: string; name: string; role: string; status: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Chọn nhân sự AI phù hợp nhất theo từ khoá trong tên công việc; mặc định lấy người đầu tiên. */
function pickWorker(workers: WorkerRow[], task: TaskRow): WorkerRow | null {
  if (!workers.length) return null;
  const title = task.title.toLowerCase();
  const match = workers.find((w) => {
    const role = `${w.role} ${w.name}`.toLowerCase();
    return role
      .split(/[\s_-]+/)
      .filter((token) => token.length >= 4)
      .some((token) => title.includes(token));
  });
  return match ?? workers[0]!;
}

/**
 * Tạo đề xuất cho các việc sắp đến hạn của một tổ chức, tự gán nhân sự AI
 * và ghi nhận kết quả vào nhật ký đề xuất. Idempotent theo ngày nhờ khoá chống trùng.
 */
export async function runDailyProposals(
  admin: any,
  tenantId: string,
  authorId: string,
): Promise<DailyProposalResult> {
  const result: DailyProposalResult = { created: 0, assigned: 0, skipped: 0 };
  const now = Date.now();
  const until = new Date(now + DUE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: taskData, error: taskErr } = await admin
    .from("tasks")
    .select(
      "id, workspace_id, title, status, priority, due_at, progress_pct, ai_worker_id, execution_mode, expected_deliverable, acceptance_criteria",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("status", ["todo", "in_progress", "blocked"])
    .not("due_at", "is", null)
    .lte("due_at", until)
    .order("due_at", { ascending: true })
    .limit(MAX_PROPOSALS_PER_TENANT * 3);
  if (taskErr) throw new Error(taskErr.message);

  const tasks = (taskData ?? []) as TaskRow[];
  if (!tasks.length) return result;

  // Không tạo trùng: bỏ qua việc đã có đề xuất tự động trong 20 giờ qua.
  const since = new Date(now - 20 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("ai_action_proposals")
    .select("target_id, title, created_at")
    .eq("tenant_id", tenantId)
    .eq("target_type", "TASK")
    .gte("created_at", since)
    .limit(500);
  const already = new Set<string>();
  for (const p of (existing ?? []) as { target_id: string | null; title: string }[]) {
    if (p.target_id && p.title?.startsWith(PROPOSAL_PREFIX)) already.add(p.target_id);
  }

  const { data: workerData } = await admin
    .from("ai_workers")
    .select("id, name, role, status")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  const workers = (workerData ?? []) as WorkerRow[];

  const candidates = tasks.filter((t) => !already.has(t.id)).slice(0, MAX_PROPOSALS_PER_TENANT);

  for (const task of candidates) {
    const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < now);
    const worker = task.ai_worker_id ? null : pickWorker(workers, task);
    const dueLabel = task.due_at ? fmtDate(task.due_at) : "chưa đặt hạn";
    const title = `${PROPOSAL_PREFIX} ${overdue ? "Xử lý việc quá hạn" : "Đẩy tiến độ việc sắp đến hạn"}: ${task.title}`.slice(
      0,
      300,
    );
    const description = [
      overdue ? `Việc đã quá hạn từ ${dueLabel}.` : `Việc đến hạn ${dueLabel}.`,
      `Tiến độ hiện tại ${task.progress_pct ?? 0}%.`,
      worker
        ? `Đề xuất giao cho nhân sự AI ${worker.name} (${worker.role}) hỗ trợ hoàn thành.`
        : task.ai_worker_id
          ? "Việc đã có nhân sự AI phụ trách, cần theo dõi tiến độ."
          : "Chưa có nhân sự AI phù hợp, cần quản lý phân công thủ công.",
    ].join(" ");

    let assigned = false;
    if (worker) {
      const { error: assignErr } = await admin
        .from("tasks")
        .update({
          execution_mode: "AI_ASSISTED",
          ai_worker_id: worker.id,
          expected_deliverable:
            task.expected_deliverable ?? `Hoàn thành "${task.title}" trước hạn ${dueLabel}.`,
          acceptance_criteria:
            task.acceptance_criteria ??
            "Kết quả đúng yêu cầu ban đầu, có bằng chứng bàn giao và được người phụ trách xác nhận.",
          ai_execution_status: "NOT_STARTED",
          updated_by: authorId,
        })
        .eq("id", task.id)
        .eq("tenant_id", tenantId);
      if (!assignErr) {
        assigned = true;
        result.assigned += 1;
      }
    }

    const { error: insErr } = await admin.from("ai_action_proposals").insert({
      tenant_id: tenantId,
      user_id: authorId,
      workspace_id: task.workspace_id,
      action_type: "UPDATE_TASK_FIELDS",
      risk: overdue ? "MEDIUM" : "LOW",
      source: "PROJECT_CONTEXT",
      title,
      description,
      target_type: "TASK",
      target_id: task.id,
      payload: {
        taskId: task.id,
        dueAt: task.due_at,
        overdue,
        progressPct: task.progress_pct ?? 0,
        aiWorkerId: worker?.id ?? task.ai_worker_id ?? null,
        auto: true,
      },
      status: assigned ? "SUCCEEDED" : "PROPOSED",
      executed_at: assigned ? new Date().toISOString() : null,
      ai_worker_id: worker?.id ?? task.ai_worker_id ?? null,
      result: assigned
        ? { entityType: "TASK", entityId: task.id, assignedTo: worker?.name ?? null }
        : null,
      expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insErr) {
      result.skipped += 1;
      continue;
    }
    result.created += 1;
  }

  return result;
}
