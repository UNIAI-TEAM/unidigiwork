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
 * Placeholder resolver. Throws until Batch 0C provides the real implementation
 * backed by `tenants` / `tenant_members` (Batch 0B).
 */
export const requireTenantContext: TenantContextResolver = async () => {
  throw new Error(
    "requireTenantContext: not yet implemented. Wire a real resolver in Batch 0C after Batch 0B creates the tenants/tenant_members tables. Do NOT return a fake tenant.",
  );
};
