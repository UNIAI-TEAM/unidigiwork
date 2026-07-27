// Blueprint §5.5 — Active tenant context (cookie-based).
// Cookie is the source of truth for the active tenant selection UX.
// Membership + tenant status is ALWAYS re-validated server-side via RLS.
// Never trust the cookie value for authorization on its own.
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { z } from "zod";

const COOKIE_NAME = "uniwork_active_tenant";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface AvailableTenantDto {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: "active" | "suspended" | "archived";
  role: string;
  memberStatus: string;
}

export interface ActiveTenantDto {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: "active" | "suspended" | "archived";
  role: string;
  actorId: string;
  availableCount: number;
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/**
 * List every tenant the caller is an ACTIVE member of, joined with tenant
 * metadata. RLS applies.
 */
export const listAvailableTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AvailableTenantDto[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tenant_members")
      .select("role, status, tenant:tenants(id, name, slug, status)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new ApiError({ code: "IDENTITY_RESOLUTION_FAILED", message: error.message });
    const rows = (data ?? []) as Array<{
      role: string;
      status: string;
      tenant: { id: string; name: string; slug: string; status: string } | null;
    }>;
    return rows
      .filter((r) => r.tenant !== null)
      .map((r) => ({
        tenantId: r.tenant!.id,
        tenantName: r.tenant!.name,
        tenantSlug: r.tenant!.slug,
        tenantStatus: r.tenant!.status as ActiveTenantDto["tenantStatus"],
        role: r.role,
        memberStatus: r.status,
      }));
  });

/**
 * Resolve the active tenant.
 * - Reads cookie hint, then RE-VALIDATES against tenant_members (RLS as user).
 * - If cookie invalid/missing AND caller has exactly one active membership on
 *   an active tenant, auto-selects it.
 * - If multi-tenant with no valid cookie: returns null (caller MUST choose).
 * - Suspended/archived tenants and inactive memberships never become active.
 */
export const getActiveTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveTenantDto | null> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tenant_members")
      .select("role, status, tenant:tenants(id, name, slug, status)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new ApiError({ code: "IDENTITY_RESOLUTION_FAILED", message: error.message });
    const memberships = (data ?? [])
      .map((m) => {
        const t = (m as { tenant: { id: string; name: string; slug: string; status: string } | null }).tenant;
        return t && t.status === "active"
          ? { tenantId: t.id, name: t.name, slug: t.slug, status: t.status, role: (m as { role: string }).role }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (memberships.length === 0) return null;

    const hint = getCookie(COOKIE_NAME);
    const matched = hint ? memberships.find((m) => m.tenantId === hint) : undefined;
    const chosen = matched ?? (memberships.length === 1 ? memberships[0] : null);
    if (!chosen) return null;

    // Refresh cookie so it doesn't expire while user is active.
    setCookie(COOKIE_NAME, chosen.tenantId, cookieOpts());

    return {
      tenantId: chosen.tenantId,
      tenantName: chosen.name,
      tenantSlug: chosen.slug,
      tenantStatus: chosen.status as ActiveTenantDto["tenantStatus"],
      role: chosen.role,
      actorId: userId,
      availableCount: memberships.length,
    };
  });

const SetActiveInput = z.object({ tenantId: z.string().uuid() });

export const setActiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetActiveInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    // Re-validate that caller has an active membership on an active tenant.
    const { data: row, error } = await supabase
      .from("tenant_members")
      .select("status, tenant:tenants(id, status)")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "Cannot resolve tenant" });
    const t = (row as { status: string; tenant: { id: string; status: string } | null } | null)?.tenant;
    if (!row || !t || t.status !== "active") {
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    }
    setCookie(COOKIE_NAME, data.tenantId, cookieOpts());
    return { ok: true };
  });

export const clearActiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    deleteCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });