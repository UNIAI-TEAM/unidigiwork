// WORKFLOW & AGENT BUILDER V1 — CRUD agent + đánh giá điều kiện (chỉ đọc).
// Agent KHÔNG ghi dữ liệu nghiệp vụ: mọi thay đổi đi qua lớp AI Action (propose → confirm).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import {
  AgentInputSchema,
  AGENT_TRIGGER_ENTITY,
  evaluateConditions,
  isAgentActionAllowed,
  normalizeAllowedActionTypes,
  normalizeAllowedSources,
  type AgentCandidate,
  type AgentCondition,
} from "@/domain/workflow-agents/contracts";
import { AI_ACTION_TYPES, AI_ACTION_SOURCES, type AiActionType, type AiActionSource } from "@/domain/ai-actions/contracts";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

const DAY = 86_400_000;

async function loadAgent(context: any, agentId: string) {
  const { data, error } = await context.supabase
    .from("workflow_agents")
    .select("*")
    .eq("id", agentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fail("AGENT_NOT_FOUND", error.message);
  if (!data) throw fail("AGENT_NOT_FOUND", "Không tìm thấy agent.");
  return data;
}

export const listWorkflowAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("workflow_agents")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw fail("AGENT_LIST_FAILED", error.message);
    return rows ?? [];
  });

export const saveWorkflowAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AgentInputSchema.extend({ id: z.string().uuid().nullish() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ws, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("id, tenant_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wsErr || !ws) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");

    const row = {
      tenant_id: ws.tenant_id,
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.triggerType,
      conditions: data.conditions as never,
      action_type: data.actionType,
      allowed_action_types: Array.from(new Set([...data.allowedActionTypes, data.actionType])),
      allowed_sources: Array.from(new Set(data.allowedSources)),
      instruction: data.instruction,
      enabled: data.enabled,
      requires_approval: true,
      updated_by: context.userId,
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("workflow_agents")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .maybeSingle();
      if (error) throw fail("AGENT_SAVE_FAILED", error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("workflow_agents")
      .insert({ ...row, created_by: context.userId })
      .select("*")
      .maybeSingle();
    if (error) throw fail("AGENT_SAVE_FAILED", error.message);
    return inserted;
  });

export const setWorkflowAgentEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentId: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_agents")
      .update({ enabled: data.enabled, updated_by: context.userId })
      .eq("id", data.agentId);
    if (error) throw fail("AGENT_SAVE_FAILED", error.message);
    return { ok: true };
  });

export const deleteWorkflowAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_agents")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.agentId);
    if (error) throw fail("AGENT_DELETE_FAILED", error.message);
    return { ok: true };
  });

export interface AgentEvaluation {
  agentId: string;
  runId: string | null;
  evaluated: number;
  matches: AgentCandidate[];
}

