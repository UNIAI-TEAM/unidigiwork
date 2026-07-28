# Batch 1C — Subscription · Entitlement · Quota
## Checklist triển khai & tiêu chí PASS/FAIL

Nguồn: Blueprint §18 (Billing), §9 (Command), §12 (Error), §25 (30 rules), §27 (DoD).
Mỗi mục có **PASS** rõ ràng; nếu không thỏa → **FAIL** và chưa được đánh dấu closed.

Trạng thái ký hiệu: ⬜ chưa làm · 🟡 đang làm · ✅ PASS · ❌ FAIL

---

## Phase 1C-DB — Database Foundation

### 1.1 Global catalog
| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| DB-1 | Bảng `plans` | Tồn tại, seed đủ `free`/`pro`/`business`, đúng 1 dòng `is_default=true`, RLS ON, GRANT `SELECT TO anon, authenticated` | ✅ |
| DB-2 | Bảng `features` | Seed ≥ 6 key: `member.count`, `workspace.count`, `storage.bytes`, `ai.tokens`, `email.threads`, `meeting.minutes`; mỗi row có `kind ∈ {flag,quota}` và `category` | ✅ |
| DB-3 | Bảng `plan_features` | FK `plan_id`→`plans`, `feature_key`→`features`; UNIQUE `(plan_id, feature_key)`; mọi feature có mapping cho cả 3 plan | ✅ |

### 1.2 Tenant-scoped tables
| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| DB-4 | `subscriptions` | Có `tenant_id, plan_id, status, period_start, period_end, cancel_at, canceled_at, provider, row_version, created_by, updated_by`; UNIQUE 1 subscription non-canceled/tenant; RLS scope `is_tenant_member(tenant_id)`; GRANT authenticated + service_role | ✅ |
| DB-5 | `entitlements` (cache) | PK `(tenant_id, feature_key)`; RLS SELECT cho tenant_member; **INSERT/UPDATE/DELETE denied** (chỉ RPC ghi) | ✅ |
| DB-6 | `usage_events` | Append-only: trigger từ chối UPDATE/DELETE (giống `audit_events`); có `idempotency_key` UNIQUE per tenant; RLS SELECT tenant_admin+; INSERT denied cho authenticated | ✅ |
| DB-7 | `usage_counters` | Rollup theo `(tenant_id, meter_key, period_start)`; RLS SELECT tenant_member; ghi qua RPC | ✅ |

### 1.3 RPC (SECURITY DEFINER)
| # | RPC | PASS criteria | Trạng thái |
|---|---|---|---|
| DB-8 | `provision_default_subscription(_tenant_id, _actor_id)` | `SET search_path=public`; EXECUTE **chỉ** `service_role`; idempotent (gọi 2 lần không tạo duplicate); insert 1 audit + 1 outbox `tenant.subscription_provisioned.v1` cùng transaction | ✅ |
| DB-9 | `change_subscription(_tenant_id, _plan_code, _idem_key, _corr, _expected_row_version)` | EXECUTE `authenticated,service_role`; kiểm tra `has_tenant_role(_,'tenant_owner'∨'tenant_admin')`; raise `PLAN_NOT_FOUND`/`SUBSCRIPTION_INVALID_TRANSITION`/`VERSION_CONFLICT`/`IDEMPOTENCY_CONFLICT` với ERRCODE chuẩn; bump `row_version`; ghi audit + outbox `tenant.subscription_changed.v1`; refresh `entitlements` cache | ⬜ verify |
| DB-10 | `record_usage(_tenant_id, _meter_key, _quantity, _source, _idem_key, _workspace_id?, _extra?)` | EXECUTE **chỉ** `service_role`; INSERT `usage_events` + upsert `usage_counters`; idempotent theo `(tenant_id, idempotency_key)`; raise `QUOTA_EXCEEDED` khi vượt hard limit (nếu policy hard) | ⬜ verify |
| DB-11 | `check_quota(_tenant_id, _meter_key, _delta)` | EXECUTE `authenticated,service_role`; trả `{allowed, current, limit, remaining}`; **KHÔNG** raise; đọc từ `entitlements` + `usage_counters` | ⬜ verify |
| DB-12 | `refresh_entitlements(_tenant_id)` | EXECUTE **chỉ** `service_role`; upsert đầy đủ từ `plan_features` của plan đang active; xóa row không còn thuộc plan | ✅ |
| DB-13 | Hook vào `provision_tenant` | Sau khi tạo tenant mới → gọi `provision_default_subscription` cùng transaction; test: tenant mới có subscription `free` + entitlements đầy đủ | ⬜ test |

