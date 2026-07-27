# Supabase Function Security Audit — SEC.6

Scope: PostgreSQL functions in `public` schema related to Tenant Foundation
(Identity, Tenant, Membership, Workspace, Active Tenant, Invitation, Audit,
Outbox, Test-only). Baseline pulled from `pg_proc` via project db-functions
context. Audit method: static inspection of function source (SECURITY,
`search_path`, actor resolution, tenant authorization, side effects) +
cross-check with grant matrix expected by runtime matrices SEC.2/3/4/5.

## Legend

- **SD** = SECURITY DEFINER · **SI** = SECURITY INVOKER
- **SP** = explicit `SET search_path = public` (locked)
- **Grant** = who may `EXECUTE`

## Identity / Membership helpers

| Function | SD/SI | SP | Grant | Actor | Purpose | Risk | Status |
|---|---|---|---|---|---|---|---|
| `has_role(uuid, app_role)` | SD | ✅ | authenticated | `auth.uid()` implicit via caller-passed id | Global role check | Low — read-only, id compared, no PII | OK |
| `has_tenant_role(uuid, tenant_role)` | SD | ✅ | authenticated | `auth.uid()` | Membership role check | Low | OK |
| `is_tenant_member(uuid)` | SD | ✅ | authenticated | `auth.uid()` | Membership check | Low | OK |
| `is_workspace_member(uuid, uuid)` | SD | ✅ | authenticated | Passed id | Legacy — workspace RLS | Low | OK |
| `is_workspace_owner(uuid, uuid)` | SD | ✅ | authenticated | Passed id | Legacy — workspace RLS | Low | OK |
| `is_reserved_slug(text)` | IMMUTABLE | – | public | – | Pure predicate | Low | OK |
| `current_internal_user_id()` | SD | ✅ | authenticated | `auth.uid()` | Bridge | Low | OK |

## Tenant lifecycle

| Function | SD/SI | SP | Grant | Actor auth | Tenant auth | Audit | Outbox | Idempotency | Status |
|---|---|---|---|---|---|---|---|---|---|
| `provision_tenant(...)` | SD | ✅ | authenticated | `auth.uid()` | requires actor==owner OR platform admin | ✅ | ✅ | ✅ md5 fingerprint + unique idx | OK (SEC.2) |
| `change_tenant_status(...)` | SD | ✅ | authenticated | `auth.uid()` | platform admin only | ✅ | ✅ | – | OK |
| `transfer_tenant_ownership(...)` | SD | ✅ | authenticated | `auth.uid()` | tenant_owner OR admin | ✅ | ✅ | – | OK |
| `change_tenant_member_role(...)` | SD | ✅ | authenticated | `auth.uid()` | tenant_owner OR platform admin | ✅ | ✅ | last-owner protected | OK |
| `change_tenant_member_status(...)` | SD | ✅ | authenticated | `auth.uid()` | tenant_owner/admin OR platform admin | ✅ | – | last-owner protected | OK |

## Invitations

| Function | SD/SI | SP | Grant | Notes | Status |
|---|---|---|---|---|---|
| `create_tenant_invitation(...)` | SD | ✅ | authenticated | owner/admin only; forbids `tenant_owner` role invites; enforces expiry | OK |
| `accept_tenant_invitation(...)` | SD | ✅ | authenticated | rejects unverified email, normalized case compare, prevents reactivating removed member | OK (SEC.3/4) |
| `revoke_tenant_invitation(...)` | SD | ✅ | authenticated | owner/admin only; state=pending → revoked | OK |
| `record_tenant_invitation_rejection(...)` | SD | ✅ | **service_role only** | Trusted audit sink; idempotent via `_idem`; whitelisted reason codes; no PII beyond invitation id | OK (SEC.4) |

## Audit / Outbox infrastructure

| Function | SD/SI | SP | Grant | Notes | Status |
|---|---|---|---|---|---|
| `tg_audit_events_immutable()` | trigger | ✅ | – | Append-only enforcement (raises on UPDATE/DELETE) | OK |
| `claim_outbox_events(text,int,int)` | SD | ✅ | service_role | Deterministic `ORDER BY available_at`, `FOR UPDATE SKIP LOCKED`, `LIMIT _batch`; single-winner guaranteed by row lock | OK (SEC.6) |
| `complete_outbox_event(uuid,text)` | SD | ✅ | service_role | Owner-only completion via `lease_owner = _worker` check | OK |
| `fail_outbox_event(uuid,text,text,int)` | SD | ✅ | service_role | Owner-only; retry vs dead_letter at 10 attempts | OK |
| `extend_outbox_lease(uuid,text,int)` | SD | ✅ | service_role | Owner-only extend | OK |
| `tg_*_fill_tenant()` (documents/emails/notifications/workspaces) | trigger | ✅ | – | Derives `tenant_id` from parent; rejects if underivable | OK |

## Auth handlers

| Function | SD/SI | SP | Notes | Status |
|---|---|---|---|---|
| `handle_new_user()` | SD | ✅ | Profile insert on auth signup | OK |
| `handle_new_internal_user()` | SD | ✅ | Bridges auth user to `public.users` + external identity | OK |
| `handle_new_workspace()` | SD | ✅ | Owner membership auto-insert | OK |
| `bump_email_thread()` / `bump_row_version()` / `update_updated_at_column()` | trigger | ✅ | Utility triggers | OK |

## Test-only helpers

| Function | SD/SI | SP | Grant | Governance | Decision |
|---|---|---|---|---|---|
| `_test_unconfirm_auth_email(uuid)` | SD | ✅ | service_role only (default; not granted to authenticated) | Guarded by `email LIKE 'sec3\_%'`; raises PERMISSION_DENIED otherwise. Not browser-callable. | **KEEP with governance** — required by SEC.3/4 recurring CI. Removal milestone: after SEC.3/4 fixture is replaced by admin API OTP flow (target: Batch 1C prep). Documented here. |

No other `_test_*` helpers exist.

## Warnings — resolution status

All Tenant Foundation SD functions in this audit carry explicit
`SET search_path = public` and are schema-qualified where they touch
security-sensitive tables. No `GRANT EXECUTE ON ALL FUNCTIONS`.
No SD function without a `search_path` lock exists in the Tenant scope.

### Out-of-scope pre-existing

The `dblink*` C-language functions are `PARALLEL RESTRICTED STRICT` and are
not browser-callable via PostgREST unless explicitly granted; they are not
used by this project. Left as-is (out of Tenant Foundation scope).

## Global grant hygiene

- `authenticated`: only the browser-facing lifecycle RPCs above.
- `anon`: NONE of the tenant functions.
- `service_role`: outbox lifecycle + `record_tenant_invitation_rejection` +
  `_test_unconfirm_auth_email` (test-only).
- `PUBLIC`: only `is_reserved_slug` (pure, immutable predicate).

## SEC.6 verdict

PASS (static). Runtime confirmation requires the consolidated runner in a
trusted environment (see §XII of the SEC.6 brief).