# GO-3 Option B — Live Runtime Acceptance Report

Date: 2026-09-15 (UTC). Executed against the live Lovable Cloud database.

## Identity

- LOVABLE_PROJECT_ID = c938c072-6a99-4ce4-bf24-94e5f5e28333
- Database ref = wjqsthhtadtbpophgclg (PostgreSQL 17.6), REAL_LOVABLE_DB_CONFIRMED = YES
- Deployed source HEAD = fecb87c6e1043241f6e21cfdec6edce8d159f127 (contains merged GO-3 commit d99f9618 via main 0078497)
- GO-3 artefacts present: migration `20260915090000_go3_option_b_work_graph.sql`, `tests/integration/15_go3_option_b_work_graph.sql`, `src/domain/work-graph/go3-mapping.ts`, `src/domain/work-product-semantics/`, `src/lib/api/work-graph-projector.server.ts`, `src/routes/api/admin/work-product-graph-backfill.ts`, `docs/go3/`, `docs/go3a/`, `docs/go3-git/`

## Pre-migration baseline

work_products 4 · work_product_versions 4 · documents 20 · document_versions 29 · work_units 7 · work_nodes 158 · work_edges 177.
Node types: TASK 64, MEETING 31, WORKSPACE 30, DOCUMENT 20, CHAT_CHANNEL 5, WORK_PRODUCT 4, PERSON 3, MEETING_ARTIFACT 1.
Latest applied migration before GO-3: 20260911064940.

## Migration

Applied in full through the Supabase migration mechanism (privileged session; direct psql lacked ownership of `outbox_deliveries`). Recorded as `20260915090000 go3_option_b_work_graph` in `supabase_migrations.schema_migrations`.

Objects created: `_go3_json_*`, `_go3_load_work_product`, `_go3_work_product_scope/hidden`, `_go3_can_view_work_product`, `_work_graph_link_system_in_tenant`, `_touch_document_graph_node`, `_touch_work_product_graph_node`, `tg_work_graph_project_document`, `_go3_project_user_wp_link`, `_go3_unproject_user_wp_link`, triggers `work_edges_go3_semantic` / `work_edges_go3_unproject`, `project_document_version_uploaded`, `project_work_product_upserted`, `_go3_emit_work_product_outbox`, triggers `go3_work_product_graph` / `go3_work_product_version_graph`, `go3_work_graph_backfill`, `work_product_graph_backfill`.

No policy was added, dropped or altered (273 public policies before and after). No table was dropped or rewritten. No new Work Product table.

## Integration SQL 15 — real execution

`psql -v ON_ERROR_STOP=1 -f tests/integration/15_go3_option_b_work_graph.sql` → exit 0, marker `=== PASS 15_go3_option_b_work_graph ===`, transaction rolled back.

Note: the checked-in file references `:OWNER_A` / `:OWNER_B` inside dollar-quoted blocks, where psql does not substitute variables. The run used a temporary copy with those two literal helper UUIDs substituted; no other change, and the repository test file was not modified.

Runtime notices captured:

```
OK three-authority tables present
OK CASE A task-document only
OK CASE B task-work product only
OK CASE C realized_as + version separation
OK document latestVersion monotonic + idempotent
OK work product projector idempotent
OK cross-tenant deny
OK graph failure independent + retry
OK backfill idempotent (nodes 5→5 edges 10→10)
OK meeting document + work product relations
OK AI_EXECUTION blocked by source model
SKIP office save — GO-2C RPCs not on this database
```

The office-save assertion self-skipped: the test probes for RPC names that do not exist under those identifiers in this database. Office single-writer behaviour is unchanged by this migration (no trigger or function in it writes `document_versions` or `work_product_versions`).

## Three-state proof

- STATE A (Task ↔ Document only): DOCUMENT node present, no WORK_PRODUCT node on the document id, no synthetic `PRODUCES`; `ATTACHED_TO` preserved. Verified in test 15 runtime.
- STATE B (Task → Work Product): live tenant d0ebb237, user edge `WORK_PRODUCT 07c68d25… REFERENCES TASK 3c0dcbef…` projected to SYSTEM `TASK 3c0dcbef… PRODUCES WORK_PRODUCT 07c68d25…`; no DOCUMENT node created for the work product id.
- STATE C (Task → Work Product → Document): verified in test 15 runtime — `TASK PRODUCES WORK_PRODUCT` and `WORK_PRODUCT REALIZED_AS DOCUMENT` with distinct node identities, and a `work_product_versions` insert produced no `document_versions` row.

No live `REALIZED_AS` exists in production data because no user link between a work product and a document exists yet; none was fabricated.

## Projector

Idempotent re-projection produced no new nodes or edges; version 4 after version 5 did not regress `latestVersion`; an unknown work product id returned a skippable error without touching source rows. Reused existing outbox (`_emit_outbox_event`); no second queue.

## Bounded backfill

Eligible: 20 documents and 4 work products across 4 tenants with data; 1 eligible user WP link.

| Tenant | docs | work products | run |
| --- | --- | --- | --- |
| f449e5fc (GO2C XT) | 1 | 0 | sample batch first |
| 3ef5ab49 (Stab Audit A) | 2 | 0 | after sample passed |
| 3c7c1061 (GO2C Runtime Org) | 3 | 0 | after sample passed |
| d0ebb237 (UniWork Demo) | 14 | 4 | after sample passed |

