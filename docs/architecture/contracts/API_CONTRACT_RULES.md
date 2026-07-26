# API & Contract Rules

1. Neutral DTOs. `src/contracts/**` MUST NOT import `@/integrations/supabase/*`.
2. Commands with mutation carry `CommandMetadata` (idempotency + optional expected row version).
3. All mutating aggregates expose `rowVersion`.
4. Tenant-scoped DTOs carry `tenantId`.
5. Public commands + event envelopes validated with Zod at trusted boundary. Never `as` past validation.
6. Failures map to `ApiErrorContract` with a code from `STABLE_ERROR_CODES`.
7. Storage via `StorageObjectRef` — never permanent public URLs in contracts.
8. No dual-write. One writer per bounded context per environment.
