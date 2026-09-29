import type { SupabaseClient } from "@supabase/supabase-js";

type Pack = "business" | "school";

export async function resolveActivePack(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tenantId: string | null; pack: Pack; canManage: boolean }> {
  const { data: rows } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active");
  const list = (rows ?? []) as Array<{ tenant_id: string; role: string }>;
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  const cookie = readActiveTenantCookie();
  const m = list.find((r) => r.tenant_id === cookie) ?? list[0];
  if (!m) return { tenantId: null, pack: "business", canManage: false };
  const { data } = await supabase.rpc("get_tenant_industry_pack", { _tenant_id: m.tenant_id });
  const pack: Pack = data === "school" ? "school" : "business";
  return {
    tenantId: m.tenant_id,
    pack,
    canManage: m.role === "tenant_owner" || m.role === "tenant_admin",
  };
}

export async function packForTenant(supabase: SupabaseClient, tenantId: string): Promise<Pack> {
  const { data } = await supabase.rpc("get_tenant_industry_pack", { _tenant_id: tenantId });
  return data === "school" ? "school" : "business";
}
