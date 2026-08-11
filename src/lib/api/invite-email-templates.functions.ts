// Quản lý mẫu email mời workspace theo vai trò (tenant-scoped).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import {
  DEFAULT_INVITE_TEMPLATES,
  INVITE_ROLES,
  type InviteEmailTemplate,
  type InviteRole,
} from "@/lib/invite-email-template";

const RoleEnum = z.enum(["tenant_admin", "manager", "member", "guest"]);

type Row = {
  role: string;
  subject: string;
  heading: string;
  body: string;
  cta_label: string;
  footer: string;
  is_active: boolean;
};

async function tenantOf(
  supabase: { from: (t: string) => any },
  workspaceId: string,
): Promise<string> {
  const { data } = await supabase
    .from("workspaces")
    .select("tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const tenantId = (data as { tenant_id: string } | null)?.tenant_id;
  if (!tenantId) throw new ApiError({ code: "WORKSPACE_ACCESS_DENIED", message: "WORKSPACE_ACCESS_DENIED" });
  return tenantId;
}

export const listInviteEmailTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InviteEmailTemplate[]> => {
    const tenantId = await tenantOf(context.supabase as never, data.workspaceId);
    const { data: rows } = await context.supabase
      .from("invite_email_templates")
      .select("role, subject, heading, body, cta_label, footer, is_active")
      .eq("tenant_id", tenantId);
    const byRole = new Map<string, Row>();
    for (const r of (rows ?? []) as unknown as Row[]) byRole.set(r.role, r);
    return INVITE_ROLES.map(({ value }) => {
      const row = byRole.get(value);
      if (!row) return { role: value, isCustom: false, ...DEFAULT_INVITE_TEMPLATES[value] };
      return {
        role: value,
        subject: row.subject,
        heading: row.heading,
        body: row.body,
        ctaLabel: row.cta_label,
        footer: row.footer,
        isActive: row.is_active,
        isCustom: true,
      };
    });
  });

export const saveInviteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        role: RoleEnum,
        subject: z.string().trim().min(3).max(200),
        heading: z.string().trim().min(3).max(200),
        body: z.string().trim().min(10).max(5000),
        ctaLabel: z.string().trim().min(2).max(60),
        footer: z.string().trim().max(500).default(""),
        isActive: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context.supabase as never, data.workspaceId);
    const { error } = await context.supabase.from("invite_email_templates").upsert(
      {
        tenant_id: tenantId,
        role: data.role,
        subject: data.subject,
        heading: data.heading,
        body: data.body,
        cta_label: data.ctaLabel,
        footer: data.footer,
        is_active: data.isActive,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,role" },
    );
    if (error) throw new ApiError({ code: "PERMISSION_DENIED", message: error.message });
    return { ok: true as const };
  });

export const resetInviteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), role: RoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context.supabase as never, data.workspaceId);
    const { error } = await context.supabase
      .from("invite_email_templates")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("role", data.role as InviteRole);
    if (error) throw new ApiError({ code: "PERMISSION_DENIED", message: error.message });
    return { ok: true as const };
  });

export type InviteEmailTemplateVersion = {
  id: string;
  role: InviteRole;
  version: number;
  action: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  footer: string;
  isActive: boolean;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
};

export const listInviteEmailTemplateVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        role: RoleEnum,
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InviteEmailTemplateVersion[]> => {
    const tenantId = await tenantOf(context.supabase as never, data.workspaceId);
    const { data: rows, error } = await context.supabase
      .from("invite_email_template_versions")
      .select(
        "id, role, version, action, subject, heading, body, cta_label, footer, is_active, changed_by, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("role", data.role)
      .order("version", { ascending: false })
      .limit(data.limit);
    if (error) throw new ApiError({ code: "PERMISSION_DENIED", message: error.message });

    const list = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    const ids = Array.from(
      new Set(list.map((r) => r["changed_by"] as string | null).filter(Boolean) as string[]),
    );
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", ids);
      for (const p of (profiles ?? []) as unknown as Array<{
        id: string;
        email: string;
        display_name: string | null;
      }>) {
        nameById.set(p.id, p.display_name || p.email);
      }
    }

    return list.map((r) => ({
      id: r["id"] as string,
      role: r["role"] as InviteRole,
      version: r["version"] as number,
      action: r["action"] as string,
      subject: r["subject"] as string,
      heading: r["heading"] as string,
      body: r["body"] as string,
      ctaLabel: r["cta_label"] as string,
      footer: r["footer"] as string,
      isActive: r["is_active"] as boolean,
      changedBy: (r["changed_by"] as string | null) ?? null,
      changedByName: nameById.get((r["changed_by"] as string) ?? "") ?? null,
      createdAt: r["created_at"] as string,
    }));
  });

export const restoreInviteEmailTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), versionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context.supabase as never, data.workspaceId);
    const { data: row, error: readErr } = await context.supabase
      .from("invite_email_template_versions")
      .select("role, subject, heading, body, cta_label, footer, is_active")
      .eq("id", data.versionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readErr) throw new ApiError({ code: "PERMISSION_DENIED", message: readErr.message });
    if (!row) throw new ApiError({ code: "NOT_FOUND", message: "VERSION_NOT_FOUND" });
    const v = row as unknown as Row;

    const { error } = await context.supabase.from("invite_email_templates").upsert(
      {
        tenant_id: tenantId,
        role: v.role,
        subject: v.subject,
        heading: v.heading,
        body: v.body,
        cta_label: v.cta_label,
        footer: v.footer,
        is_active: v.is_active,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,role" },
    );
    if (error) throw new ApiError({ code: "PERMISSION_DENIED", message: error.message });
    return { ok: true as const, role: v.role as InviteRole };
  });