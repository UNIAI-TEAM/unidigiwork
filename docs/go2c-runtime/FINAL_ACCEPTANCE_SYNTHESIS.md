# GO-2C — FINAL ACCEPTANCE SYNTHESIS (RUNTIME)

Date: 2026-09-14 (UTC)
Live origin: https://unidigiwork.lovable.app
Project: c938c072-6a99-4ce4-bf24-94e5f5e28333 · Supabase ref: wjqsthhtadtbpophgclg
Desktop client: UniWork Office 0.10.1 (unchanged in this task)

## 1. Published build verification (live only, no preview evidence)

Authenticated Playwright run against https://unidigiwork.lovable.app:

- `/documents` renders; document selected: `Biên bản quyết định kiến trúc tuần 98eb54c3` (`66ae40a1-…`)
- Document history modal (live): `Version 1` + `Latest` badge, `8/27/2026, 8:47:11 AM`, `admin · 1 KB`, comment `initial`, plus `Refresh` (targeted refetch, query key `["document-versions", docId]`)
- Access log rows rendered from `document_access_logs`
- Document menu (live) contains `Open in UniWork Office`
- No console errors

Note: the first live check (pre-republish) still served the older bundle showing "No history yet". The project was republished and re-verified; the live build now serves the real `document_versions` history.

Office API on live origin (unauthenticated probes, route liveness only):

| Route | Status |
| --- | --- |
| POST /api/office/sessions | 401 |
| POST /api/office/sessions/exchange | 400 |
| GET /api/office/download | 401 |
| POST /api/office/save/prepare | 401 |
| POST /api/office/save/complete | 401 |

All routes live and auth-guarded; no 404, no obsolete nested `/sessions/:id/...` route required.

LATEST_PUBLISH_LIVE = YES · PWA_VERSION_HISTORY_LIVE = YES · PWA_OFFICE_CTA_LIVE = YES · OFFICE_API_STILL_LIVE = YES

## 2. Desktop golden paths (existing evidence, not rerun)

DOCX / XLSX / PPTX = PASS on UniWork Office 0.10.1 via
sessions → deep link `uniwork://office/open?token=` → exchange → download → edit → save prepare → signed PUT → save complete → new `document_versions` → reopen → edit persists.

Golden documents in production:
- DOCX `dd35c3e8-0639-4faf-b229-619e1a9fe5bb` — 5 versions
- XLSX `fa052007-1613-42ba-967a-eada5a6779c7` — 5 versions
- PPTX `edcc0a03-3782-4699-b574-7dd1fda4f9d1` — 3 versions

## 3. Versioning invariant

`documents` = identity; `document_versions` = append-only history. Code paths touching `document_versions` are SELECT + a single INSERT in `save.complete.ts` / `office-bridge.server.ts`; no UPDATE or DELETE of prior version rows anywhere in `src`. Version numbers increment monotonically per document (verified 1→5 on the DOCX golden document).

## 4. Idempotency

Duplicate `save/complete` with the same idempotency key returns the already-created logical version (`idempotent: true`) and creates no second row. Save operations carry `office-save:<operationId>` into the command layer.

## 5. Conflict

Stale base version → `VERSION_CONFLICT`, HTTP 409, operation marked `CONFLICT`, no overwrite, no extra version row.

## 6. Permission revocation

session 200 → download 200 (940 bytes retained locally) → prepare OK → signed PUT 200 → access revoked → save complete **403 PERMISSION_DENIED**; version count unchanged 5 → 5; local edited file preserved.

## 7. Cross-tenant isolation

- Tenant-B user → Tenant-A document session: **403 PERMISSION_DENIED**, body contains no title, filename, storage path, version or tenant identifiers.
- Tenant-B Office session → Tenant-A save operation: **404 SAVE_OPERATION_NOT_FOUND**.
- Download stays scoped to the session's own document.

## 8. Audit

Real rows tied to the controlled GO-2C saves (tenant `3c7c1061-…`):
- `08b6e08b…` `document.version_added` · doc `edcc0a03…` · v3 `be7524b6…` · 15:37:19Z
- `939b5708…` `document.version_added` · doc `dd35c3e8…` · v5 `949aa61b…` · 15:34:36Z
- paired `document.updated` rows; `document_access_logs` `42f66ab7…` with `OFFICE_SESSION_CREATED`, `OFFICE_DOCUMENT_OPENED`, `OFFICE_SAVE_COMPLETED`.

## 9. Outbox

`9acab0cd…`, `f4eb1ded…` — type `document.version.created`, tenant `3c7c1061-…`, aggregate = document id, payload `versionId` matches the audited version, status `processed`. No consumer implemented.

## 10. Failed save recovery

`save/complete` without an actual upload → `UPLOAD_NOT_FOUND` (409); no corrupt version created; retry after a correct upload succeeds; local file remains recoverable.

## 11. Security invariants

- Deep link carries only an opaque one-time launch token (hashed server-side); no Supabase JWT.
- No service-role key in desktop or frontend; admin client is server-only (`client.server.ts`).
- No direct desktop database access — all traffic through the five HTTP routes.
- No token logging; launch token not persisted in plaintext, single-use.
- `audit_events`: RLS on, authenticated tenant-member SELECT only. `outbox_events`: RLS on, zero policies. `office_sessions` / `office_save_operations`: RLS on, owner-only SELECT. `document_versions`: RLS on, member INSERT + document-access SELECT.
- No RLS weakened by GO-2C.

## 12. GO-3 boundary

No Work Graph projection, no GENERATES / VERSION_OF edges, no graph projector, no Office-to-Graph consumer, no GO-3 AI Context ingestion. Pre-existing work-graph/AI-context modules predate GO-2C and were not touched.

## 13. Test debt

Remaining failures are pre-existing and unrelated: `schema-contract-gate`, `uni-copilot-readonly`, `domain-sdk-gate`. GO-2C introduced regressions: 0.

## Verdict

GO2C_READY = YES · GO2C_STATUS = CLOSED
NEXT_RECOMMENDED_PHASE = GO-3 — Work Product + Work Graph Projection (not started).
