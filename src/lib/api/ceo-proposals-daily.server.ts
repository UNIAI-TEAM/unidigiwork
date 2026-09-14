// ĐỀ XUẤT TỰ ĐỘNG MỖI SÁNG — dựa trên việc sắp đến hạn / quá hạn chưa có người phụ trách,
// hệ thống chấm điểm khẩn cấp, sắp xếp ưu tiên, gán nhân sự thật (nếu có) và nhân sự AI hỗ trợ.
/* eslint-disable @typescript-eslint/no-explicit-any */

const DUE_WINDOW_HOURS = 72; // sắp đến hạn trong 3 ngày tới
const MAX_PROPOSALS_PER_TENANT = 10;
const PROPOSAL_PREFIX = "[Đề xuất tự động]";

export type DailyProposalResult = {
  created: number;
  assigned: number; // số việc được gán nhân sự AI
  assignedPeople: number; // số việc được gán nhân sự thật
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
type PersonRow = { id: string; name: string; load: number };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Trọng số mức ưu tiên khai báo trên việc. */
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 40,
  critical: 40,
  high: 30,
  medium: 15,
  normal: 15,
  low: 5,
};

/**
 * Điểm khẩn cấp: quá hạn càng lâu điểm càng cao, cộng mức ưu tiên,
 * cộng thêm khi việc đang vướng mắc hoặc tiến độ còn thấp.
 */
export function urgencyScore(task: TaskRow, now: number): number {
  let score = 0;
  if (task.due_at) {
    const hours = (new Date(task.due_at).getTime() - now) / 3_600_000;
    if (hours < 0) score += 60 + Math.min(40, Math.abs(hours) / 6); // quá hạn
    else score += Math.max(0, 50 - hours * (50 / DUE_WINDOW_HOURS)); // càng gần hạn càng cao
  }
  score += PRIORITY_WEIGHT[(task.priority ?? "").toLowerCase()] ?? 10;
  if (task.status === "blocked") score += 20;
  score += Math.max(0, 20 - (task.progress_pct ?? 0) / 5);
  return Math.round(score * 10) / 10;
}

const urgencyLabel = (score: number) =>
  score >= 100 ? "RẤT KHẨN" : score >= 70 ? "KHẨN" : score >= 45 ? "CAO" : "THƯỜNG";

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

/** Chọn nhân sự thật: ưu tiên tên khớp nội dung việc, sau đó người đang ít việc nhất. */
function pickPerson(people: PersonRow[], task: TaskRow): PersonRow | null {
  if (!people.length) return null;
  const title = task.title.toLowerCase();
  const match = people.find((p) =>
    p.name
      .toLowerCase()
      .split(/[\s_-]+/)
      .filter((token) => token.length >= 4)
      .some((token) => title.includes(token)),
  );
  if (match) return match;
  return [...people].sort((a, b) => a.load - b.load)[0]!;
}

/**
 * Tạo đề xuất cho các việc sắp đến hạn của một tổ chức, sắp xếp theo mức khẩn cấp,
 * tự gán nhân sự thật khi có và nhân sự AI hỗ trợ. Idempotent theo ngày nhờ khoá chống trùng.
 */
export async function runDailyProposals(
  admin: any,
  tenantId: string,
  authorId: string,
): Promise<DailyProposalResult> {
  const result: DailyProposalResult = { created: 0, assigned: 0, assignedPeople: 0, skipped: 0 };
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
    .limit(MAX_PROPOSALS_PER_TENANT * 5);
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

  // Nhân sự thật đang hoạt động trong tổ chức + khối lượng việc đang mở.
  const { data: memberData } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(500);
  const memberIds = ((memberData ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const people: PersonRow[] = [];
  const loadByUser = new Map<string, number>();
  if (memberIds.length) {
    const { data: openTasks } = await admin
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["todo", "in_progress", "blocked"])
      .limit(2000);
    const openIds = ((openTasks ?? []) as { id: string }[]).map((t) => t.id);
    if (openIds.length) {
      const { data: openAssignees } = await admin
        .from("task_assignees")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "assignee")
        .in("task_id", openIds.slice(0, 1000));
      for (const a of (openAssignees ?? []) as { user_id: string }[]) {
        loadByUser.set(a.user_id, (loadByUser.get(a.user_id) ?? 0) + 1);
      }
    }
    const { data: userRows } = await admin
      .from("users")
      .select("id, display_name, primary_email, status")
      .in("id", memberIds);
    for (const u of (userRows ?? []) as {
      id: string;
      display_name: string | null;
      primary_email: string | null;
      status: string | null;
    }[]) {
      if (u.status && u.status !== "active") continue;
      people.push({
        id: u.id,
        name: u.display_name ?? u.primary_email ?? "Thành viên",
        load: loadByUser.get(u.id) ?? 0,
      });
    }
  }

  // Việc đã có người phụ trách thật thì không gán lại.
  const candidatePool = tasks.filter((t) => !already.has(t.id));
  const existingAssignee = new Set<string>();
  if (candidatePool.length) {
    const { data: taAll } = await admin
      .from("task_assignees")
      .select("task_id")
      .eq("tenant_id", tenantId)
      .eq("role", "assignee")
      .in(
        "task_id",
        candidatePool.map((t) => t.id),
      );
    for (const a of (taAll ?? []) as { task_id: string }[]) existingAssignee.add(a.task_id);
  }

  // Sắp xếp theo mức khẩn cấp giảm dần, hạn chót sớm hơn xếp trước khi bằng điểm.
  const candidates = candidatePool
    .map((task) => ({ task, score: urgencyScore(task, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.task.due_at ?? 0).getTime() - new Date(b.task.due_at ?? 0).getTime(),
    )
    .slice(0, MAX_PROPOSALS_PER_TENANT);

  let rank = 0;
  for (const { task, score } of candidates) {
    rank += 1;
    const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < now);
    const worker = task.ai_worker_id ? null : pickWorker(workers, task);
    const person = existingAssignee.has(task.id) ? null : pickPerson(people, task);
    const dueLabel = task.due_at ? fmtDate(task.due_at) : "chưa đặt hạn";
    const level = urgencyLabel(score);
    const title =
      `${PROPOSAL_PREFIX} [${level}] ${overdue ? "Xử lý việc quá hạn" : "Đẩy tiến độ việc sắp đến hạn"}: ${task.title}`.slice(
        0,
        300,
      );

    let assignedPerson = false;
    if (person) {
      const { error: paErr } = await admin.from("task_assignees").insert({
        task_id: task.id,
        user_id: person.id,
        tenant_id: tenantId,
        role: "assignee",
        assigned_by: authorId,
      });
      if (!paErr) {
        assignedPerson = true;
        person.load += 1;
        result.assignedPeople += 1;
      }
    }

    const description = [
      `Mức khẩn cấp ${level} (điểm ${score}), thứ tự ưu tiên #${rank}.`,
      overdue ? `Việc đã quá hạn từ ${dueLabel}.` : `Việc đến hạn ${dueLabel}.`,
      `Tiến độ hiện tại ${task.progress_pct ?? 0}%.`,
      assignedPerson
        ? `Đã giao cho nhân sự ${person!.name} phụ trách chính.`
        : existingAssignee.has(task.id)
          ? "Việc đã có người phụ trách, cần theo dõi tiến độ."
          : "Chưa có nhân sự thật khả dụng để phân công.",
      worker
        ? `Nhân sự AI ${worker.name} (${worker.role}) hỗ trợ hoàn thành.`
        : task.ai_worker_id
          ? "Đã có nhân sự AI hỗ trợ."
          : "Chưa có nhân sự AI phù hợp.",
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
      risk: score >= 100 ? "HIGH" : overdue || score >= 70 ? "MEDIUM" : "LOW",
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
        urgencyScore: score,
        urgencyLevel: level,
        priorityRank: rank,
        assigneeUserId: assignedPerson ? person!.id : null,
        assigneeName: assignedPerson ? person!.name : null,
        aiWorkerId: worker?.id ?? task.ai_worker_id ?? null,
        auto: true,
      },
      status: assigned || assignedPerson ? "SUCCEEDED" : "PROPOSED",
      executed_at: assigned || assignedPerson ? new Date().toISOString() : null,
      ai_worker_id: worker?.id ?? task.ai_worker_id ?? null,
      result:
        assigned || assignedPerson
          ? {
              entityType: "TASK",
              entityId: task.id,
              assignedTo: assignedPerson ? person!.name : (worker?.name ?? null),
              aiAssistant: worker?.name ?? null,
            }
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
