// AI SKILLS — CRUD danh mục kỹ năng AI theo tenant, có thể gán riêng cho một workspace.
// RLS: chỉ thành viên tenant đọc/ghi (public.ai_skills). Kỹ năng hệ thống không cho xóa/đổi mã.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { AI_ACTION_TYPES, AI_ACTION_SOURCES } from "@/domain/ai-actions/contracts";
import { AI_SKILL_KINDS } from "@/domain/workflow-agents/skills";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

const SkillInput = z.object({
  id: z.string().uuid().nullish(),
  workspaceId: z.string().uuid().nullable().optional(),
  /** null = dùng chung toàn tenant, uuid = gán riêng workspace. */
  scopeWorkspaceId: z.string().uuid().nullable().default(null),
  code: z.string().regex(/^[A-Z0-9_]{2,60}$/, "Mã kỹ năng chỉ gồm A-Z, 0-9 và _"),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(AI_SKILL_KINDS),
  description: z.string().max(2000).default(""),
  example: z.string().max(500).default(""),
  actionTypes: z.array(z.enum(AI_ACTION_TYPES)).default([]),
  sources: z.array(z.enum(AI_ACTION_SOURCES)).default([]),
  enabled: z.boolean().default(true),
});

async function resolveTenant(context: any, workspaceId: string) {
  const { data, error } = await context.supabase
    .from("workspaces")
    .select("id, tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
  return data.tenant_id as string;
}

async function resolveTenantFlexible(context: any, workspaceId: string | null) {
  if (workspaceId) return resolveTenant(context, workspaceId);
  const { data } = await context.supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .limit(2);
  const rows = (data ?? []) as { tenant_id: string }[];
  if (rows.length !== 1) throw fail("WORKSPACE_NOT_FOUND", "Hãy chọn một không gian làm việc.");
  return rows[0]!.tenant_id;
}

export const listAiSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    const { data: rows, error } = await context.supabase
      .from("ai_skills")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .or(
        data.workspaceId
          ? `workspace_id.is.null,workspace_id.eq.${data.workspaceId}`
          : "workspace_id.is.null,workspace_id.not.is.null",
      )
      .order("is_system", { ascending: false })
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw fail("AI_SKILL_LIST_FAILED", error.message);
    return rows ?? [];
  });

export const saveAiSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SkillInput.parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    if (data.scopeWorkspaceId && data.scopeWorkspaceId !== data.workspaceId) {
      await resolveTenant(context, data.scopeWorkspaceId);
    }

    const row = {
      tenant_id: tenantId,
      workspace_id: data.scopeWorkspaceId,
      code: data.code,
      name: data.name,
      kind: data.kind,
      description: data.description,
      example: data.example,
      action_types: data.actionTypes,
      sources: Array.from(new Set([...data.sources, "WORKFLOW_AGENT"])),
      enabled: data.enabled,
      updated_by: context.userId,
    };

    if (data.id) {
      const { data: current, error: curErr } = await context.supabase
        .from("ai_skills")
        .select("id, is_system, code")
        .eq("id", data.id)
        .maybeSingle();
      if (curErr || !current) throw fail("AI_SKILL_NOT_FOUND", "Không tìm thấy kỹ năng.");
      if (current.is_system && current.code !== data.code) {
        throw fail("AI_SKILL_SYSTEM_LOCKED", "Không thể đổi mã của kỹ năng hệ thống.");
      }
      const { data: updated, error } = await context.supabase
        .from("ai_skills")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .maybeSingle();
      if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("ai_skills")
      .insert({ ...row, is_system: false, created_by: context.userId })
      .select("*")
      .maybeSingle();
    if (error) {
      throw fail(
        "AI_SKILL_SAVE_FAILED",
        error.code === "23505" ? "Mã kỹ năng đã tồn tại trong phạm vi này." : error.message,
      );
    }
    return inserted;
  });

export const setAiSkillEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ skillId: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_skills")
      .update({ enabled: data.enabled, updated_by: context.userId })
      .eq("id", data.skillId);
    if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
    return { ok: true };
  });