### 1.4 Linter & backfill
| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| DB-14 | Linter | Không phát sinh warning mới trong `0028_anon_security_definer_function_executable` cho RPC billing (đã revoke `anon`) | ✅ |
| DB-15 | Backfill | Mọi tenant hiện hữu có đúng 1 subscription active + entitlements đầy đủ (query: `SELECT COUNT(*) FROM tenants t LEFT JOIN subscriptions s USING(tenant_id) WHERE s.id IS NULL` = 0) | ⬜ verify |

---

## Phase 1C-API — Contracts & Server Functions

| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| API-1 | Contracts `src/contracts/billing/plan.ts` | DTO trung lập, KHÔNG import `@/integrations/supabase/*`; Zod schema cho `ChangeSubscription`/`RecordUsage` với `CommandMetadata`; test `contracts-validation` PASS | ✅ |
| API-2 | Error catalogue | Thêm `PLAN_NOT_FOUND`, `PLAN_INVALID`, `SUBSCRIPTION_NOT_FOUND`, `SUBSCRIPTION_INVALID_TRANSITION`, `ENTITLEMENT_DENIED`, `QUOTA_EXCEEDED`; test `error-contract` PASS (unique) | ✅ |
| API-3 | `listPlans` | `requireSupabaseAuth`; trả list plan + plan_features; không rò rỉ dữ liệu tenant khác | ✅ |
| API-4 | `getActiveSubscription(tenantId)` | RLS enforce; trả `null` nếu không thuộc tenant; DTO đúng schema | ✅ |
| API-5 | `getEntitlementSnapshot(tenantId)` | Kết hợp `entitlements` + `usage_counters` tháng hiện tại; sort theo `category, name` | ✅ |
| API-6 | `changeSubscription` | Zod validate; map lỗi Postgres → `StableErrorCode` (không leak SQL); invalidate cache `billingKeys.all` client-side | ✅ |
| API-7 | Kiến trúc guard | `architecture-rules.test.ts` PASS: không dùng `supabaseAdmin` trong `billing.functions.ts`, không có `process.env.SUPABASE_SERVICE_ROLE_KEY` ở module scope | ⬜ verify |

---

## Phase 1C-HOOKS — React Query

| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| HK-1 | `billingKeys` | Mọi key tenant-scoped đều include `tenantId` (audit qua `ui-finish-guards.test.ts`) | ✅ |
| HK-2 | `usePlans` / `useActiveSubscription` / `useEntitlements` | `enabled` guard khi thiếu tenantId; `staleTime` hợp lý (30s cho entitlements) | ✅ |
| HK-3 | `useChangeSubscription` | Sinh `idempotencyKey` (crypto.randomUUID) mỗi lần submit; onSuccess invalidate `billingKeys.all`; xử lý optimistic lock qua `expectedRowVersion` | ✅ |
| HK-4 | `canUseFeature(snapshot, key)` | Blueprint §25.13 — không hard-code plan name; trả `{allowed, reason?}` với reason ∈ `ENTITLEMENT_DENIED\|QUOTA_EXCEEDED` | ✅ |

---

## Phase 1C-UI — Admin Console tab "Subscription & Usage"

| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| UI-1 | Route `/admin/tenant` thêm tab `subscription` | Hiển thị plan hiện tại (name, status, period), CTA "Đổi plan" | ⬜ |
| UI-2 | Bảng entitlements | Group theo category; quota kiểu progress bar (`usage/limit`); flag hiển thị badge on/off | ⬜ |
| UI-3 | Dialog đổi plan | Liệt kê plans; disabled plan hiện tại; xác nhận trước khi submit; hiển thị error mapping stable code → i18n string | ⬜ |
| UI-4 | Empty/error state | `<EmptyState>` khi chưa có subscription; skeleton loading; toast error tiếng Việt | ⬜ |
| UI-5 | Semantic tokens | Không hardcode màu; dùng token từ `src/styles.css` (Blueprint §UI, skill `unicom-ui-design`) | ⬜ |
| UI-6 | RBAC UI | Non-admin không thấy tab; nút "Đổi plan" ẩn nếu không phải `tenant_owner`/`tenant_admin` | ⬜ |

---

## Phase 1C-GATE — Quota enforcement

| # | Hạng mục | PASS criteria | Trạng thái |
|---|---|---|---|
| GT-1 | Invitation flow | Trước khi gọi `create_tenant_invitation`, server function gọi `check_quota('member.count', +1)`; nếu deny → trả `QUOTA_EXCEEDED`; UI hiện toast + link upgrade | ⬜ |
| GT-2 | Workspace creation | Trước khi tạo workspace mới, gate `workspace.count` | ⬜ |
| GT-3 | Usage recording | Sau khi accept invitation thành công → `record_usage('member.count', 1)`; sau khi tạo workspace → `record_usage('workspace.count', 1)`; đều truyền `idempotency_key` derive từ resource id | ⬜ |
| GT-4 | Race condition | Test song song 2 invitation cuối slot: chỉ 1 thành công (unique index + advisory lock hoặc row lock trên `usage_counters`) | ⬜ test |

