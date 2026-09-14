# GO-2C — CANONICAL ACCEPTANCE REPORT

Status: **CLOSED** · GO2C_READY = **YES**
Date: 2026-09-14 (UTC) · Live origin: https://unidigiwork.lovable.app
Desktop client: **UniWork Office 0.10.1** (contract aligned to live API, unmodified in this task)
Supabase project ref: wjqsthhtadtbpophgclg

## 1. Scope

Office Bridge between the UniWork PWA and UniWork Office desktop. Authoritative persistence remains `documents` → `document_versions`. Office support tables: `office_sessions`, `office_save_operations`. No new Work Product model, no Work Graph, no AI Context ingestion.

## 2. Live contract

| Method | Route |
| --- | --- |
| POST | /api/office/sessions |
| POST | /api/office/sessions/exchange |
| GET | /api/office/download |
| POST | /api/office/save/prepare |
| PUT | signed upload (storage) |
| POST | /api/office/save/complete |

Live probes: 401 / 400 / 401 / 401 / 401 — all present and auth-guarded. No obsolete nested `/sessions/:id/...` contract in the production desktop client.

LIVE_OFFICE_CONTRACT_STABLE = YES · DESKTOP_0101_MATCHES_LIVE_CONTRACT = YES

## 3. Migration / runtime state

Migration `drizzle/migrations/0008_go2c_office_bridge.sql` applied in production: `office_sessions`, `office_save_operations` with RLS (owner-only SELECT). `document_versions` unchanged (SELECT + INSERT policies). Audit, access-log and outbox mechanisms reused as-is.

## 4. Golden path evidence (UniWork Office 0.10.1)

Flow: PWA → sessions → `uniwork://office/open?token=` → exchange → download → edit → Save to UniWork → prepare → signed upload → complete → new `document_versions` → reopen → edit persists.

| Format | Document | Versions | Result |
| --- | --- | --- | --- |
| DOCX | dd35c3e8-0639-4faf-b229-619e1a9fe5bb | 5 | PASS |
| XLSX | fa052007-1613-42ba-967a-eada5a6779c7 | 5 | PASS |
| PPTX | edcc0a03-3782-4699-b574-7dd1fda4f9d1 | 3 | PASS |

## 5. Idempotency

Duplicate `save/complete` with the same idempotency key → same logical version, `idempotent: true`, no duplicate row.

## 6. Conflict

Stale base version → `VERSION_CONFLICT`, **HTTP 409**, operation marked CONFLICT, no overwrite, no extra version.

## 7. Permission revocation

session 200 → download 200 → prepare OK → upload 200 → access revoked → complete **403 PERMISSION_DENIED**; version count 5 → 5; locally edited file preserved and recoverable.

## 8. Cross-tenant isolation

Tenant-B → Tenant-A document session: **403 PERMISSION_DENIED**, zero metadata leakage (no title, filename, storage path, version, tenant id). Tenant-B session → Tenant-A save operation: **404 SAVE_OPERATION_NOT_FOUND**.

## 9. Audit

`document.version_added` + paired `document.updated` rows for the controlled saves; `document_access_logs` with `OFFICE_SESSION_CREATED`, `OFFICE_DOCUMENT_OPENED`, `OFFICE_SAVE_COMPLETED`. Example: audit `939b5708…` → doc `dd35c3e8…` v5 `949aa61b…`.

## 10. Outbox

`document.version.created` events (`9acab0cd…`, `f4eb1ded…`) with tenant id, document aggregate id, matching `versionId`, status `processed`. No consumer implemented (GO-3 boundary).

## 11. PWA version history

`listDocumentVersions` reads real `document_versions` under user RLS; UI shows version number, timestamp, author, filename, size, comment and a `Latest` badge; query key `["document-versions", docId]` with targeted refresh only. Verified on the live published build (Version 1 · Latest · admin · 1 KB · "initial"), plus `Open in UniWork Office` present in the live document menu.

## 12. Security invariants

Opaque single-use launch token (hashed at rest), no Supabase JWT in the deep link, no service role in desktop or frontend, no direct desktop DB access, no token logging, no launch-token persistence, `audit_events` tenant-scoped, `outbox_events` RLS-on with zero policies, no RLS weakening.

## 13. GO-3 boundary

No Work Graph projection, GENERATES/VERSION_OF edges, graph projector, Office-to-Graph consumer, or GO-3 AI Context ingestion.

## 14. Final acceptance matrix

```
LATEST_PUBLISH_LIVE = YES
REAL_API_ORIGIN_CONFIGURED = YES
DOCX_DESKTOP_GOLDEN_PATH = PASS
XLSX_DESKTOP_GOLDEN_PATH = PASS
PPTX_DESKTOP_GOLDEN_PATH = PASS
PWA_VERSION_HISTORY_REAL = YES
PWA_LATEST_VERSION_VISIBLE = YES
IDEMPOTENCY_RUNTIME_GREEN = YES
VERSION_CONFLICT_RUNTIME_GREEN = YES
VERSION_CONFLICT_HTTP_STATUS = 409
PERMISSION_REVOCATION_RUNTIME_GREEN = YES
CROSS_TENANT_RUNTIME_GREEN = YES
NO_CROSS_TENANT_METADATA_LEAK = YES
REAL_AUDIT_RUNTIME_GREEN = YES
REAL_OUTBOX_RUNTIME_GREEN = YES
FAILED_SAVE_RECOVERABLE = YES
DOCUMENTS_AUTHORITY = YES
DOCUMENT_VERSIONS_IMMUTABLE = YES
NO_DOCUMENT_VERSION_UPDATE = YES
VERSION_INCREMENT_CORRECT = YES
NO_USER_JWT_IN_DEEP_LINK = YES
NO_SERVICE_ROLE_IN_DESKTOP = YES
NO_SERVICE_ROLE_IN_FRONTEND = YES
DESKTOP_DIRECT_DB_ACCESS = NO
TOKEN_LOGGING_FOUND = NO
LAUNCH_TOKEN_PERSISTED = NO
NO_PUBLIC_AUDIT_EXPOSURE = YES
NO_PUBLIC_OUTBOX_EXPOSURE = YES
NO_RLS_WEAKENING = YES
LIVE_OFFICE_CONTRACT_STABLE = YES
DESKTOP_0101_MATCHES_LIVE_CONTRACT = YES
GO2C_INTRODUCED_REGRESSION_COUNT = 0
NO_GO3_IMPLEMENTATION = YES
```

## 15. Verdict

GO2C_READY = **YES**
GO2C_STATUS = **CLOSED**
NEXT_RECOMMENDED_PHASE = **GO-3 — Work Product + Work Graph Projection** (not started in this task).