export const deleteAiSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ skillId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: current, error: curErr } = await context.supabase
      .from("ai_skills")
      .select("id, is_system")
      .eq("id", data.skillId)
      .maybeSingle();
    if (curErr || !current) throw fail("AI_SKILL_NOT_FOUND", "Không tìm thấy kỹ năng.");
    if (current.is_system) throw fail("AI_SKILL_SYSTEM_LOCKED", "Không thể xóa kỹ năng hệ thống.");
    const { error } = await context.supabase
      .from("ai_skills")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.skillId);
    if (error) throw fail("AI_SKILL_DELETE_FAILED", error.message);
    return { ok: true };
  });

/** Người dùng có được sửa hồ sơ kỹ năng không: quản trị nền tảng hoặc chủ/quản trị tổ chức. */
export const getAiSkillsPermission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ canEdit: boolean }> => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    const { data: platform } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (platform) return { canEdit: true };
    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    const role = (member?.role as string) ?? "member";
    return { canEdit: role === "tenant_owner" || role === "tenant_admin" };
  });

/** Nạp danh mục kỹ năng mặc định cho tổ chức (bỏ qua kỹ năng đã tồn tại). */
export const seedDefaultAiSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inserted: number }> => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    const { AI_SKILLS } = await import("@/domain/workflow-agents/skills");
    const { data: existing } = await context.supabase
      .from("ai_skills")
      .select("code")
      .eq("tenant_id", tenantId);
    const have = new Set(((existing ?? []) as { code: string }[]).map((r) => r.code));
    const rows = AI_SKILLS.filter((s) => !have.has(s.id)).map((s) => ({
      tenant_id: tenantId,
      workspace_id: null,
      code: s.id,
      name: s.name,
      kind: s.kind,
      description: s.description,
      example: s.example,
      action_types: [...s.actionTypes],
      sources: Array.from(new Set([...s.sources, "WORKFLOW_AGENT"])),
      enabled: true,
      is_system: true,
      created_by: context.userId,
      updated_by: context.userId,
    }));
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await context.supabase.from("ai_skills").insert(rows as never);
    if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
    return { inserted: rows.length };
  });

/**
 * SKILL HUB — AI soạn bản nháp kỹ năng từ mô tả bằng lời của người dùng.
 * Chỉ trả về BẢN NHÁP, không ghi vào danh mục; người dùng phải xem lại và bấm lưu.
 */
export const draftAiSkillWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(5).max(1000),
        workspaceId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await resolveTenantFlexible(context, data.workspaceId ?? null);
    return draftSkillFromPrompt(data.prompt);
  });

type SkillDraft = {
  name: string;
  code: string;
  kind: string;
  description: string;
  example: string;
  actionTypes: string[];
};

/** Gọi AI Gateway để soạn bản nháp kỹ năng; luôn stream vì đây là mô hình suy luận. */
async function draftSkillFromPrompt(prompt: string): Promise<SkillDraft> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw fail("AI_PROVIDER_UNAVAILABLE", "Trợ lý AI hiện chưa sẵn sàng.");

  const { streamText } = await import("ai");
  const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
  const provider = createLovableResponsesProvider(apiKey);

  const result = streamText({
    model: provider.responses("openai/gpt-5.6-sol"),
    system:
      "Bạn là trợ lý thiết kế kỹ năng AI cho nền tảng công việc UNIWORK. " +
      "Người dùng mô tả một việc lặp đi lặp lại; bạn soạn định nghĩa kỹ năng ngắn gọn bằng tiếng Việt. " +
      "CHỈ trả về JSON thuần, không rào ```: " +
      '{"name":string,"code":string,"kind":string,"description":string,"example":string,"actionTypes":string[]}. ' +
      `code: CHỮ HOA A-Z 0-9 _ (2-40 ký tự). kind ∈ ${AI_SKILL_KINDS.join("|")}. ` +
      "description: 1-3 câu nêu khi nào chạy, làm gì, trả về gì. example: 1 câu ví dụ người dùng yêu cầu. " +
      `actionTypes: chỉ chọn trong ${AI_ACTION_TYPES.join(",")}; để mảng rỗng nếu kỹ năng chỉ tra cứu/phân tích/soạn thảo.`,
    prompt,
  });

  const text = (await result.text) ?? "";
  const raw = text.replace(/```json|```/g, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw fail("AI_ERROR", "AI chưa soạn được kỹ năng, hãy thử lại.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw fail("AI_ERROR", "AI chưa soạn được kỹ năng, hãy thử lại.");
  }

  const kinds = AI_SKILL_KINDS as readonly string[];
  const actions = AI_ACTION_TYPES as readonly string[];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const code =
    str(parsed["code"], 40)
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "") || "SKILL_MOI";
  const kind = kinds.includes(String(parsed["kind"])) ? String(parsed["kind"]) : "ANALYSIS";
  const actionTypes = Array.isArray(parsed["actionTypes"])
    ? (parsed["actionTypes"] as unknown[]).map(String).filter((a) => actions.includes(a))
    : [];

  return {
    name: str(parsed["name"], 200) || "Kỹ năng mới",
    code: code.length >= 2 ? code : "SKILL_MOI",
    kind,
    description: str(parsed["description"], 2000),
    example: str(parsed["example"], 500),
    actionTypes,
  };
}