---

## Phase 1C-TEST — Automated tests

### 5.1 Static / architecture
| # | Test file | PASS criteria |
|---|---|---|
| T-1 | `src/contracts/contracts-validation.test.ts` | Bao phủ Zod schema billing |
| T-2 | `src/contracts/error-contract.test.ts` | 6 mã mới có mặt & unique |
| T-3 | `src/lib/architecture/architecture-rules.test.ts` | Không service-role trong routes/hooks/components; billing.functions không import `client.server` |
| T-4 | `src/lib/architecture/tenant-isolation.test.ts` | 4 bảng tenant billing đều có `tenant_id` NOT NULL + RLS ON |
| T-5 | `src/lib/architecture/rls-policies.test.ts` | Policies mới dùng `is_tenant_member`/`has_tenant_role`; `usage_events` immutable trigger |
| T-6 | `src/lib/architecture/ui-finish-guards.test.ts` | `billingKeys.subscription/entitlements` bắt buộc `tenantId` |

### 5.2 Runtime matrix (tests/runtime/tenant-isolation/)
| # | Suite | PASS criteria |
|---|---|---|
| T-7 | `sec7-billing.mjs` (mới) | Cross-tenant: tenant A không đọc/ghi subscription của tenant B (SELECT/UPDATE/RPC all denied) |
| T-8 | `sec7-billing.mjs` — idempotency | Gọi `change_subscription` 2 lần cùng key + payload → không tạo duplicate; khác payload cùng key → `IDEMPOTENCY_CONFLICT` |
| T-9 | `sec7-billing.mjs` — concurrency | 2 client đồng thời gọi `change_subscription` với `expected_row_version=N` → chỉ 1 win, còn lại `VERSION_CONFLICT` |
| T-10 | `sec7-billing.mjs` — quota | Seed limit=3; gọi `record_usage` 4 lần → lần 4 raise `QUOTA_EXCEEDED`; counter không bị bump quá limit |
| T-11 | `sec7-billing.mjs` — audit/outbox | Mỗi `change_subscription` thành công tạo đúng 1 audit + 1 outbox `tenant.subscription_changed.v1`; append-only enforced |
| T-12 | `run-all.mjs` regression | 492/492 cell hiện hữu vẫn PASS (không regression từ SEC.2–6) |

---

## Phase 1C-DOC — Documentation

| # | Hạng mục | PASS criteria |
|---|---|---|
| DOC-1 | Data Dictionary | Cập nhật `docs/architecture/data-dictionary/README.md` với 4 bảng billing mới |
| DOC-2 | Domain Ownership Manifest | Thêm bounded context `billing` (owner tables, routes, commands, events) |
| DOC-3 | Event Catalogue | Thêm `tenant.subscription_provisioned.v1`, `tenant.subscription_changed.v1`, `tenant.usage_recorded.v1` với schema payload |
| DOC-4 | Migration Java notes | `docs/architecture/migration/LOVABLE_TO_JAVA_MIGRATION_RULES.md` — mapping RPC → JPA/service class, event → Kafka topic |

---

## Gate đóng Batch 1C (Definition of Done — Blueprint §27)

Batch chỉ đóng khi **TẤT CẢ** thỏa:

- [ ] Toàn bộ mục DB-1 → DB-15 PASS
- [ ] API-1 → API-7 PASS + `tsgo --noEmit` clean
- [ ] HK-1 → HK-4 PASS
- [ ] UI-1 → UI-6 PASS (screenshot check trên desktop + mobile)
- [ ] GT-1 → GT-4 PASS
- [ ] T-1 → T-12 PASS (100% cell, không skip trừ khi ghi rõ lý do trong artifact)
- [ ] DOC-1 → DOC-4 committed
- [ ] `bun run build` PASS
- [ ] Linter Supabase không sinh WARN mới cho billing
- [ ] Rollback SQL đã chuẩn bị (DROP tables + REVOKE grants) và test được trên môi trường staging

**Verdict**: ⬜ OPEN · 🟡 IN_PROGRESS · ✅ CLOSED — cập nhật khi đủ điều kiện.

---

## Kill-switch / Rollback plan

1. Feature flag `UNIWORK_BILLING_ENABLED=false` (env server) → skip quota gate, UI tab ẩn.
2. SQL rollback theo thứ tự: DROP triggers → DROP RPCs → DROP tables (`usage_counters`, `usage_events`, `entitlements`, `subscriptions`, `plan_features`, `features`, `plans`).
3. Restore từ backup point-in-time nếu dữ liệu tenant bị hỏng.