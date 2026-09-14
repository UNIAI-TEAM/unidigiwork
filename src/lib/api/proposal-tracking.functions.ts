// THEO DÕI ĐỀ XUẤT — chỉ đọc: phân loại đề xuất theo trạng thái (đang chờ / đã gán / đã xong),
// kèm tiến độ việc liên quan và mức ảnh hưởng KPI trong kỳ 7 ngày.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantId } from "./ceo.server";

const KPI_WINDOW_DAYS = 7;

export type ProposalBucket = "pending" | "assigned" | "done" | "closed";

export type ProposalTrackingRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  risk: string | null;
  createdAt: string;
  executedAt: string | null;
  expiresAt: string | null;
  bucket: ProposalBucket;
  auto: boolean;
  urgencyLevel: string | null;
  urgencyScore: number | null;
  priorityRank: number | null;
  assigneeName: string | null;
  aiWorkerName: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    progressPct: number;
    dueAt: string | null;
  } | null;
  kpi: {
    countsOverdue: boolean;
    countsCompleted: boolean;
    countsAiShare: boolean;
    inWindow: boolean;
  };
};

export type ProposalTrackingResult = {
  rows: ProposalTrackingRow[];
  summary: {
    total: number;
    pending: number;
    assigned: number;
    done: number;
    closed: number;
    avgProgressPct: number;
    kpiOverdue: number;
    kpiCompleted: number;
    kpiAiShare: number;
  };
};

const PENDING = new Set(["PROPOSED", "PREVIEWED", "CONFIRMED", "EXECUTING"]);
const CLOSED = new Set(["FAILED", "EXPIRED", "CANCELLED"]);
const TERMINAL_TASK = new Set(["done", "canceled"]);

type Row = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  risk: string | null;
  created_at: string;
  executed_at: string | null;
  expires_at: string | null;
  target_type: string | null;
  target_id: string | null;
  ai_worker_id: string | null;
  payload: Record<string, unknown> | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  progress_pct: number | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  ai_worker_id: string | null;
  execution_mode: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const listProposalTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ProposalTrackingResult> => {
    const empty: ProposalTrackingResult = {
      rows: [],
      summary: {
        total: 0,
        pending: 0,
        assigned: 0,
        done: 0,
        closed: 0,
        avgProgressPct: 0,
        kpiOverdue: 0,
        kpiCompleted: 0,
        kpiAiShare: 0,
      },
    };

    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId) return empty;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const from = new Date(now - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: proposalData } = await context.supabase
      .from("ai_action_proposals")
      .select(
        "id, title, description, status, risk, created_at, executed_at, expires_at, target_type, target_id, ai_worker_id, payload",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const proposals = (proposalData ?? []) as Row[];
    if (!proposals.length) return empty;

    const taskIds = [
      ...new Set(
        proposals
          .filter((p) => p.target_type === "TASK" && p.target_id)
          .map((p) => p.target_id as string),
      ),
    ];

    const tasks = new Map<string, Task>();
    if (taskIds.length) {
      const { data: taskData } = await context.supabase
        .from("tasks")
        .select(
          "id, title, status, progress_pct, due_at, completed_at, created_at, ai_worker_id, execution_mode",
        )
        .eq("tenant_id", tenantId)
        .in("id", taskIds);
      for (const t of (taskData ?? []) as Task[]) tasks.set(t.id, t);
    }

    const workerIds = [
      ...new Set(proposals.map((p) => p.ai_worker_id).filter((v): v is string => !!v)),
    ];
    const workerNames = new Map<string, string>();
    if (workerIds.length) {
      const { data: workerData } = await context.supabase
        .from("ai_workers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .in("id", workerIds);
      for (const w of (workerData ?? []) as { id: string; name: string }[]) {
        workerNames.set(w.id, w.name);
      }
    }

    const rows: ProposalTrackingRow[] = proposals.map((p) => {
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const task = p.target_id ? (tasks.get(p.target_id) ?? null) : null;
      const taskDone = !!task && TERMINAL_TASK.has(task.status);
      const assigned = !!p.ai_worker_id || !!str(payload["assigneeUserId"]);

      const bucket: ProposalBucket = CLOSED.has(p.status)
        ? "closed"
        : taskDone
          ? "done"
          : PENDING.has(p.status) && !assigned
            ? "pending"
            : assigned || p.status === "SUCCEEDED"
              ? "assigned"
              : "pending";

      const isAi = !!task && (!!task.ai_worker_id || task.execution_mode === "AI");
      const kpi = task
        ? {
            countsOverdue:
              !!task.due_at &&
              task.due_at < nowIso &&
              task.due_at >= from &&
              !TERMINAL_TASK.has(task.status),
            countsCompleted: !!task.completed_at && task.completed_at >= from,
            countsAiShare: isAi && !!task.created_at && task.created_at >= from,
            inWindow: !!task.created_at && task.created_at >= from,
          }
        : { countsOverdue: false, countsCompleted: false, countsAiShare: false, inWindow: false };

      return {
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        risk: p.risk,
        createdAt: p.created_at,
        executedAt: p.executed_at,
        expiresAt: p.expires_at,
        bucket,
        auto: payload["auto"] === true,
        urgencyLevel: str(payload["urgencyLevel"]),
        urgencyScore: num(payload["urgencyScore"]),
        priorityRank: num(payload["priorityRank"]),
        assigneeName: str(payload["assigneeName"]),
        aiWorkerName: p.ai_worker_id ? (workerNames.get(p.ai_worker_id) ?? null) : null,
        task: task
          ? {
              id: task.id,
              title: task.title,
              status: task.status,
              progressPct:
                task.status === "done"
                  ? 100
                  : Math.max(0, Math.min(100, task.progress_pct ?? 0)),
              dueAt: task.due_at,
            }
          : null,
        kpi,
      } satisfies ProposalTrackingRow;
    });

    // Sắp xếp: đang chờ trước, rồi đã gán, đã xong, đã đóng; trong nhóm theo ưu tiên/khẩn cấp.
    const order: Record<ProposalBucket, number> = { pending: 0, assigned: 1, done: 2, closed: 3 };
    rows.sort(
      (a, b) =>
        order[a.bucket] - order[b.bucket] ||
        (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0) ||
        b.createdAt.localeCompare(a.createdAt),
    );

    const withTask = rows.filter((r) => r.task);
    const summary = {
      total: rows.length,
      pending: rows.filter((r) => r.bucket === "pending").length,
      assigned: rows.filter((r) => r.bucket === "assigned").length,
      done: rows.filter((r) => r.bucket === "done").length,
      closed: rows.filter((r) => r.bucket === "closed").length,
      avgProgressPct: withTask.length
        ? Math.round(withTask.reduce((s, r) => s + (r.task?.progressPct ?? 0), 0) / withTask.length)
        : 0,
      kpiOverdue: rows.filter((r) => r.kpi.countsOverdue).length,
      kpiCompleted: rows.filter((r) => r.kpi.countsCompleted).length,
      kpiAiShare: rows.filter((r) => r.kpi.countsAiShare).length,
    };

    return { rows, summary };
  });