/** Người dùng có quyền quản trị danh mục kỹ năng của tổ chức không. */
async function assertCanEditSkills(context: any, tenantId: string) {
  const { data: platform } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (platform) return;
  const { data: member } = await context.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .eq("status", "active")
    .maybeSingle();
  const role = (member?.role as string) ?? "member";
  if (role !== "tenant_owner" && role !== "tenant_admin") {
    throw fail("FORBIDDEN", "Chỉ quản trị tổ chức mới thêm được kỹ năng.");
  }
}

/**
 * SKILL HUB — học kỹ năng mới từ một đề xuất AI ĐÃ DUYỆT trong Bộ não AI.
 * Đề xuất phải thuộc tổ chức hiện tại và đã ở trạng thái thực thi thành công.
 * Kỹ năng được lưu thẳng vào danh mục (không phải kỹ năng hệ thống), mã trùng thì tự thêm hậu tố.
 */
export const createAiSkillFromProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        proposalId: z.string().uuid(),
        workspaceId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    await assertCanEditSkills(context, tenantId);

    const { data: proposal } = await context.supabase
      .from("ai_action_proposals")
      .select("id, tenant_id, title, description, action_type, status, risk, source")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (!proposal || proposal.tenant_id !== tenantId) {
      throw fail("NOT_FOUND", "Không tìm thấy đề xuất trong tổ chức này.");
    }
    if (proposal.status !== "SUCCEEDED") {
      throw fail("INVALID_STATE", "Chỉ học được kỹ năng từ đề xuất đã duyệt và thực hiện xong.");
    }

    const draft = await draftSkillFromPrompt(
      [
        "Một đề xuất AI đã được người dùng duyệt và thực hiện thành công.",
        `Tiêu đề: ${proposal.title ?? ""}`,
        `Mô tả: ${proposal.description ?? ""}`,
        `Loại hành động: ${proposal.action_type ?? ""}`,
        `Mức rủi ro: ${proposal.risk ?? ""}`,
        "Hãy soạn một kỹ năng tái sử dụng để lần sau AI tự nhận ra tình huống tương tự và đề xuất lại.",
      ].join("\n"),
    );

    // Ưu tiên giữ đúng loại hành động của đề xuất gốc.
    const actions = AI_ACTION_TYPES as readonly string[];
    const originAction = String(proposal.action_type ?? "");
    const actionTypes = Array.from(
      new Set([...draft.actionTypes, ...(actions.includes(originAction) ? [originAction] : [])]),
    );

    const { data: existing } = await context.supabase
      .from("ai_skills")
      .select("code")
      .eq("tenant_id", tenantId);
    const taken = new Set(((existing ?? []) as { code: string }[]).map((r) => r.code));
    let code = draft.code.slice(0, 55);
    let n = 2;
    while (taken.has(code)) code = `${draft.code.slice(0, 52)}_${n++}`;

    const { data: inserted, error } = await context.supabase
      .from("ai_skills")
      .insert({
        tenant_id: tenantId,
        workspace_id: null,
        code,
        name: draft.name,
        kind: draft.kind,
        description: draft.description,
        example: draft.example,
        action_types: actionTypes,
        sources: ["WORKFLOW_AGENT"],
        enabled: true,
        is_system: false,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, code, name")
      .maybeSingle();
    if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
    return inserted;
  });

