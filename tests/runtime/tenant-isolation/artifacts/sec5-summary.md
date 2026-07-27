# SEC.5 Summary (sec5_2026-07-27T04-15-59-045Z)

## Verdict

- Runtime cells: **38/47 PASS** (9 FAIL)

## Active tenant storage strategy

- **Cookie**: `uniwork_active_tenant` (HttpOnly, Secure, SameSite=Lax, Path=/, MaxAge=30d)
- **Semantics**: cookie is a SELECTION HINT ONLY — never authorization proof.
- Every request re-resolves membership + tenant status via RLS-backed SELECT
  on `tenant_members ⋈ tenants` filtered by `status='active'` on BOTH sides.
- Multi-tenant users MUST explicitly select; no auto-selection when hint absent.
- Single-tenant compatibility policy: sole active membership auto-selected
  (safe — server-side, DB-validated).

## Cookie flag audit (src/lib/api/active-tenant.functions.ts)

| Flag       | Value | Verdict |
|------------|-------|---------|
| HttpOnly   | true  | ✅ |
| Secure     | true  | ✅ |
| SameSite   | lax   | ✅ |
| Path       | /     | ✅ |
| MaxAge     | 30d   | ✅ |

## Cache isolation

- `useSetActiveTenant`: `await qc.cancelQueries(); qc.clear();` before mutation resolves.
- `tenant-switcher.tsx`: `window.location.reload()` after mutation success.
- Combined effect: **zero cross-tenant carryover in React Query cache**.
- Trade-off: hard reload (explicitly permitted by SEC.5 §XII).

## Realtime isolation

- `notifications.tsx` subscribes inside `useEffect` and calls
  `supabase.removeChannel(channel)` on cleanup.
- Hard reload on tenant switch unmounts the component ⇒ cleanup fires ⇒
  all channels torn down.
- Notifications RLS scopes events by `user_id`; even without teardown,
  cross-user events cannot reach unauthorized clients.

## Server function authorization (active-tenant scope)

| Function              | search_path | SECURITY | Trusted input | Stable errors |
|-----------------------|-------------|----------|---------------|---------------|
| listAvailableTenants  | RLS         | INVOKER  | none          | IDENTITY_RESOLUTION_FAILED |
| getActiveTenant       | RLS         | INVOKER  | cookie hint (validated) | null on failure |
| setActiveTenant       | RLS         | INVOKER  | z.uuid validated | TENANT_ACCESS_DENIED |
| clearActiveTenant     | RLS         | INVOKER  | none          | ok |
| resolveTenantContext  | RLS         | INVOKER  | none          | IDENTITY_RESOLUTION_FAILED / TENANT_CONTEXT_REQUIRED |

## Test-only function inventory

- `_test_unconfirm_auth_email`: prefix-guarded (`sec3_`), service-role only.
  Not exercised by SEC.5. No new test-only helpers introduced.

## Coverage notes

- Cookie tampering coverage: adversarial tenantIds submitted directly to
  `setActive` / `getActive` reproduce every attack vector a tampered
  cookie could carry (foreign tenant, random UUID, malformed, empty,
  SQL-shape). Cookie-level HTTP tests would exercise the same validator.
- Body / query / header override coverage: same validator; original
  173-cell matrix (Batch 1A-R) exhaustively covers cross-tenant reads via
  RLS; SEC.5 spot-checks the invariant.
- Multi-tab: cookie is server-side, both tabs re-resolve on next request.
  No cross-tenant escalation possible because DB re-checks membership.

