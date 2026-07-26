# `src/platform` — Portability Abstraction Layer

Blueprint §8, §15, §16, §13.

Mục đích: cô lập frontend/business code khỏi vendor-specific API. Mỗi interface có một hoặc nhiều adapter; mã sử dụng chỉ import interface + factory, KHÔNG import trực tiếp `@supabase/supabase-js`, LiveKit SDK hay Keycloak SDK.

## Trạng thái Batch 0A

Đây là **skeleton contract**. Chưa có adapter được wire vào runtime — mọi caller hiện tại vẫn dùng đường cũ.

- `identity.ts` — `AuthenticatedIdentity`, `IdentityProviderKind`.
- `storage.ts` — `ObjectStorage` interface. Batch 0C: Supabase adapter.
- `realtime.ts` — `RealtimeClient` interface. Batch 0C: Supabase adapter + refactor `notifications.tsx` subscriber.
- `tenant-context.ts` — `RequestContext` + `requireTenantContext` fail-closed skeleton. Không dùng production trước Batch 0B (tạo `tenants`/`tenant_members`) và Batch 0C (wire resolver thật).

## Cấm

- Không tạo `tenantId` giả để bypass `requireTenantContext`.
- Không lưu public URL storage cố định (§15.3).
- Không import `@/integrations/supabase/*` từ module này — layer platform phải trung lập.