/**
 * SKILL HUB — "đào tạo lại" danh mục kỹ năng từ DỮ LIỆU THẬT của tổ chức:
 * công việc, cuộc họp, thông báo gần đây và các đề xuất đã duyệt.
 * AI đề xuất tối đa 5 kỹ năng mới; kỹ năng trùng mã/tên sẽ bị bỏ qua.
 */
export const retrainAiSkillsFromWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantFlexible(context, data.workspaceId ?? null);
    await assertCanEditSkills(context, tenantId);

    const [tasksRes, meetingsRes, notifsRes, proposalsRes, skillRes] = await Promise.all([
      context.supabase
        .from("tasks")
        .select(
          "title, status, priority, due_at, tags, updated_at, created_at, progress_pct, start_at, end_at",
        )
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(40),
      context.supabase
        .from("meetings")
        .select("title, agenda, start_at, end_at, location, status, project_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .limit(15),
      context.supabase
        .from("notifications")
        .select("type, title")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30),
      context.supabase
        .from("ai_action_proposals")
        .select("title, action_type, status")
        .eq("tenant_id", tenantId)
        .eq("status", "SUCCEEDED")
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("ai_skills")
        .select("code, name")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null),
    ]);

    const tasks = (tasksRes.data ?? []) as {
      title: string;
      status: string;
      priority: string | null;
      due_at: string | null;
      tags: string[] | null;
      updated_at: string | null;
      created_at: string | null;
      progress_pct: number | null;
      start_at: string | null;
      end_at: string | null;
    }[];
    const meetings = (meetingsRes.data ?? []) as {
      title: string;
      agenda: string | null;
      start_at: string;
      end_at: string | null;
      location: string | null;
      status: string | null;
      project_id: string | null;
    }[];
    // Tên dự án của các cuộc họp, để đề xuất bám lịch họp thật.
    const meetingProjectIds = Array.from(
      new Set(meetings.map((m) => m.project_id).filter((v): v is string => Boolean(v))),
    );
    const meetingProjectName = new Map<string, string>();
    if (meetingProjectIds.length) {
      const projRes = await context.supabase
        .from("projects")
        .select("id, name")
        .in("id", meetingProjectIds);
      for (const p of (projRes.data ?? []) as { id: string; name: string }[]) {
        meetingProjectName.set(p.id, p.name);
      }
    }
    // Thảo luận thật trong dự án: ghi chú dự án + bình luận dự án.
    const [projNotesRes, projCommentsRes] = await Promise.all([
      context.supabase
        .from("projects")
        .select("id, name, notes, description, status")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("project_comments")
        .select("project_id, body, author_id, created_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    const projectRows = (projNotesRes.data ?? []) as {
      id: string;
      name: string;
      notes: string | null;
      description: string | null;
      status: string | null;
    }[];
    const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
    for (const [pid, pname] of projectName) meetingProjectName.set(pid, pname);
    const projectComments = (projCommentsRes.data ?? []) as {
      project_id: string;
      body: string;
      author_id: string;
      created_at: string;
    }[];
    const commentAuthorName = new Map<string, string>();
    const commentAuthorIds = Array.from(new Set(projectComments.map((c) => c.author_id)));
    if (commentAuthorIds.length) {
      const uRes = await context.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", commentAuthorIds);
      for (const u of (uRes.data ?? []) as {
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }[]) {
        commentAuthorName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
      }
    }
    const projectNoteLines = projectRows
      .filter((p) => (p.notes ?? "").trim() || (p.description ?? "").trim())
      .map(
        (p) =>
          `- [${p.name}${p.status ? "/" + p.status : ""}] ${(p.notes || p.description || "")
            .replace(/\s+/g, " ")
            .slice(0, 300)}`,
      );
    const projectCommentLines = projectComments.map(
      (c) =>
        `- [${projectName.get(c.project_id) ?? "Dự án"}] ${
          commentAuthorName.get(c.author_id) ?? "Thành viên"
        } (${c.created_at.slice(0, 10)}): ${c.body.replace(/\s+/g, " ").slice(0, 240)}`,
    );

    const notifs = (notifsRes.data ?? []) as { type: string; title: string }[];
    const proposals = (proposalsRes.data ?? []) as { title: string; action_type: string }[];
    const existing = (skillRes.data ?? []) as { code: string; name: string }[];

    // Vai trò thực tế: công việc đang được giao cho từng nhân sự AI.
    const [workersRes, aiTasksRes] = await Promise.all([
      context.supabase.from("ai_workers").select("id, name, role").eq("tenant_id", tenantId),
      context.supabase
        .from("tasks")
        .select("title, status, due_at, ai_worker_id, ai_execution_status")
        .eq("tenant_id", tenantId)
        .not("ai_worker_id", "is", null)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(60),
    ]);
    const aiWorkers = (workersRes.data ?? []) as { id: string; name: string; role: string }[];
    const aiTasks = (aiTasksRes.data ?? []) as {
      title: string;
      status: string;
      due_at: string | null;
      ai_worker_id: string | null;
      ai_execution_status: string | null;
    }[];
    const roleLines = aiWorkers
      .map((w) => {
        const own = aiTasks.filter((t) => t.ai_worker_id === w.id);
        if (!own.length) return "";
        return [
          `- ${w.name} (${w.role}) đang phụ trách ${own.length} việc:`,
          ...own
            .slice(0, 8)
            .map(
              (t) =>
                `  · ${t.title} [${t.status}${t.ai_execution_status ? "/" + t.ai_execution_status : ""}${t.due_at ? "/hạn " + t.due_at.slice(0, 10) : ""}]`,
            ),
        ].join("\n");
      })
      .filter(Boolean);

    // DÒNG THỜI GIAN HOẠT ĐỘNG: ai làm gì, khi nào, kết quả ra sao.
    const [auditRes, execRes, commentRes] = await Promise.all([
      context.supabase
        .from("audit_events")
        .select("action, event_type, resource_type, actor_user_id, occurred_at")
        .eq("tenant_id", tenantId)
        .order("occurred_at", { ascending: false })
        .limit(60),
      context.supabase
        .from("ai_task_executions")
        .select(
          "deliverable_title, status, quality_status, quality_score, completed_at, created_at, created_by",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("task_comments")
        .select("body, author_id, created_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    const audits = (auditRes.data ?? []) as {
      action: string | null;
      event_type: string | null;
      resource_type: string | null;
      actor_user_id: string | null;
      occurred_at: string;
    }[];
    const execs = (execRes.data ?? []) as {
      deliverable_title: string | null;
      status: string;
      quality_status: string | null;
      quality_score: number | null;
      completed_at: string | null;
      created_at: string;
      created_by: string | null;
    }[];
    const comments = (commentRes.data ?? []) as {
      body: string;
      author_id: string | null;
      created_at: string;
    }[];
    const actorIds = [
      ...new Set(
        [
          ...audits.map((a) => a.actor_user_id),
          ...execs.map((e) => e.created_by),
          ...comments.map((c) => c.author_id),
        ].filter(Boolean) as string[],
      ),
    ].slice(0, 60);
    const actorName = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await context.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", actorIds);
      for (const u of (users ?? []) as {
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }[]) {
        actorName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
      }
    }
    const who = (id: string | null) => (id ? (actorName.get(id) ?? "Thành viên") : "Hệ thống");
    const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "chưa rõ");
    const timelineLines = [
      ...audits
        .slice(0, 30)
        .map(
          (a) =>
            `- ${when(a.occurred_at)} · ${who(a.actor_user_id)} · ${a.action ?? a.event_type ?? "hành động"}${a.resource_type ? " trên " + a.resource_type : ""}`,
        ),
      ...execs.map(
        (e) =>
          `- ${when(e.completed_at ?? e.created_at)} · ${who(e.created_by)} · AI thực thi "${e.deliverable_title ?? "kết quả"}" → ${e.status}${e.quality_status ? "/" + e.quality_status : ""}${e.quality_score != null ? "/điểm " + e.quality_score : ""}`,
      ),
      ...comments.map(
        (c) =>
          `- ${when(c.created_at)} · ${who(c.author_id)} · bình luận: ${c.body.replace(/\s+/g, " ").slice(0, 120)}`,
      ),
    ];

    const sampled = tasks.length + meetings.length + notifs.length + proposals.length;
    if (sampled === 0) {
      throw fail(
        "NO_DATA",
        "Chưa có công việc, cuộc họp hay thông báo nào để AI học. Hãy thêm dữ liệu rồi thử lại.",
      );
    }

    const now = Date.now();
    const DAY = 86_400_000;
    const overdue = tasks.filter(
      (t) => t.due_at && new Date(t.due_at).getTime() < now && t.status !== "done",
    ).length;
    const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    const done = byStatus["done"] ?? 0;
    const inProgress = byStatus["in_progress"] ?? 0;
    const blocked = byStatus["blocked"] ?? 0;
    const todo = byStatus["todo"] ?? 0;
    const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const stale = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "canceled" &&
        t.updated_at &&
        now - new Date(t.updated_at).getTime() > 7 * DAY,
    );
    const dueSoon = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "canceled" &&
        t.due_at &&
        new Date(t.due_at).getTime() >= now &&
        new Date(t.due_at).getTime() <= now + 7 * DAY,
    );
    const noDue = tasks.filter(
      (t) => !t.due_at && t.status !== "done" && t.status !== "canceled",
    ).length;
    const progressLines = [
      "TIẾN ĐỘ THỰC TẾ:",
      `- Phân bố trạng thái: chờ làm ${todo}, đang làm ${inProgress}, bị chặn ${blocked}, hoàn thành ${done}, tỉ lệ hoàn thành ${completionRate}%.`,
      `- Quá hạn: ${overdue}. Đến hạn trong 7 ngày: ${dueSoon.length}. Chưa đặt hạn: ${noDue}. Không cập nhật quá 7 ngày: ${stale.length}.`,
      ...stale
        .slice(0, 10)
        .map(
          (t) =>
            `- Ì ạch: ${t.title} [${t.status}] cập nhật lần cuối ${(t.updated_at ?? "").slice(0, 10)}`,
        ),
      ...dueSoon
        .slice(0, 10)
        .map((t) => `- Sắp đến hạn: ${t.title} [${t.status}] hạn ${(t.due_at ?? "").slice(0, 10)}`),
    ];

    const corpus = [
      `Số liệu: ${tasks.length} công việc gần đây (${overdue} quá hạn), ${meetings.length} cuộc họp, ${notifs.length} thông báo, ${proposals.length} đề xuất đã duyệt.`,
      ...progressLines,
      ...(roleLines.length ? ["VAI TRÒ NHÂN SỰ AI (việc đang được giao):", ...roleLines] : []),
      ...(timelineLines.length
        ? ["DÒNG THỜI GIAN HOẠT ĐỘNG (ai làm gì, khi nào, kết quả):", ...timelineLines]
        : []),
      "CÔNG VIỆC:",
      ...tasks.map(
        (t) =>
          `- ${t.title} [${t.status}${t.priority ? "/" + t.priority : ""}${
            t.due_at ? "/hạn " + t.due_at.slice(0, 10) : ""
          }]${(t.tags ?? []).length ? " #" + (t.tags ?? []).join(" #") : ""}`,
      ),
      "CUỘC HỌP:",
      ...meetings.map((m) => {
        const proj = m.project_id ? meetingProjectName.get(m.project_id) : null;
        const when = m.start_at ? m.start_at.slice(0, 16).replace("T", " ") : "";
        return `- ${m.title}${proj ? " [dự án: " + proj + "]" : ""}${
          when ? " @" + when : ""
        }${m.location ? " tại " + m.location : ""}${m.status ? " (" + m.status + ")" : ""}${
          m.agenda ? ": " + m.agenda.slice(0, 160) : ""
        }`;
      }),
      ...(projectNoteLines.length ? ["GHI CHÚ DỰ ÁN:", ...projectNoteLines] : []),
      ...(projectCommentLines.length
        ? ["THẢO LUẬN TRONG DỰ ÁN (bình luận thật):", ...projectCommentLines]
        : []),
      "THÔNG BÁO:",
      ...notifs.map((n) => `- [${n.type}] ${n.title}`),
      "ĐỀ XUẤT ĐÃ DUYỆT:",
      ...proposals.map((p) => `- [${p.action_type}] ${p.title}`),
      "KỸ NĂNG ĐÃ CÓ (không lặp lại):",
      ...existing.map((s) => `- ${s.code}: ${s.name}`),
    ]
      .join("\n")
      .slice(0, 12000);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw fail("AI_PROVIDER_UNAVAILABLE", "Trợ lý AI hiện chưa sẵn sàng.");
    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);

    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", store: false },
      },
      system:
        "Bạn thiết kế kỹ năng AI cho nền tảng công việc UNIWORK dựa trên dữ liệu thật của một tổ chức. " +
        "Tìm các tình huống LẶP LẠI trong dữ liệu và đề xuất tối đa 5 kỹ năng thực sự hữu ích, bằng tiếng Việt. " +
        'CHỈ trả về JSON thuần dạng {"skills":[{"name":string,"code":string,"kind":string,"description":string,"example":string,"actionTypes":string[]}]}. ' +
        `code: CHỮ HOA A-Z 0-9 _ (2-40 ký tự), không trùng kỹ năng đã có. kind ∈ ${AI_SKILL_KINDS.join("|")}. ` +
        `actionTypes: chỉ trong ${AI_ACTION_TYPES.join(",")}; rỗng nếu chỉ tra cứu/phân tích/soạn thảo. ` +
        "Ưu tiên các kỹ năng bám sát TIẾN ĐỘ THỰC TẾ: việc quá hạn, việc bị chặn, việc ì ạch không cập nhật, việc sắp đến hạn, việc thiếu hạn. " +
        "Đọc kỹ DÒNG THỜI GIAN HOẠT ĐỘNG để hiểu ai thường làm gì, vào lúc nào và kết quả ra sao; ưu tiên kỹ năng lặp lại theo thói quen làm việc thật đó. " +
        "description phải nhắc tới bằng chứng cụ thể quan sát được trong dữ liệu (tên việc, trạng thái, số liệu tiến độ).",
      prompt: corpus,
    });

    const text = (await result.text) ?? "";
    const raw = text.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw fail("AI_ERROR", "AI chưa học được kỹ năng, hãy thử lại.");
    let parsed: { skills?: unknown };
    try {
      parsed = JSON.parse(raw.slice(start, end + 1)) as { skills?: unknown };
    } catch {
      throw fail("AI_ERROR", "AI chưa học được kỹ năng, hãy thử lại.");
    }

    const kinds = AI_SKILL_KINDS as readonly string[];
    const actions = AI_ACTION_TYPES as readonly string[];
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const takenCodes = new Set(existing.map((s) => s.code));
    const takenNames = new Set(existing.map((s) => s.name.toLowerCase()));

    const rows: Record<string, unknown>[] = [];
    for (const item of (Array.isArray(parsed.skills) ? parsed.skills : []).slice(0, 5)) {
      const s = item as Record<string, unknown>;
      const name = str(s["name"], 200);
      if (!name || takenNames.has(name.toLowerCase())) continue;
      let code =
        str(s["code"], 40)
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, "_")
          .replace(/^_+|_+$/g, "") || "SKILL_HOC";
      let n = 2;
      const base = code.slice(0, 52);
      while (takenCodes.has(code)) code = `${base}_${n++}`;
      takenCodes.add(code);
      takenNames.add(name.toLowerCase());
      rows.push({
        tenant_id: tenantId,
        workspace_id: null,
        code,
        name,
        kind: kinds.includes(String(s["kind"])) ? String(s["kind"]) : "ANALYSIS",
        description: str(s["description"], 2000),
        example: str(s["example"], 500),
        action_types: Array.isArray(s["actionTypes"])
          ? (s["actionTypes"] as unknown[]).map(String).filter((a) => actions.includes(a))
          : [],
        sources: ["WORKFLOW_AGENT"],
        enabled: true,
        is_system: false,
        created_by: context.userId,
        updated_by: context.userId,
      });
    }

    if (rows.length > 0) {
      const { error } = await context.supabase.from("ai_skills").insert(rows as never);
      if (error) throw fail("AI_SKILL_SAVE_FAILED", error.message);
    }

    return {
      created: rows.length,
      names: rows.map((r) => r["name"] as string),
      sampled: {
        tasks: tasks.length,
        overdueTasks: overdue,
        meetings: meetings.length,
        notifications: notifs.length,
        approvedProposals: proposals.length,
      },
    };
  });
