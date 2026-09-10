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
    const { error } = await context.supabase.from("ai_skills").insert(rows);
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
      prompt: `Mô tả của người dùng:\n${data.prompt}`,
    });

    const text = (await result.text) ?? "";
    const raw = text.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw fail("AI_ERROR", "AI chưa soạn được kỹ năng, hãy thử lại.");

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
  });
