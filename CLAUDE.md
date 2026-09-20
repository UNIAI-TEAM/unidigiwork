# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UNIWORK: a multi-tenant work-management SaaS. Modules include tasks, meetings (LiveKit), documents, chat, email, workflows, reports, AI copilot/agents and an AI market. The app was built with **Lovable**, and every commit to `main` syncs back to the Lovable editor. Product copy, comments and most docs are in **Vietnamese**, and Vietnamese is the default UI language.

Stack: TanStack Start (React 19, SSR) + TanStack Router (file-based) + TanStack Query, Tailwind + shadcn/ui (new-york, lucide icons), and Supabase ("Lovable Cloud") for Postgres, auth, RLS, storage and realtime. AI calls go through the Lovable AI Gateway (`src/lib/ai-gateway.server.ts`, `@ai-sdk/openai`).

## Commands

Use **bun** (CI uses `bun install --frozen-lockfile`). `bunfig.toml` blocks package versions published less than 24h ago. Ask the user before adding anything to `minimumReleaseAgeExcludes`.

```sh
bun run dev              # vite dev
bun run build            # needs 8GB heap (already set in script)
bun run typecheck        # tsc --noEmit
bun run lint             # full lint (CI tolerates failures — see LINT_BASELINE)
bun run lint:changed     # strict lint on contracts/sdk/platform/architecture (must pass)
bun run test             # vitest run (jsdom, src/**/*.{test,spec}.ts[x])
bun run verify           # typecheck + lint:changed + test + build
```

Run a single test file or test name with `bunx vitest run path/to/file.test.ts -t "test name"`.

Architecture gates. CI runs these in `.github/workflows/quality.yml`, and PRs fail on them:

```sh
bun run test:domain-sdk        # Domain SDK enforcement gate
bun run gate:domain-sdk        # same, pretty table (--rule=<id>, --json, --open)
bun run test:schema-contract   # work-graph schema drift + contract tamper
bun run test:architecture      # architecture-rules + platform-adapter
bun run test:tenant            # tenant isolation invariants (reads migrations)
bun run test:rls               # RLS policy checks
bun run test:contracts
```

Integration tests (`bun run test:integration`) run the `tests/integration/NN_*.sql|sh` files with `psql` against the database. Each file runs inside BEGIN/ROLLBACK and must print `=== PASS `. Logs go to `.lovable/reports/`.

Deployment: the `Dockerfile` builds a Nitro `node-server` output in `.output/` and runs `node .output/server/index.mjs` on port 3000. The deploy/bootstrap/ssl GitHub workflows are manual (`workflow_dispatch`) and push to the Harbor registry `registry-harbor.ubos.vn`.

## Architecture

### Source of truth and rules
`docs/architecture/UNIWORK_SAAS_ARCHITECTURE_BLUEPRINT_V1.0.md` is the SSOT, and `docs/architecture/PROJECT_ARCHITECTURE_RULES.md` summarizes it. If a request conflicts with the Blueprint, stop and report the conflict instead of changing the architecture. Key rules:
- **Tenant ≠ Workspace.** Tenant-scoped tables need `tenant_id`, `row_version`, `created_at/updated_at`, `created_by/updated_by`, and tenant-scoped RLS.
- Important lifecycle commands must go through a trusted boundary (a server function calling a Postgres RPC). Components never write directly, and there is no generic PATCH. Retryable commands carry an `idempotency_key`. Audit and outbox writes happen in the same transaction as the mutation.
- The frontend never decides the tenant or permissions. Don't hard-code plan names; check entitlements. Never mint LiveKit tokens on the client. Never store fixed public storage URLs (store provider/bucket/object_key). AI must not use unrestricted service-role access.
- No dual-write: each bounded context has exactly one writer. Supabase is the production runtime. Java/Keycloak/MinIO is a future portability target only, with no parallel writer.
- Schema changes only via new files in `supabase/migrations/`.

