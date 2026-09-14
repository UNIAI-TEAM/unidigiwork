// CEO COMMAND CENTER — tổng hợp chỉ đọc cho màn hình điều hành.
// Không ghi dữ liệu, không tạo bảng mới. Mọi truy vấn chạy qua RLS của người dùng.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type CeoPeriod = "day" | "week" | "month" | "quarter" | "half" | "year";

export const PERIOD_DAYS: Record<CeoPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 91,
  half: 182,
  year: 365,
};

/** Giờ người ước tính cho mỗi việc hoàn thành (không có chấm công trong hệ thống). */
export const HUMAN_HOURS_PER_TASK = 2;

export type CeoDelta = { current: number; previous: number; changePct: number | null };

export type CeoPersonRow = {
  id: string;
  name: string;
  kind: "human" | "ai";
  role: string | null;
  tasks: number;
  completed: number;
  hours: number;
  hoursEstimated: boolean;
  reviewPassRate: number | null;
};

export type CeoIssue = {
  id: string;
  kind: "overdue" | "stalled" | "pending_review" | "pending_approval";
  title: string;
  detail: string;
  href: string;
  progressPct?: number | null;
  status?: string | null;
};

export type CeoProposalEntry = {
  id: string;
  title: string;
  actionType: string;
  status: string;
  source: string | null;
  risk: string | null;
  createdAt: string;
  executedAt: string | null;
  workerName: string | null;
  taskTitle: string | null;
  taskId: string | null;
  taskStatus: string | null;
  taskProgressPct: number | null;
  taskDueAt: string | null;
  workspaceId: string | null;
};

export type CeoOverview = {
  period: CeoPeriod;
  from: string;
  to: string;
  totals: {
    tasks: CeoDelta;
    completed: CeoDelta;
    inProgress: number;
    overdue: number;
  };
  split: {
    human: number;
    ai: number;
    aiSharePct: number;
    aiSharePrevPct: number;
    trend: { label: string; human: number; ai: number }[];
  };
  time: {
    aiHours: number;
    humanHours: number;
    meetingHours: number;
    /** Giờ họp đã lên lịch nhưng chưa diễn ra — không tính vào KPI. */
    upcomingMeetingHours: number;
    upcomingMeetings: number;
    nextMeeting: { title: string; startAt: string } | null;
    /** % tiến độ trung bình của việc đang chạy trong kỳ. */
    avgProgressPct: number;
    savedHours: number;
    leverage: number | null;
  };
  quality: {
    tasksCreated: number;
    withResult: number;
    reviewed: number;
    passed: number;
    passRate: number | null;
    resultRate: number | null;
  };
  people: CeoPersonRow[];
  departments: {
    id: string;
    name: string;
    human: number;
    ai: number;
    total: number;
    weight: number;
    completed: number;
    overdue: number;
    aiSharePct: number;
    /** Giờ ước tính theo số việc hoàn thành, không phải giờ chấm công thật. */
    hoursEstimated: number;
    proposals: number;
  }[];
  kpi: {
    configured: boolean;
    updatedAt: string | null;
    targets: CeoKpiTargets;
    rows: CeoKpiRow[];
    score: number | null;
  };
  issues: CeoIssue[];
  proposals: {
    total: CeoDelta;
    pending: number;
    executed: number;
    rejected: number;
    assignment: number;
    executionRate: number | null;
    entries: CeoProposalEntry[];
  };
  answers: {
    resources: string[];
    outputs: string[];
    changes: string[];
    value: string[];
  };
};

export type CeoKpiTargets = {
  completed: number | null;
  maxOverdue: number | null;
  aiSharePct: number | null;
  resultRatePct: number | null;
  passRatePct: number | null;
};

export type CeoKpiRow = {
  key: keyof CeoKpiTargets;
  label: string;
  unit: string;
  target: number | null;
  actual: number | null;
  /** "up" = càng cao càng tốt, "down" = càng thấp càng tốt. */
  direction: "up" | "down";
  achievedPct: number | null;
  ok: boolean | null;
};