/** Chạy điều kiện của agent trên dữ liệu thật. CHỈ ĐỌC — không tạo/sửa gì. */
export const evaluateWorkflowAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AgentEvaluation> => {
    const agent = await loadAgent(context, data.agentId);
    const conditions = (Array.isArray(agent.conditions) ? agent.conditions : []) as AgentCondition[];
    const now = Date.now();
    const entity = AGENT_TRIGGER_ENTITY[agent.trigger_type as keyof typeof AGENT_TRIGGER_ENTITY] ?? "TASK";
    let candidates: AgentCandidate[] = [];
    let evaluated = 0;

    if (entity === "TASK") {
      const { data: tasks, error } = await context.supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, updated_at")
        .eq("workspace_id", agent.workspace_id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw fail("AGENT_EVAL_FAILED", error.message);
      const ids = (tasks ?? []).map((t) => t.id);
      const assigneeCount = new Map<string, number>();
      if (ids.length) {
        const { data: as } = await context.supabase.from("task_assignees").select("task_id").in("task_id", ids);
        for (const a of as ?? []) assigneeCount.set(a.task_id, (assigneeCount.get(a.task_id) ?? 0) + 1);
      }
      const base = (t: any) => {
        const open = t.status !== "done" && t.status !== "canceled";
        const due = t.due_at ? new Date(t.due_at).getTime() : null;
        switch (agent.trigger_type) {
          case "TASK_OVERDUE": return open && due !== null && due < now;
          case "TASK_UNASSIGNED": return open && (assigneeCount.get(t.id) ?? 0) === 0;
          case "TASK_HIGH_PRIORITY": return open && (t.priority === "high" || t.priority === "urgent");
          default: return true;
        }
      };
      const pool = (tasks ?? []).filter(base);
      evaluated = tasks?.length ?? 0;
      candidates = pool
        .map((t) => {
          const due = t.due_at ? new Date(t.due_at).getTime() : null;
          const facts = {
            status: t.status,
            priority: t.priority,
            title: t.title,
            overdueDays: due !== null && due < now ? Math.floor((now - due) / DAY) : 0,
            dueInDays: due !== null ? Math.ceil((due - now) / DAY) : null,
            assigneeCount: assigneeCount.get(t.id) ?? 0,
          };
          return {
            id: t.id,
            title: t.title,
            facts,
            summary: `Công việc "${t.title}" (${t.status}, ưu tiên ${t.priority}${
              facts.overdueDays ? `, quá hạn ${facts.overdueDays} ngày` : ""
            })`,
          } satisfies AgentCandidate;
        })
        .filter((c) => evaluateConditions(c.facts, conditions))
        .slice(0, 20);
    } else {
      const { data: meetings, error } = await context.supabase
        .from("meetings")
        .select("id, title, status, end_at")
        .eq("workspace_id", agent.workspace_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw fail("AGENT_EVAL_FAILED", error.message);
      evaluated = meetings?.length ?? 0;
      candidates = (meetings ?? [])
        .map((m: any) => {
          const ended = m.end_at ?? null;
          const endedHoursAgo = ended ? Math.floor((now - new Date(ended).getTime()) / 3_600_000) : null;
          return {
            id: m.id,
            title: m.title ?? "Cuộc họp",
            facts: { title: m.title ?? "", endedHoursAgo, participantCount: 0 },
            summary: `Cuộc họp "${m.title ?? "Cuộc họp"}"${endedHoursAgo !== null ? ` kết thúc ${endedHoursAgo} giờ trước` : ""}`,
          } satisfies AgentCandidate;
        })
        .filter((c) => (c.facts.endedHoursAgo ?? -1) >= 0)
        .filter((c) => evaluateConditions(c.facts, conditions))
        .slice(0, 20);
    }

    const { data: run } = await context.supabase
      .from("workflow_agent_runs")
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        workspace_id: agent.workspace_id,
        status: candidates.length ? "EVALUATED" : "NO_MATCH",
        matched_count: candidates.length,
        matches: candidates.slice(0, 20) as never,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();

    return { agentId: agent.id, runId: run?.id ?? null, evaluated, matches: candidates };
  });

/** Ghi nhận vòng đời: đã sinh đề xuất / người dùng duyệt / từ chối. */
export const recordAgentProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        proposalId: z.string().uuid().nullish(),
        status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "FAILED"]),
        error: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const agent = await loadAgent(context, data.agentId);
    const { error } = await context.supabase.from("workflow_agent_runs").insert({
      tenant_id: agent.tenant_id,
      agent_id: agent.id,
      workspace_id: agent.workspace_id,
      status: data.status,
      matched_count: 1,
      proposal_id: data.proposalId ?? null,
      error: data.error ?? null,
      created_by: context.userId,
    });
    if (error) throw fail("AGENT_RUN_FAILED", error.message);
    return { ok: true };
  });

export const listWorkflowAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ agentId: z.string().uuid().nullish(), workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("workflow_agent_runs")
      .select("id, agent_id, status, matched_count, proposal_id, error, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw fail("AGENT_RUN_LIST_FAILED", error.message);
    return rows ?? [];
  });

/** Chốt chặn server-side: agent chỉ được sinh đề xuất nằm trong allowlist của chính nó. */
export const assertAgentActionAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        actionType: z.enum(AI_ACTION_TYPES),
        source: z.enum(AI_ACTION_SOURCES).default("WORKFLOW_AGENT"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const agent = await loadAgent(context, data.agentId);
    if (!isAgentActionAllowed(agent as never, data.actionType as AiActionType, data.source as AiActionSource)) {
      throw fail("AGENT_ACTION_NOT_ALLOWED", "Hành động hoặc nguồn này không nằm trong allowlist của agent.");
    }
    return {
      ok: true as const,
      allowedActionTypes: normalizeAllowedActionTypes((agent as any).allowed_action_types),
      allowedSources: normalizeAllowedSources((agent as any).allowed_sources),
    };
  });