### Layers (`src/`)
- `routes/`: file-based routes (see `src/routes/README.md`). `__root.tsx` is the shell. `_authenticated/route.tsx` is a client-only (`ssr: false`) layout: it redirects to `/auth` and sends users without a tenant to `/onboarding`. `_authenticated/m/*` holds the mobile views. `routes/api/public/hooks/*` holds server HTTP handlers (LiveKit webhooks, outbox/quota cron). Underscore suffixes such as `tasks_.$id.tsx` opt out of parent layout nesting. `routeTree.gen.ts` is generated, so never edit it.
- `lib/api/*.functions.ts`: `createServerFn` endpoints with `.middleware([requireSupabaseAuth])` and a zod `.inputValidator`. `context.supabase` is a client scoped to the user's JWT, so RLS applies. Mutations call RPCs (`context.supabase.rpc(...)`) and pass `commandMetadataSchema` fields (idempotency/correlation). Errors go through `mapPgError` / `ensureOk` from `business.server.ts`, which turn `RAISE EXCEPTION '<STABLE_CODE>'` into `ApiError`.
- `*.server.ts`: server-only helpers. Put shared helpers used by server functions here, not as siblings inside `.functions.ts`, which trips the server-fn split. Don't import the Next.js `server-only` package (ESLint blocks it).
- `integrations/supabase/`: generated files; don't edit `client.ts`, `client.server.ts`, `auth-middleware.ts` or `types.ts`. `client.server.ts` is the service-role admin client that bypasses RLS. It must never be imported from client-reachable code or used on domain tables (gate-enforced).
- `contracts/`: versioned DTOs/commands, the stable error codes (`errors.ts`) and events. They must not import Supabase generated types.
- `sdk/`: domain API facades (tasks, meetings, documents, notifications) resolved through `sdk/core/provider.ts` (`lovable` | `java`, fail-closed, no client override). No React imports.
- `platform/`: vendor-neutral interfaces (identity, storage, realtime, tenant-context) with Supabase adapters in `platform/adapters/`. It must not import `@/integrations/supabase/*`.
- `domain/*`: pure domain logic per bounded context (work-graph, work-products, ai-*, sell-work, …).
- `features/*`: TanStack Query hooks and query keys (tenants, billing, admin). Global query cache defaults and the long-lived keys are set in `src/router.tsx`.
- `lib/i18n.tsx` (+ `lib/i18n-locales/`): languages vi/en/my/km/lo/id/ms. Don't hard-code UI strings.

### Domain SDK gate (most common CI failure)
`src/lib/architecture/domain-sdk-gate.test.ts` scans the source. Client-reachable files (`routes`, `components`, `features`, `hooks`) must not:
- call `supabase.from()` on domain tables
- declare inline mock data (`MOCK_*`, `FAKE_*`, `DEMO_*_DATA`, `mock<Domain>*`)
- import faker

Server actions must read and write domain tables only through RPCs. Existing violations are waived in `docs/architecture/ci/domain-sdk-debt.manifest.json` by rule, file and ticket, and every ticket referenced there must be declared under `tickets`. New violations fail the gate. The report is written to `.lovable/reports/domain-sdk-violations.*`.

### Build config
`vite.config.ts` uses `@lovable.dev/vite-tanstack-config`. It already includes tanstackStart, react, tailwind, tsconfig paths, nitro and the `@` alias, so **don't add those plugins again**. Pass extra Vite options through `defineConfig({ vite: {...} })`. The server entry is `src/server.ts`, which wraps SSR errors into an HTML error page. Global function middleware is in `src/start.ts`.

### Env
The variable names are in `.env.example`: Supabase URL/keys (server and `VITE_` versions), `LOVABLE_API_KEY` (AI gateway), and the LiveKit URL/key/secret/webhook secret.

## UI
For new screens or redesigns, follow `.agents/skills/unicom-ui-design/SKILL.md`: minimal enterprise SaaS in the style of Stripe/Notion/Linear/Vercel, at most 2 accent colors, no heavy gradients, buttons at least 32px tall, Vietnamese by default, i18n strings. Feature plans are in `.lovable/plan/`.
