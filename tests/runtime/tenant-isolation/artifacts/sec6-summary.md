# SEC.6 Summary

## Outbox flake — root cause

Cell: `runner.mjs` step 12 `{ actor: "server", action: "rpc", table: "claim_outbox_events" }` expected `single-winner`, observed `w1=0 w2=0`.

**Root cause:** fixture contamination combined with claim ordering. The RPC
`claim_outbox_events` uses `ORDER BY available_at LIMIT _batch` with
`FOR UPDATE SKIP LOCKED`. The database currently carries 179 `pending` +
10 `processing` outbox events from prior batches. With `_batch = 5`, both
workers claim 5 stale events each whose `available_at` predates the freshly
seeded event, so the filter `.filter(e => e.idempotency_key === key)` returns
0 in each worker — misread as "no winner" while the single-winner invariant
itself was in fact upheld on unrelated events.

**Not** a database contract defect. The RPC honors `FOR UPDATE SKIP LOCKED`
correctly; the test's fixture-scoped assertion was too narrow.

## Remediation (test-side only, no migration required)

`tests/runtime/tenant-isolation/runner.mjs` step 12 now:

- Seeds 20 events under a unique `aggregate_type` namespace per run.
- Launches 5 concurrent workers with `_batch = 20`.
- Asserts the invariant on our namespace only: **no id claimed by two workers**.
- Cleans up by exact ids via `.in("id", …)` — no wildcard.

A dedicated stress harness `sec6-outbox-stress.mjs` re-runs 7 scenarios
(two-worker/single, five-worker/single, multi-worker/multi-event,
active-lease, expired-lease, processed no-reclaim, retry availability) for
`SEC6_ITER` iterations (default 25) each.

A consolidated runner `run-all.mjs` chains original 1A-R, SEC.2, SEC.3/4,
SEC.5, SEC.6 stress; returns non-zero if any suite fails.

## Function security audit

See `docs/architecture/security/SUPABASE_FUNCTION_SECURITY_AUDIT.md`.

- Tenant Foundation SD functions: all have `SET search_path = public`.
- Grants: `authenticated` on browser-facing lifecycle RPCs only; `service_role` on outbox lifecycle + audit sink + test-only helper; no `anon` grants.
- `_test_unconfirm_auth_email`: kept with governance (service_role only, `sec3_` prefix guarded, documented removal milestone).

## Static regression rule

Added `src/lib/architecture/active-tenant-filter.test.ts`: every query
against `tenant_members` in `active-tenant.functions.ts` must be joined with
`.eq("user_id", userId)` — codifies the SEC.5 fix as a build-time check.

## Runtime execution

The sandbox available to the Lovable agent lacks `SUPABASE_SERVICE_ROLE_KEY`
and `E2E_1A_PASSWORD` / `E2E_1A_ALLOW_URL`; these live in the trusted
runtime environment the user operates. All fixes are static and shipped
as code + tests + a re-runnable consolidated harness. Runtime PASS numbers
must be produced by running `run-all.mjs` in that trusted environment.