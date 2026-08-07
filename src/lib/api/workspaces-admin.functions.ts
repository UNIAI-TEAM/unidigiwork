// Blueprint §5.5, §7 — Read-only workspace administration.
// Batch 1B-UI-FINISH: list workspaces of the active tenant for admin console.
// Enforces admin/owner permission server-side and filters by tenantId.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { z } from "zod";

export interface TenantWorkspaceDto {
  id: string;
  tenantId: string;
  name: string;
  status: "active" | "archived";
  ownerId: string | null;
  memberCount: number | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

const Input = z.object({
  tenantId: z.string().uuid(),
  search: z.string().max(120).optional(),
  status: z.enum(["active", "archived", "all"]).optional().default("all"),
  sort: z.enum(["newest", "oldest", "name"]).optional().default("newest"),
  page: z.number().int().min(1).max(500).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

// Typed loosely to avoid coupling to the auto-generated Supabase client type.
// The middleware guarantees this is an authenticated per-request client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertTenantAdmin(supabase: any, tenantId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
  const role = (data as { role?: string } | null)?.role;
  if (!role) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
  if (role !== "tenant_owner" && role !== "tenant_admin") {
    throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
  }
  return role;
}

export const listTenantWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: TenantWorkspaceDto[]; total: number }> => {
    const { supabase, userId } = context;
    await assertTenantAdmin(supabase, data.tenantId, userId);

    let q = supabase
      .from("workspaces")
      .select(
        "id, tenant_id, name, owner_id, timezone, created_at, updated_at, row_version, deleted_at",
        { count: "exact" },
      )
      .eq("tenant_id", data.tenantId);

    if (data.status === "active") q = q.is("deleted_at", null);
    else if (data.status === "archived") q = q.not("deleted_at", "is", null);

    if (data.search) {
      const escaped = data.search.replace(/[%,]/g, " ").trim();
      if (escaped) q = q.ilike("name", `%${escaped}%`);
    }

    if (data.sort === "oldest") q = q.order("created_at", { ascending: true });
    else if (data.sort === "name") q = q.order("name", { ascending: true });
    else q = q.order("created_at", { ascending: false });

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: "WORKSPACE_LIST_FAILED" });

    const list = (rows ?? []) as Array<{
      id: string;
      tenant_id: string;
      name: string;
      owner_id: string | null;
      timezone: string | null;
      created_at: string;
      updated_at: string;
      row_version: number;
      deleted_at: string | null;
    }>;

    return {
      rows: list.map((w) => ({
        id: w.id,
        tenantId: w.tenant_id,
        name: w.name,
        status: w.deleted_at ? ("archived" as const) : ("active" as const),
        ownerId: w.owner_id,
        memberCount: null, // RLS-scoped; deferred to Collaboration Core.
        timezone: w.timezone ?? "Asia/Ho_Chi_Minh",
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        rowVersion: w.row_version,
      })),
      total: count ?? list.length,
    };
  });

// Đổi múi giờ hiển thị của workspace (owner workspace hoặc quản trị tenant).
const TimezoneInput = z.object({
  workspaceId: z.string().uuid(),
  timezone: z.string().min(1).max(64),
});

export const setWorkspaceTimezone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TimezoneInput.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; timezone: string }> => {
    const { data: rows, error } = await context.supabase.rpc("set_workspace_timezone", {
      _workspace_id: data.workspaceId,
      _timezone: data.timezone,
    });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("PERMISSION_DENIED")) {
        throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
      }
      if (msg.includes("INVALID_TIMEZONE")) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "INVALID_TIMEZONE" });
      }
      throw new ApiError({ code: "INTERNAL_ERROR", message: "WORKSPACE_TIMEZONE_UPDATE_FAILED" });
    }
    const row = (rows as Array<{ id: string; timezone: string }> | null)?.[0];
    if (!row) throw new ApiError({ code: "NOT_FOUND", message: "WORKSPACE_NOT_FOUND" });
    return row;
  });