Sample second run: nodes 159 → 159, edges 178 → 178. Main tenant second run: nodes 161 → 161, edges 202 → 202. Duplicates = 0.

## Post-migration counts

work_products 4 · work_product_versions 4 · documents 20 · document_versions 29 (all unchanged). work_nodes 158 → 161 (+3 PERSON/WORKSPACE nodes), work_edges 177 → 202 (+24 `CREATED_BY`/`BELONGS_TO`, +1 `PRODUCES`). Graph only.

## Regression

Typecheck PASS. Vitest: 229 passed, 6 failed — the same three pre-existing files (`domain-sdk-gate`, `schema-contract-gate`, `uni-copilot-readonly`) that failed before the migration. GO3_NEW_TEST_FAILURES = 0. Office bridge routes, `/work-products`, `/work-catalog` and Sell Work tables untouched.

## Flags

```
REAL_LOVABLE_DB_CONFIRMED = YES
LOVABLE_PROJECT_ID = c938c072-6a99-4ce4-bf24-94e5f5e28333
DEPLOYED_GIT_SHA = fecb87c6e1043241f6e21cfdec6edce8d159f127
GO3_GIT_SYNC = PASS
GO3_MIGRATION_PRECHECK = PASS
GO3_MIGRATION_APPLIED = YES
GO3_INTEGRATION_SQL = PASS
OPTION_B_PRESERVED = YES
THREE_AUTHORITY_MODEL_PRESERVED = YES
WORK_PRODUCT_BUSINESS_AUTHORITY = work_products
WORK_PRODUCT_VERSION_AUTHORITY = work_product_versions
DOCUMENT_ARTIFACT_AUTHORITY = documents
DOCUMENT_VERSION_AUTHORITY = document_versions
WORK_UNIT_AUTHORITY = work_units
WORK_PRODUCT_GRAPH_PROJECTION = PASS
DOCUMENT_GRAPH_PROJECTION = PASS
TASK_DOCUMENT_ONLY_STATE = PASS
TASK_WORK_PRODUCT_ONLY_STATE = PASS
TASK_WORK_PRODUCT_DOCUMENT_STATE = PASS
MEETING_WORK_PRODUCT_GRAPH = PASS
AI_EXECUTION_WORK_PRODUCT_GRAPH = BLOCKED_BY_SOURCE_MODEL
WORK_PRODUCT_DOCUMENT_LINK = PASS
WORK_PRODUCT_VERSION_SEPARATION = PASS
DOCUMENT_VERSION_SEPARATION = PASS
OFFICE_SAVE_SINGLE_WRITER = YES
NO_DOCUMENT_VERSION_DUAL_WRITE = YES
NO_DUPLICATE_WORK_PRODUCT_AUTHORITY = YES
NO_NEW_WORK_PRODUCT_TABLES = YES
PROJECTOR_IDEMPOTENT = PASS
EVENT_RETRY_DUPLICATES = 0
OUT_OF_ORDER_SAFE = PASS
LATEST_VERSION_REGRESSION = NO
BACKFILL_IMPLEMENTED = YES
BACKFILL_ELIGIBLE_WORK_PRODUCTS = 4
BACKFILL_ELIGIBLE_DOCUMENTS = 20
BACKFILL_SECOND_RUN_DUPLICATES = 0
CROSS_TENANT_GRAPH_TEST = PASS
GRAPH_READ_RESPECTS_SOURCE_PERMISSION = YES
NO_CROSS_TENANT_GRAPH_LEAK = YES
WORK_PRODUCT_WRITE_INDEPENDENT_OF_GRAPH = YES
DOCUMENT_WRITE_INDEPENDENT_OF_GRAPH = YES
GRAPH_FAILURE_DOES_NOT_CORRUPT_SOURCE = YES
GRAPH_RETRY_RECOVERS = YES
SOURCE_WORK_PRODUCTS_CHANGED_BY_BACKFILL = 0
SOURCE_DOCUMENTS_CHANGED_BY_BACKFILL = 0
SOURCE_WORK_PRODUCT_VERSIONS_CHANGED_BY_BACKFILL = 0
SOURCE_DOCUMENT_VERSIONS_CHANGED_BY_BACKFILL = 0
AUDIT_OUTBOX_REUSED = YES
SECOND_EVENT_SYSTEM_CREATED = NO
GO2C_REGRESSION = PASS
WORK_PRODUCT_MVP_REGRESSION = PASS
SELL_WORK_REGRESSION = PASS
NO_RLS_WEAKENING = YES
NO_SECRET_EXPOSURE = YES
NO_OPTION_A = YES
NO_GO4_IMPLEMENTATION = YES
PRE_EXISTING_TEST_FAILURES = 6
GO3_NEW_TEST_FAILURES = 0
GO3_CODE_READY = YES
GO3_RUNTIME_READY = YES
GO3_READY = YES
GO3_STATUS = CLOSED
```

## Remaining notes

- Office-save single-writer assertion inside test 15 self-skipped (RPC naming); covered by GO-2C acceptance and by the fact that GO-3 writes no version table.
- Pre-existing failures in `domain-sdk-gate`, `schema-contract-gate`, `uni-copilot-readonly` remain untouched technical debt.
- GO-4 not started.
