# Architecture Test Strategy

- **Contract tests** — `src/contracts/**/*.test.ts`. Error catalogue uniqueness, event envelope naming, schema validation, forbidden payload fields.
- **Architecture scanner** — `src/lib/architecture/architecture-rules.test.ts`. No service-role client in components/routes/hooks, no LiveKit token fabrication in routes, contracts free of Supabase types, SDK free of React imports, no client-side backend override.
- **Platform adapters** — `src/lib/architecture/platform-adapter.test.ts`. Provider defaults Lovable, Java fails closed, Task SDK returns NOT_IMPLEMENTED, tenant-context fabrication forbidden.
- **Tenant isolation (static)** — checks every tenant-scoped table has `tenant_id` + RLS enabled in migrations.
- **RLS policies (static)** — verifies `is_tenant_member` / `has_tenant_role` helpers + immutable `audit_events` trigger.

Runtime cross-tenant matrix requires a two-tenant fixture DB. Runs as external CI gate, not `bun run test`. Never report runtime PASS when skipped.
