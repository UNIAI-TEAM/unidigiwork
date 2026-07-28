
# Batch 1C — Subscription · Entitlement · Quota

Blueprint §18 (SSOT). Không hard-code plan name (Rule 13). Không dual-write. Không thêm dependency thanh toán thực (Stripe/Paddle) — provider adapter là stub, kích hoạt sau ở Batch riêng.

## Scope (in)

1. **Schema nền tảng** (migration Batch 1C-DB):
   - `plans`, `plan_features`, `features` (catalog)
   - `subscriptions`, `subscription_items`
   - `entitlements` (materialized view / bảng cache theo tenant)
   - `usage_events` (append-only), `usage_counters` (rollup theo period)
   - Không tạo `invoices`/`payments` ở batch này (thuộc Billing Batch sau).
   - Tất cả tenant-scoped: `tenant_id`, `row_version`, `created_at/by`, `updated_at/by`, RLS + GRANT chuẩn.
   - `usage_events` append-only (trigger chặn UPDATE/DELETE).
   - Seed 3 plan mặc định: `free`, `pro`, `business` + feature catalog + quota limits (INSERT literal trong migration).

2. **Contracts** (`src/contracts/billing/*`):
   - `Plan`, `Feature`, `Subscription`, `Entitlement`, `QuotaLimit`, `UsageCounter` DTO neutral.
   - Stable error codes bổ sung: `SUBSCRIPTION_NOT_FOUND`, `ENTITLEMENT_DENIED`, `QUOTA_EXCEEDED`, `PLAN_NOT_FOUND`.
   - Event envelope: `subscription.activated.v1`, `subscription.changed.v1`, `subscription.canceled.v1`, `quota.exceeded.v1`.

3. **Server functions** (trusted boundary):
   - `getActiveSubscription(tenantId)` — read.
   - `getEntitlements(tenantId)` — trả feature flags + quota limits + usage hiện tại.
   - `assertEntitlement(tenantId, featureKey)` — dùng nội bộ trước command.
   - `recordUsage({tenantId, meterKey, quantity, idempotencyKey})` — ghi `usage_events` + upsert `usage_counters` trong 1 transaction, phát outbox event khi vượt ngưỡng.
   - `changeSubscription(tenantId, planCode, correlationId, idempotencyKey)` — admin-only (tenant_owner hoặc app admin), atomic + audit + outbox.
   - Tất cả qua `requireSupabaseAuth`, RPC `SECURITY DEFINER` cho mutate, idempotency + row_version.

4. **SDK adapter** (`src/sdk/billing/*`):
   - Interface neutral + Lovable adapter (dùng server functions).
   - Java adapter = NOT_IMPLEMENTED fail-closed (theo pattern SDK cũ).
   - Provider abstraction `BillingProvider` với `LovableInternalProvider` stub (chưa gọi Stripe).

5. **Entitlement helper client-side**:
   - Hook `useEntitlements()` + `entitlements.can(featureKey)` — đọc từ server function, cache theo `tenantId`.
   - Không expose plan code cho check logic; UI chỉ dùng `can()` + quota display.

6. **UI Admin Console — tab "Subscription"** trong `admin.tenant.tsx`:
   - Hiển thị plan hiện tại, feature list, quota + usage bar (member count, storage, workspaces, AI tokens…).
   - Owner/admin có nút "Đổi plan" → chọn từ 3 plan seed (không thanh toán thực).
   - Read-only cho member.
   - Empty state khi chưa có subscription (auto-provision `free` khi tenant tạo — trigger DB).

7. **Enforcement hook điểm nhạy cảm**:
   - `provision_tenant` → auto tạo subscription `free`.
   - Invitation `create_tenant_invitation` → check quota `member_count` trước.
   - `handle_new_workspace` / create workspace path → check quota `workspace_count`.
   - Ghi `usage_counters` khi member added / workspace created (rollup transactionally).
   - Chưa hook AI tokens / storage / meeting minutes ở batch này — chỉ define meter và log NOT_IMPLEMENTED cho các tính năng chưa live.

8. **Static architecture tests** (`src/lib/architecture/*.test.ts`):
   - Cấm import `plan === "..."` hoặc `planCode ===` trong `src/routes/**`, `src/components/**`, `src/features/**` (dùng `can()`).
   - Cấm client gọi trực tiếp `subscriptions`/`entitlements` table (phải qua server fn).
   - Contract test: mọi feature key trong seed nằm trong enum `FeatureKey`.

9. **Runtime tests** (`tests/runtime/subscription/`):
   - Auto-provision `free` on tenant create.
   - Change plan → entitlements + quota update, audit + outbox emit.
   - Quota enforcement: invite thứ N+1 khi vượt limit → `QUOTA_EXCEEDED`.
   - Idempotency `recordUsage`: 2 lần cùng key → 1 event.
   - Concurrency `changeSubscription`: 2 winner → 1 success + 1 VERSION_CONFLICT.
   - Cross-tenant isolation: entitlement/usage của tenant A không leak sang B.

10. **Docs**:
    - `docs/architecture/manifests/BILLING_MANIFEST.md` — plan/feature/quota catalog.
    - Update Domain Ownership Manifest thêm bounded context `billing`.
    - ADR `docs/architecture/adr/ADR-1C-001-billing-foundation.md`.
    - Cập nhật `CI/QUALITY_GATES.md` thêm `test:subscription`.

## Scope (out)

- Stripe/Paddle live integration → Batch Billing sau (chỉ khi user duyệt).
- Invoices/Payments UI + PDF.
- Dunning/proration/tax.
- Storage/AI/Meeting quota enforcement thật (mới define meter, chưa hook writer vì các module đó chưa live).

## Non-goals của batch

Không đổi UI hiện tại ngoài thêm tab Subscription. Không refactor các module Task/Meeting/Document (writer thật thuộc Giai đoạn 2).

## Technical Details

- Migration duy nhất `1c_billing_foundation.sql` — 4-step order cho mỗi table (CREATE → GRANT → RLS → POLICY).
- `entitlements` là bảng cache (không materialized view) refresh qua trigger khi `subscriptions`/`plan_features` đổi → tránh phụ thuộc pg_cron.
- `usage_events` partition by `tenant_id` không cần Phase 1; index `(tenant_id, meter_key, occurred_at)`.
- Idempotency `recordUsage`: unique index `(tenant_id, meter_key, idempotency_key)` where `idempotency_key IS NOT NULL`.
- RLS `entitlements`/`subscriptions`: SELECT cho `is_tenant_member`; mutate chỉ qua RPC `SECURITY DEFINER`.
- Không dùng CHECK time-dependent — dùng trigger validate `period_end > period_start`.
- `useEntitlements` cache key: `["entitlements", tenantId]`, invalidate on tenant switch (đã có `qc.clear()` ở SEC.5).

## Deliverables & Gates

- Migration duyệt + apply.
- Typecheck + lint:changed + architecture tests PASS.
- Runtime subscription suite PASS.
- Regression Batch 1B (492/492) vẫn PASS.
- Báo cáo đóng batch.

## Rollout

Chia 3 sub-batch tuần tự:
- **1C-DB**: schema + seed + trigger + RLS.
- **1C-API**: contracts + server fn + SDK + hooks + enforcement (invitation/workspace).
- **1C-UI**: tab Subscription + entitlement guards ở UI (badge quota, disable feature khi denied) + runtime tests + docs.

Sau khi user duyệt plan, tôi bắt đầu **1C-DB** ngay.
