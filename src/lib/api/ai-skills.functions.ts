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
  workspaceId: z.string().uuid(),
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

export const listAiSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    const { data: rows, error } = await context.supabase
      .from("ai_skills")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .or(`workspace_id.is.null,workspace_id.eq.${data.workspaceId}`)
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
    const tenantId = await resolveTenant(context, data.workspaceId);
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
  .inputValidator((i: unknown) => z.object({ skillId: z.string().uuid(), enabled: z.boolean() }).parse(i))
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
