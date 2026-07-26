/**
 * Tenant / request context (Blueprint §5.5).
 *
 * Batch 0A: skeleton fail-closed. Bảng `tenants` / `tenant_members` chưa tồn
 * tại (Batch 0B mới tạo). Resolver thật sẽ được wire ở Batch 0C.
 *
 * KHÔNG tạo tenant giả để bypass. KHÔNG dùng function này trong production
 * path trước khi Batch 0C hoàn tất.
 */

export interface RequestContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly workspaceId?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly correlationId: string;
}

export type TenantContextResolver = () => Promise<RequestContext>;

/**
 * Batch 0C: fail-closed default. Callers that need tenant context should
 * invoke the trusted server function `resolveTenantContext` from
 * `@/lib/api/tenant-context.functions` and then adapt to RequestContext.
 * This module intentionally does NOT import the server function to keep
 * the platform layer vendor-neutral.
 */
export const requireTenantContext: TenantContextResolver = async () => {
  throw new Error(
    "requireTenantContext: no resolver installed. Call resolveTenantContext() server-side and pass the result explicitly. Never fabricate a tenant.",
  );
};
