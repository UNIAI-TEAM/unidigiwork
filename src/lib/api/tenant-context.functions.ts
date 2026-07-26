// Blueprint §5.5 — Trusted resolver for the authenticated user's tenant
// context. Runs server-side against tenant_members with the caller's RLS.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TenantContextDto {
  actorId: string;
  tenantId: string;
  role: string;
  memberships: ReadonlyArray<{ tenantId: string; role: string }>;
}

export const resolveTenantContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantContextDto> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) {
      throw new Error("IDENTITY_RESOLUTION_FAILED");
    }
    const memberships = (data ?? []).map((m) => ({
      tenantId: m.tenant_id as string,
      role: m.role as string,
    }));
    if (memberships.length === 0) {
      throw new Error("TENANT_CONTEXT_REQUIRED");
    }
    // Compatibility: single-tenant users get an implicit active tenant.
    // Multi-tenant users MUST select explicitly (tenant switcher — Phase 1).
    if (memberships.length > 1) {
      throw new Error("TENANT_CONTEXT_REQUIRED");
    }
    return {
      actorId: userId,
      tenantId: memberships[0].tenantId,
      role: memberships[0].role,
      memberships,
    };
  });