export const EMPTY_CEO_KPI_TARGETS: CeoKpiTargets = {
  completed: null,
  maxOverdue: null,
  aiSharePct: null,
  resultRatePct: null,
  passRatePct: null,
};

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseCeoKpiTargets(raw: unknown): CeoKpiTargets {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    completed: numOrNull(o["completed"]),
    maxOverdue: numOrNull(o["maxOverdue"]),
    aiSharePct: numOrNull(o["aiSharePct"]),
    resultRatePct: numOrNull(o["resultRatePct"]),
    passRatePct: numOrNull(o["passRatePct"]),
  };
}

export function parseDepartmentWeights(raw: unknown): Record<string, number> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    const n = numOrNull(v);
    if (n !== null && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return cur ? 100 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

export async function resolveTenantId(
  supabase: Db,
  userId: string,
  workspaceId?: string | null,
): Promise<string | null> {
  if (workspaceId) {
    const { data } = await supabase
      .from("workspaces")
      .select("tenant_id")
      .eq("id", workspaceId)
      .maybeSingle();
    return (data?.tenant_id as string | undefined) ?? null;
  }
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  return ((data ?? [])[0]?.tenant_id as string | undefined) ?? null;
}

export async function loadCeoOverview(
  supabase: Db,
  tenantId: string,
  period: CeoPeriod,
  workspaceId?: string | null,
): Promise<CeoOverview> {
  const days = PERIOD_DAYS[period];
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString();

  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
    workspaceId ? q.eq("workspace_id", workspaceId) : q;

  // KPI do CEO tự đặt (nếu có) — dùng để chấm điểm và để Bộ não AI bám theo.
  const kpiSettingsR = await supabase
    .from("ceo_kpi_settings")
    .select("targets, department_weights, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const kpiTargets = parseCeoKpiTargets(
    (kpiSettingsR.data as { targets?: unknown } | null)?.targets,
  );
  const kpiWeights = parseDepartmentWeights(
    (kpiSettingsR.data as { department_weights?: unknown } | null)?.department_weights,
  );
  const kpiUpdatedAt = ((kpiSettingsR.data as { updated_at?: string } | null)?.updated_at ??
    null) as string | null;

  const [tasksR, prevTasksR, execR, metricsR, meetingsR, workersR, wsR, proposalsR] =
    await Promise.all([
      scope(
        supabase
          .from("tasks")
          .select(
            "id, title, status, due_at, completed_at, created_at, updated_at, workspace_id, human_owner_id, ai_worker_id, execution_mode, progress_pct",
          )
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .gte("created_at", iso(prevFrom))
          .limit(2000),
      ),
      scope(
        supabase
          .from("tasks")
          .select("id, status, due_at, updated_at, ai_worker_id, title, workspace_id, progress_pct")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .limit(2000),
      ),
      scope(
        supabase
          .from("ai_task_executions")
          .select(
            "id, task_id, status, quality_passed, reviewed_at, created_at, ai_worker_id, workspace_id",
          )
          .eq("tenant_id", tenantId)
          .gte("created_at", iso(from))
          .limit(2000),
      ),
      scope(
        supabase
          .from("work_execution_metrics")
          .select("machine_duration_ms, wall_duration_ms, ai_worker_id, workspace_id, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", iso(from))
          .limit(2000),
      ),
      scope(
        supabase
          .from("meetings")
          .select("id, title, start_at, end_at, status, workspace_id, project_id")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .gte("start_at", iso(from))
          .limit(1000),
      ),
      supabase.from("ai_workers").select("id, name, role, code").eq("tenant_id", tenantId),
      supabase.from("workspaces").select("id, name").eq("tenant_id", tenantId),
      supabase
        .from("ai_action_proposals")
        .select(
          "id, title, status, created_at, action_type, source, risk, target_type, target_id, ai_worker_id, workspace_id, executed_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  type Task = {
    id: string;
    title?: string;
    status: string;
    due_at: string | null;
    completed_at?: string | null;
    created_at?: string;
    updated_at?: string;
    workspace_id: string | null;
    human_owner_id?: string | null;
    ai_worker_id?: string | null;
    execution_mode?: string | null;
    progress_pct?: number | null;
  };

  const windowTasks = (tasksR.data ?? []) as Task[];
  const allTasks = (prevTasksR.data ?? []) as Task[];
  const inRange = (d?: string | null) => !!d && d >= iso(from);
  const inPrev = (d?: string | null) => !!d && d >= iso(prevFrom) && d < iso(from);

  const cur = windowTasks.filter((t) => inRange(t.created_at));
  const prev = windowTasks.filter((t) => inPrev(t.created_at));
  const completedCur = windowTasks.filter((t) => inRange(t.completed_at)).length;
  const completedPrev = windowTasks.filter((t) => inPrev(t.completed_at)).length;

  const terminal = new Set(["done", "canceled"]);
  // Quá hạn tính trong kỳ xem KPI (ví dụ 7 ngày) để đồng bộ với ghi nhận giao ban từng sáng.
  const overdue = allTasks.filter(
    (t) =>
      t.due_at &&
      t.due_at < iso(now) &&
      t.due_at >= iso(from) &&
      !terminal.has(t.status),
  );
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length;

  const isAi = (t: Task) => !!t.ai_worker_id || t.execution_mode === "AI";
  const aiCur = cur.filter(isAi).length;
  const aiPrev = prev.filter(isAi).length;

  // Xu hướng: chia kỳ thành 8 mốc.
  const buckets = 8;
  const step = (days * 86_400_000) / buckets;
  const trend = Array.from({ length: buckets }, (_, i) => {
    const s = from.getTime() + i * step;
    const e = s + step;
    const inB = cur.filter((t) => {
      const at = new Date(t.created_at ?? 0).getTime();
      return at >= s && at < e;
    });
    return {
      label: new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
      human: inB.filter((t) => !isAi(t)).length,
      ai: inB.filter(isAi).length,
    };
  });

  type Exec = {
    id: string;
    task_id: string;
    status: string;
    quality_passed: boolean | null;
    reviewed_at: string | null;
    ai_worker_id: string | null;
  };
  const execs = (execR.data ?? []) as Exec[];
  const reviewed = execs.filter((e) => !!e.reviewed_at);
  const passed = execs.filter((e) => e.quality_passed === true);

  const metrics = (metricsR.data ?? []) as {
    machine_duration_ms: number | null;
    wall_duration_ms: number | null;
    ai_worker_id: string | null;
  }[];
  const aiMs = metrics.reduce((s, m) => s + (m.machine_duration_ms ?? m.wall_duration_ms ?? 0), 0);

  // LỊCH HỌP THẬT: chỉ tính cuộc họp ĐÃ DIỄN RA trong kỳ và chưa bị hủy.
  // Họp thiếu giờ kết thúc được tính mặc định 60 phút; họp tương lai không vào KPI.
  const DEFAULT_MEETING_MS = 60 * 60 * 1000;
  const CANCELED_MEETING = new Set(["canceled", "cancelled", "CANCELED", "CANCELLED"]);
  const meetingRows = (meetingsR.data ?? []) as {
    id: string;
    title: string | null;
    start_at: string;
    end_at: string | null;
    status: string | null;
    workspace_id: string | null;
  }[];
  const meetingDuration = (m: { start_at: string; end_at: string | null }) =>
    m.end_at
      ? Math.max(0, new Date(m.end_at).getTime() - new Date(m.start_at).getTime())
      : DEFAULT_MEETING_MS;
  const liveMeetings = meetingRows.filter((m) => !CANCELED_MEETING.has(m.status ?? ""));
  const pastMeetings = liveMeetings.filter(
    (m) => new Date(m.end_at ?? m.start_at).getTime() <= now.getTime(),
  );
  const upcomingMeetings = liveMeetings.filter(
    (m) => new Date(m.end_at ?? m.start_at).getTime() > now.getTime(),
  );
  const meetingMs = pastMeetings.reduce((s, m) => s + meetingDuration(m), 0);
  const upcomingMeetingMs = upcomingMeetings.reduce((s, m) => s + meetingDuration(m), 0);
  const nextMeeting = upcomingMeetings
    .slice()
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];

  // GIỜ NGƯỜI: việc hoàn thành tính đủ, việc đang chạy tính theo % tiến độ thật.
  const progressOf = (t: Task) => Math.min(100, Math.max(0, t.progress_pct ?? 0));
  const humanCompleted = windowTasks.filter((t) => inRange(t.completed_at) && !isAi(t)).length;
  const humanPartialHours = cur
    .filter((t) => !isAi(t) && !inRange(t.completed_at) && t.status !== "canceled")
    .reduce((s, t) => s + (progressOf(t) / 100) * HUMAN_HOURS_PER_TASK, 0);
  const humanHours =
    Math.round(
      (hours(meetingMs) + humanCompleted * HUMAN_HOURS_PER_TASK + humanPartialHours) * 10,
    ) / 10;
  const activeTasks = cur.filter((t) => !terminal.has(t.status));
  const avgProgressPct = activeTasks.length
    ? Math.round(activeTasks.reduce((s, t) => s + progressOf(t), 0) / activeTasks.length)
    : 0;
  const aiCompleted = windowTasks.filter((t) => inRange(t.completed_at) && isAi(t)).length;
  const savedHours = aiCompleted * HUMAN_HOURS_PER_TASK;

  // Bảng nhân sự: người + AI.
  const workers = (workersR.data ?? []) as { id: string; name: string; role: string | null }[];
  const humanIds = Array.from(
    new Set(cur.map((t) => t.human_owner_id).filter(Boolean) as string[]),
  );
  const nameMap = new Map<string, string>();
  if (humanIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", humanIds);
    for (const u of users ?? [])
      nameMap.set(
        u.id as string,
        (u.display_name as string) || (u.primary_email as string) || "Thành viên",
      );
  }

  const people: CeoPersonRow[] = [];
  for (const id of humanIds) {
    const mine = cur.filter((t) => t.human_owner_id === id && !isAi(t));
    const done = mine.filter((t) => inRange(t.completed_at)).length;
    people.push({
      id,
      name: nameMap.get(id) ?? "Thành viên",
      kind: "human",
      role: null,
      tasks: mine.length,
      completed: done,
      hours: Math.round(done * HUMAN_HOURS_PER_TASK * 10) / 10,
      hoursEstimated: true,
      reviewPassRate: null,
    });
  }
  for (const w of workers) {
    const mine = cur.filter((t) => t.ai_worker_id === w.id);
    const myExec = execs.filter((e) => e.ai_worker_id === w.id);
    const myReviewed = myExec.filter((e) => !!e.reviewed_at).length;
    const myPassed = myExec.filter((e) => e.quality_passed === true).length;
    const myMs = metrics
      .filter((m) => m.ai_worker_id === w.id)
      .reduce((s, m) => s + (m.machine_duration_ms ?? m.wall_duration_ms ?? 0), 0);
    if (!mine.length && !myExec.length) continue;
    people.push({
      id: w.id,
      name: w.name,
      kind: "ai",
      role: w.role,
      tasks: mine.length,
      completed: mine.filter((t) => inRange(t.completed_at)).length,
      hours: hours(myMs),
      hoursEstimated: false,
      reviewPassRate: myReviewed ? Math.round((myPassed / myReviewed) * 100) : null,
    });
  }
  people.sort((a, b) => b.tasks - a.tasks || b.hours - a.hours);

  const wsNames = new Map(
    ((wsR.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
  );
  const deptMap = new Map<
    string,
    { human: number; ai: number; completed: number; overdue: number; progressHours: number }
  >();
  for (const t of cur) {
    const key = t.workspace_id ?? "none";
    const row = deptMap.get(key) ?? {
      human: 0,
      ai: 0,
      completed: 0,
      overdue: 0,
      progressHours: 0,
    };
    if (t.status !== "done" && t.status !== "canceled")
      row.progressHours +=
        (Math.min(100, Math.max(0, t.progress_pct ?? 0)) / 100) * HUMAN_HOURS_PER_TASK;
    if (isAi(t)) row.ai += 1;
    else row.human += 1;
    if (t.status === "done") row.completed += 1;
    if (
      t.due_at &&
      t.status !== "done" &&
      t.status !== "canceled" &&
      new Date(t.due_at as string).getTime() < now.getTime() &&
      t.due_at >= iso(from)
    )
      row.overdue += 1;
    deptMap.set(key, row);
  }
  const deptProposals = new Map<string, number>();
  for (const p of (proposalsR.data ?? []) as { workspace_id: string | null }[]) {
    const key = p.workspace_id ?? "none";
    deptProposals.set(key, (deptProposals.get(key) ?? 0) + 1);
  }
  const departments = Array.from(deptMap.entries())
    .map(([id, v]) => ({
      id,
      name: wsNames.get(id) ?? "Khác",
      human: v.human,
      ai: v.ai,
      total: v.human + v.ai,
      weight: kpiWeights[id] ?? 1,
      completed: v.completed,
      overdue: v.overdue,
      aiSharePct: v.human + v.ai ? Math.round((v.ai / (v.human + v.ai)) * 100) : 0,
      hoursEstimated: Math.round((v.completed * HUMAN_HOURS_PER_TASK + v.progressHours) * 10) / 10,
      proposals: deptProposals.get(id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const issues: CeoIssue[] = [];
  for (const t of overdue.slice(0, 6)) {
    const late = Math.floor((now.getTime() - new Date(t.due_at as string).getTime()) / 86_400_000);
    issues.push({
      id: `overdue-${t.id}`,
      kind: "overdue",
      title: t.title ?? "Công việc",
      detail: `Quá hạn ${late} ngày · tiến độ ${t.progress_pct ?? 0}%`,
      href: `/tasks/${t.id}`,
      progressPct: t.progress_pct ?? 0,
      status: t.status,
    });
  }
  const stalled = allTasks.filter(
    (t) =>
      !terminal.has(t.status) &&
      t.updated_at &&
      now.getTime() - new Date(t.updated_at).getTime() > 7 * 86_400_000,
  );
  for (const t of stalled.slice(0, 5)) {
    const idle = Math.floor(
      (now.getTime() - new Date(t.updated_at as string).getTime()) / 86_400_000,
    );
    issues.push({
      id: `stalled-${t.id}`,
      kind: "stalled",
      title: t.title ?? "Công việc",
      detail: `Không cập nhật ${idle} ngày · tiến độ ${t.progress_pct ?? 0}%`,
      href: `/tasks/${t.id}`,
      progressPct: t.progress_pct ?? 0,
      status: t.status,
    });
  }
  type RawProposal = {
    id: string;
    title: string;
    created_at: string;
    status: string;
    action_type: string;
    source: string | null;
    risk: string | null;
    target_type: string | null;
    target_id: string | null;
    ai_worker_id: string | null;
    workspace_id: string | null;
    executed_at: string | null;
  };
  const allProposals = ((proposalsR.data ?? []) as RawProposal[]).filter(
    (p) => !workspaceId || !p.workspace_id || p.workspace_id === workspaceId,
  );
  const pendingProposals = allProposals.filter((p) => ["PROPOSED", "PREVIEWED"].includes(p.status));
  for (const p of pendingProposals.slice(0, 5)) {
    const waiting = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / 86_400_000);
    issues.push({
      id: `proposal-${p.id}`,
      kind: "pending_approval",
      title: p.title,
      detail: `Đề xuất chờ duyệt ${waiting} ngày`,
      href: "/ai-brain",
    });
  }
  // Đề xuất giao việc từ Bộ não AI cũng là một dòng KPI của Command Center.
  const ASSIGNMENT_ACTIONS = new Set([
    "CREATE_TASK",
    "PROPOSE_TASK",
    "ASSIGN_TASK",
    "UPDATE_TASK_FIELDS",
    "TRANSITION_TASK",
  ]);
  const workerNames = new Map(workers.map((w) => [w.id, w.name]));
  const taskTitles = new Map(allTasks.map((t) => [t.id, t.title ?? "Công việc"]));
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const propCur = allProposals.filter((p) => inRange(p.created_at));
  const propPrev = allProposals.filter((p) => inPrev(p.created_at));
  const propExecuted = propCur.filter((p) => p.status === "SUCCEEDED" || !!p.executed_at).length;
  const propRejected = propCur.filter((p) =>
    ["REJECTED", "CANCELLED", "EXPIRED", "FAILED"].includes(p.status),
  ).length;
  const proposalsBlock = {
    total: {
      current: propCur.length,
      previous: propPrev.length,
      changePct: pct(propCur.length, propPrev.length),
    },
    pending: pendingProposals.length,
    executed: propExecuted,
    rejected: propRejected,
    assignment: propCur.filter((p) => ASSIGNMENT_ACTIONS.has(p.action_type)).length,
    executionRate: propCur.length ? Math.round((propExecuted / propCur.length) * 100) : null,
    entries: allProposals.slice(0, 20).map((p) => ({
      id: p.id,
      title: p.title,
      actionType: p.action_type,
      status: p.status,
      source: p.source,
      risk: p.risk,
      createdAt: p.created_at,
      executedAt: p.executed_at,
      workerName: p.ai_worker_id ? (workerNames.get(p.ai_worker_id) ?? null) : null,
      taskTitle:
        p.target_type === "TASK" && p.target_id ? (taskTitles.get(p.target_id) ?? null) : null,
      taskId: p.target_type === "TASK" ? p.target_id : null,
      taskStatus:
        p.target_type === "TASK" && p.target_id
          ? (taskById.get(p.target_id)?.status ?? null)
          : null,
      taskProgressPct:
        p.target_type === "TASK" && p.target_id
          ? (taskById.get(p.target_id)?.progress_pct ?? null)
          : null,
      taskDueAt:
        p.target_type === "TASK" && p.target_id
          ? (taskById.get(p.target_id)?.due_at ?? null)
          : null,
      workspaceId: p.workspace_id,
    })),
  };

  const awaitingReview = execs.filter((e) => !e.reviewed_at && e.status !== "FAILED").length;
  if (awaitingReview)
    issues.push({
      id: "await-review",
      kind: "pending_review",
      title: "Kết quả AI chờ nghiệm thu",
      detail: `${awaitingReview} kết quả chưa được review`,
      href: "/work-products",
    });

  const leverage = humanHours
    ? Math.round(((humanHours + savedHours) / humanHours) * 100) / 100
    : null;
  const passRate = reviewed.length ? Math.round((passed.length / reviewed.length) * 100) : null;
  const resultRate = cur.length ? Math.round((execs.length / cur.length) * 100) : null;

  const aiShareNow = cur.length ? Math.round((aiCur / cur.length) * 100) : 0;
  const kpiActuals: Record<keyof CeoKpiTargets, number | null> = {
    completed: completedCur,
    maxOverdue: overdue.length,
    aiSharePct: aiShareNow,
    resultRatePct: resultRate,
    passRatePct: passRate,
  };
  const KPI_META: {
    key: keyof CeoKpiTargets;
    label: string;
    unit: string;
    direction: "up" | "down";
  }[] = [
    { key: "completed", label: "Việc hoàn thành trong kỳ", unit: "việc", direction: "up" },
    { key: "maxOverdue", label: "Việc quá hạn tối đa", unit: "việc", direction: "down" },
    { key: "aiSharePct", label: "Tỉ lệ AI đảm nhiệm", unit: "%", direction: "up" },
    { key: "resultRatePct", label: "Tỉ lệ việc có kết quả", unit: "%", direction: "up" },
    { key: "passRatePct", label: "Tỉ lệ kết quả đạt review", unit: "%", direction: "up" },
  ];
  const kpiRows: CeoKpiRow[] = KPI_META.map((m) => {
    const target = kpiTargets[m.key];
    const actual = kpiActuals[m.key];
    let achievedPct: number | null = null;
    let ok: boolean | null = null;
    if (target !== null && actual !== null) {
      if (m.direction === "up") {
        achievedPct = target > 0 ? Math.round((actual / target) * 100) : actual > 0 ? 100 : null;
        ok = actual >= target;
      } else {
        achievedPct = actual <= target ? 100 : target > 0 ? Math.round((target / actual) * 100) : 0;
        ok = actual <= target;
      }
    }
    return { ...m, target, actual, achievedPct, ok };
  });
  const scored = kpiRows.filter((r) => r.achievedPct !== null);
  const kpiBlock = {
    configured: kpiRows.some((r) => r.target !== null),
    updatedAt: kpiUpdatedAt,
    targets: kpiTargets,
    rows: kpiRows,
    score: scored.length
      ? Math.round(
          scored.reduce((a, r) => a + Math.min(120, r.achievedPct ?? 0), 0) / scored.length,
        )
      : null,
  };
  for (const r of kpiRows) {
    if (r.ok === false) {
      issues.push({
        id: `kpi-${r.key}`,
        kind: "stalled",
        title: `KPI chưa đạt: ${r.label}`,
        detail: `Thực tế ${r.actual}${r.unit === "%" ? "%" : ` ${r.unit}`} so với mục tiêu ${r.target}${r.unit === "%" ? "%" : ` ${r.unit}`}`,
        href: "/ceo",
      });
    }
  }

  return {
    period,
    from: iso(from),
    to: iso(now),
    totals: {
      tasks: {
        current: cur.length,
        previous: prev.length,
        changePct: pct(cur.length, prev.length),
      },
      completed: {
        current: completedCur,
        previous: completedPrev,
        changePct: pct(completedCur, completedPrev),
      },
      inProgress,
      overdue: overdue.length,
    },
    split: {
      human: cur.length - aiCur,
      ai: aiCur,
      aiSharePct: cur.length ? Math.round((aiCur / cur.length) * 100) : 0,
      aiSharePrevPct: prev.length ? Math.round((aiPrev / prev.length) * 100) : 0,
      trend,
    },
    time: {
      aiHours: hours(aiMs),
      humanHours,
      meetingHours: hours(meetingMs),
      upcomingMeetingHours: hours(upcomingMeetingMs),
      upcomingMeetings: upcomingMeetings.length,
      nextMeeting: nextMeeting
        ? { title: nextMeeting.title ?? "Cuộc họp", startAt: nextMeeting.start_at }
        : null,
      avgProgressPct,
      savedHours,
      leverage,
    },
    quality: {
      tasksCreated: cur.length,
      withResult: execs.length,
      reviewed: reviewed.length,
      passed: passed.length,
      passRate,
      resultRate,
    },
    people: people.slice(0, 30),
    departments,
    kpi: kpiBlock,
    issues: issues.slice(0, 12),
    proposals: proposalsBlock,
    answers: {
      resources: [
        `${humanHours} giờ người (ước tính)`,
        `${hours(aiMs)} giờ AI (đo thật)`,
        `${hours(meetingMs)} giờ họp đã diễn ra (${pastMeetings.length} cuộc)`,
        `${hours(upcomingMeetingMs)} giờ họp sắp tới (${upcomingMeetings.length} cuộc, chưa tính KPI)`,
        `Tiến độ trung bình việc đang chạy: ${avgProgressPct}%`,
      ],
      outputs: [
        `${completedCur} việc hoàn thành`,
        `${execs.length} kết quả AI được tạo`,
        `${cur.length} việc mới trong kỳ`,
        `${proposalsBlock.assignment} đề xuất giao việc từ Bộ não AI`,
      ],
      changes: [
        passRate === null ? "Chưa có kết quả nào được review" : `${passRate}% kết quả đạt review`,
        `${overdue.length} việc đang quá hạn`,
        `${savedHours} giờ người được AI gánh thay (ước tính)`,
        proposalsBlock.executionRate === null
          ? "Chưa có đề xuất nào trong kỳ"
          : `${proposalsBlock.executionRate}% đề xuất trong kỳ đã được duyệt và thực thi`,
      ],
      value: [
        leverage === null ? "Chưa đủ dữ liệu đòn bẩy" : `Đòn bẩy AI ${leverage}×`,
        `AI đảm nhiệm ${cur.length ? Math.round((aiCur / cur.length) * 100) : 0}% khối lượng việc`,
        `${people.filter((p) => p.kind === "ai").length} nhân sự AI đang tham gia`,
      ],
    },
  };
}
