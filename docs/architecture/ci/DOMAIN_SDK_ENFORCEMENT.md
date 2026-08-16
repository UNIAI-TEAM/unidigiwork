# Domain SDK Enforcement (Tasks · Documents · Meetings · Workflow)

Blueprint §25 · ADR-1D-001 §2 · linked from `PROJECT_ARCHITECTURE_RULES.md`.

## Rule

Every client-reachable file — anything under `src/routes/**`,
`src/components/**`, `src/features/**`, or `src/hooks/**` — that touches the
four business domains (Tasks, Documents, Meetings, Workflow) MUST call the
backend exclusively through `@/sdk/*`. Two hard prohibitions:

1. **No direct Supabase reads/writes** on domain tables from the client. The
   SDK is the single seam that routes to the correct backend provider
   (Lovable Cloud today, Java portability target tomorrow).
2. **No inline mock / fake domain data.** Identifiers matching
   `MOCK_*`, `FAKE_*`, `DEMO_*_DATA`, or `mock<Domain>*` are forbidden in
   client-reachable code. Seed data belongs in migrations; fixtures belong in
   `*.test.ts(x)` files.

Server functions (`src/lib/**/*.functions.ts`) remain the only place that
may talk to Supabase or the Java gateway. Components consume them via the
SDK, which enforces provider resolution and stable error mapping.

## Domain tables covered

`tasks`, `task_assignments`, `task_comments`, `task_attachments`,
`documents`, `document_versions`, `document_permissions`,
`meetings`, `meeting_participants`, `meeting_recordings`,
`workflows`, `workflow_runs`, `workflow_steps`, `workflow_step_runs`.

Extend `DOMAIN_TABLES` in `src/lib/architecture/domain-sdk-gate.test.ts` when
ADR-1D adds new tables.

## CI gate

- Test: `src/lib/architecture/domain-sdk-gate.test.ts`
- Script: `bun run test:domain-sdk`
- Runs as part of `bun run verify` (pre-merge) alongside the existing
  architecture, tenant, and RLS gates.

The gate fails when:
- A new client-reachable file calls `supabase.from("<domain_table>")`.
- A `KNOWN_DEBT_*` entry no longer violates (remove it — debt is paid).
- A client-reachable file declares an inline mock domain constant.
- `src/sdk/index.ts` stops re-exporting one of the domain barrels.

## Waiver scope (security)

`BATCH_1D_LIST_RPC` waives **read-only** domain queries made with the actor's
RLS-scoped client (`context.supabase`, or a client passed down from it). It does
NOT waive:

- **Writes** to domain tables outside a SECURITY DEFINER RPC — gated by rule
  `server-domain-write-outside-rpc` (own waiver map, own tickets).
- **Service-role access** (`supabaseAdmin`) to domain tables, which bypasses RLS
  and tenant isolation — gated by rule `server-admin-client-domain-table`.

Both rules are enforced repo-wide by the same vitest gate, so a waived read file
cannot silently grow a privileged path. Current accepted exceptions:

| File | Rule | Why it is safe |
|---|---|---|
| `src/lib/api/tasks.functions.ts` | write outside RPC | `task_attachments` insert/delete via the actor's RLS client; tenant + permission enforced by policy. Ticket `BATCH_1D_TASK_ATTACHMENTS`. |
| `src/lib/api/admin.functions.ts` | service-role | `assertAdmin`-gated, `count`-only head query on `documents`, returns no rows. Ticket `ADMIN_PLATFORM_STATS_COUNT`. |
| `src/routes/api/public/hooks/livekit-reconcile.ts` | service-role | Cron with no user session; apikey-gated read-only scan of stale `live` meetings, all writes via `ingest_meeting_provider_event` RPC (ADR-1E-001). Accepted by design. |

## Handling pre-existing debt

Known violations at introduction time are recorded in the
`KNOWN_DEBT_DIRECT_SUPABASE` / `KNOWN_DEBT_INLINE_MOCK` maps inside the test
file, keyed by relative path with a batch reference. Do **not** add new
entries. When a refactor lands, delete the entry — the test enforces it.

Current debt lives in `domain-sdk-debt.manifest.json`. Read-only server debt
(`server-supabase-from-domain`, ticket `BATCH_1D_LIST_RPC`) covers:
`calendar.functions.ts`, `dashboard.server.ts`, `meeting-rooms.functions.ts`,
`reports.functions.ts`, `work-graph.functions.ts`, `work-graph.server.ts`,
`workspace-overview.functions.ts`, `tasks/documents/meetings/workflows.functions.ts`,
`ai-context.server.ts`. Each is an RLS-scoped SELECT awaiting a list RPC.

## Server-side scope (src/lib/api, src/server)

Server actions and server functions MUST route domain reads/writes through the
domain RPCs (SECURITY DEFINER) — never `supabase.from("<domain_table>")` at the
query builder level. The command lifecycle (quota check, audit, outbox) must
run inside the RPC transaction (ADR-1D-001 §2.6). The gate covers `src/lib/api/**`
and `src/server/**` and tracks pre-existing debt in
`KNOWN_DEBT_SERVER_DIRECT_SUPABASE`.

## How to fix a violation

1. Add / reuse a server function in `src/lib/api/<domain>.functions.ts`.
2. Expose it through `@/sdk/<domain>` (extend the domain `Api` interface,
   wire the Lovable provider implementation).
3. Replace the component's Supabase call with a TanStack Query hook that
   calls `resolve<Domain>Api()`.
4. Delete any inline mock arrays; render the real empty state instead.
