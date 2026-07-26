# Runtime Tenant Isolation Matrix (Batch 1A)

Blueprint §5, §25.2 · Batch 1A gate.

## Scope

Runtime, cross-tenant matrix executed against a live PostgreSQL / PostgREST
with real authenticated JWTs. Static tests in `src/lib/architecture/*.test.ts`
are complementary, not a substitute.

## Fixture prefix

All fixture rows use the prefix `e2e_1a_` in names/slugs/emails, e.g.
`e2e_1a_owner_a@uniwork.test`. Cleanup deletes by prefix.

## Fixture layout

- **Tenants**: `Tenant A`, `Tenant B` (two independent tenants).
- **Identities** (each: internal `users` row + `tenant_members` row):
  - Tenant A: `owner_a`, `admin_a`, `member_a`, `guest_a`
  - Tenant B: `owner_b`, `admin_b`, `member_b`, `guest_b`
  - Platform: `platform_admin` (in `user_roles`, role=`admin`)
  - Cross: `outsider` (no tenant membership)
- **Workspaces**: `Workspace A` (Tenant A), `Workspace B` (Tenant B).
- **Documents**: one per workspace.
- **Email threads / messages / states**: one per tenant.
- **Notifications**: tenant A, tenant B, identity-global, platform.

See `fixtures.sql` for the exact rows. The migration
`20260726*_batch_1a_fixture.sql` seeds schema-safe rows; auth users must be
created via the runner (see below) because inserting rows directly into
`auth.users` from a migration bypasses Supabase Auth invariants (email
confirmation, encrypted password hashing) and is disallowed by the project
rules.

## Runner (`runner.mjs`)

Requires environment variables:

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | anon key (sign-in + PostgREST) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin key (create + auto-confirm fixture users, seed teardown-safe) |
| `E2E_1A_PASSWORD` | password used for all fixture users |

Steps executed:

1. Ensure fixture rows exist (idempotent upsert by prefix).
2. Create the 10 fixture auth users via `auth.admin.createUser({ email_confirm: true })`.
3. Insert `users`, `tenant_members`, `user_roles` rows mapped to the created auth IDs.
4. Insert `workspaces`, `documents`, `email_threads`, `email_messages`,
   `email_states`, `notifications` for both tenants.
5. For each identity, obtain an access token via `signInWithPassword`.
6. For each `(actor, action, resource-tenant)` cell in `matrix.mjs`, issue the
   documented PostgREST call with the actor's bearer token and compare
   `actual` vs `expected` (`allow` / `deny`).
7. Emit `matrix.results.json` (masked tokens) and human-readable `matrix.md`.

### Cell definition

```ts
{
  actor: "member_a",
  action: "select" | "insert" | "update" | "delete" | "rpc",
  table: "documents",
  tenant: "A" | "B" | "N/A",
  filter: { id: "..." } | { workspace_id: "..." },
  expected: "allow" | "deny",
  notes?: string,
}
```

Deny is asserted by:
- SELECT returns 0 rows (RLS filters), OR
- INSERT/UPDATE/DELETE returns HTTP 4xx (RLS or FK reject), OR
- RPC returns error code from `STABLE_ERROR_CODES`.

## Why not run in the sandbox

`sandbox_exec` cannot `SET ROLE authenticated`, cannot mint JWTs, and cannot
call the Supabase Auth admin API (no service role key in sandbox env).
Execute this suite in CI or on a workstation with the env vars above.

## Cleanup

`bun run tests/runtime/tenant-isolation/teardown.mjs` deletes:
- All rows where the `name` / `email` / `slug` starts with `e2e_1a_`.
- The 10 auth users created by the runner (matched by email prefix).

No production data is touched. The runner refuses to execute against a URL
that does not match `E2E_1A_ALLOW_URL` (defensive guard).

## Governance

- Fixture prefix: `e2e_1a_` — reject overlap with production names.
- Never commit real credentials. `E2E_1A_PASSWORD` is provided at run time.
- Runner never prints full tokens; only masked prefixes (`eyJhbGc…`).
- Failure of any cell aborts with non-zero exit and preserves the
  `matrix.results.json` for triage.