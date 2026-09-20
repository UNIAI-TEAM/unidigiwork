# GO-4 — Live runtime acceptance report

Date: 2026-09-15 (UTC)

## 1. Source identity

| Item | Value |
| --- | --- |
| Repository | https://github.com/UNIAI-TEAM/unidigiwork.git |
| Canonical main after GO-4 merge | `8fa5306f3391d63e9a365c5f47b768eca27b27ec` |
| GO-4 commit contained in main | `55a840a0e00760784cae21787f726597caf02435` (PR #2) |
| Migration | `supabase/migrations/20260915120000_go4_execution_work_product.sql` (586 lines) |
| Integration test | `tests/integration/16_go4_execution_work_product.sql` (388 lines) |
| GO-3 present | `20260915090000_go3_option_b_work_graph.sql`, test 15 |
| docs/go4/ | 12 files present |

`GO4_GIT_SYNC = PASS`.

## 2. Live database identity

| Item | Value |
| --- | --- |
| LOVABLE_PROJECT_ID | c938c072-6a99-4ce4-bf24-94e5f5e28333 |
| Database ref | wjqsthhtadtbpophgclg (Lovable Cloud) |
| POSTGRES_VERSION | PostgreSQL 17.6 (aarch64-unknown-linux-gnu) |
| DEPLOYED_GIT_SHA | 8fa5306f3391d63e9a365c5f47b768eca27b27ec (+ local WIP commit) |

`REAL_LOVABLE_DB_CONFIRMED = YES`.

## 3. Pre-migration snapshot

| Table | Count |
| --- | --- |
| ai_task_executions | 20 (0 with NULL ai_worker_id) |
| work_execution_steps | 120 |
| work_products | 4 |
| work_product_versions | 4 |
| documents | 20 |
| document_versions | 29 |
| work_units | 7 |
| work_nodes | 161 |
| work_edges | 202 |

`executor_type` absent, `execution_work_products` absent, `EXECUTION` node type absent.
Last applied migration: `20260915090000`.

## 4. Migration precheck

All assumptions verified against live schema: `ai_task_executions` has
`tenant_id/workspace_id/task_id/ai_worker_id/status/revision/evidence/created_by/updated_at`;
`public.users.id` is uuid; `work_nodes_entity_type_check` present and extendable;
`_go3_can_view_work_product`, `_go3_work_product_scope`, `_work_graph_link_system_in_tenant`,
`_touch_work_product_graph_node`, `is_tenant_member`, `_emit_outbox_event` all present;
`execution_work_products` not claimed by another authority; migration additive/forward-only.

`GO4_MIGRATION_PRECHECK = PASS`.

## 5. Migration application

Applied through the privileged Lovable/Supabase SQL path (sandbox psql role is not the table
owner, so schema DDL is executed by the platform `postgres` role) and recorded once in
`supabase_migrations.schema_migrations` as version `20260915120000`.

Post-apply verification: executor columns + `step_write_failure_count` present;
`ai_task_executions_executor_chk` present with canonical AI/HUMAN definition;
`execution_work_products` created with indexes, unique `(execution_id, work_product_id)`,
RLS enabled, 2 policies (SELECT tenant-scoped, INSERT `WITH CHECK (false)`), tenant guard trigger;
4 EXECUTION relationship types registered; 9 GO-4 functions created.

`GO4_MIGRATION_APPLIED = YES`.

## 6. Existing AI row backfill

PRE_EXISTING_EXECUTION_ROWS = 20, BACKFILLED_AS_AI = 20, HUMAN rows created by backfill = 0,
INVALID_EXISTING_EXECUTOR_ROWS = 0, historical `ai_worker_id` unchanged,
`execution_work_products` rows created by migration = 0.

## 7. Integration test 16 (real execution)

`psql -v ON_ERROR_STOP=1 -f tests/integration/16_go4_execution_work_product.sql` → **exit 0**.

Notices: authorities distinct; SCENARIO A human; SCENARIO B ai; SCENARIO C hybrid;
REALIZED_AS + no office dual-write; durable step write failure; projector idempotent retry;
backfill second run duplicates 0; cross-tenant link denied; cross-tenant graph deny;
source independent of projector failure; no invented historical junctions.
Test is transactional and rolls back.

Harness note: psql does not interpolate `:OWNER_A`/`:OWNER_B` inside dollar-quoted blocks, so the
file was run with those two fixture UUIDs substituted textually. No test logic was modified.

`GO4_INTEGRATION_SQL = PASS`.

## 8-11. Committed runtime scenarios (tenant `a51a3de2-…f94c`, label `itest_go4_acceptance`)

| Evidence | Value |
| --- | --- |
| Task | 157489a7-67e6-4ef2-94e8-9c10e294cfa9 |
| HUMAN execution | 3f9a3642-279c-45d1-9e5c-90e8f0bb4269 (`executor_user_id` set, `ai_worker_id` NULL, 0 steps) |
| AI execution | 0fa6a32a-468a-4572-9d17-504f1904d6f9 (`ai_worker_id` 6cde0670-…, WEE path `start_ai_task_execution` → `finish_ai_task_execution`) |
| Work Products | 8b32b374-… (Board Report, APPROVED), da9bf10e-… (Financial Sheet) |
| Junction rows | 3 (human→2 WPs; 2 executions→WP1) |
| Duplicate link attempt | returned `idempotent: true`, no new row |
| EXECUTION nodes | 2 · HAS_EXECUTION edges 2 · EXECUTION→PRODUCES 3 |
| Work Product approved while execution stays WAITING_REVIEW | yes |

EXECUTION_TO_MULTIPLE_WP = PASS, MULTIPLE_EXECUTIONS_TO_ONE_WP = PASS,
DUPLICATE_EXECUTION_WP_LINKS = 0, no HYBRID executor row, no duplicate Work Product.

## 12. Durable failure telemetry

`record_execution_step_write_failure` called on the AI execution in one connection;
re-read in a **separate database session/request** returned
`step_write_failure_count = 1` and `evidence.lastStepWriteFailure.reason = ACC_CONTROLLED_FAILURE`.
No process-local state is needed for recovery.
Infrastructure restart could not be induced safely → `PROCESS_RESTART_RUNTIME_PROOF = NOT_TESTABLE`;
cross-request durable DB proof is satisfied.

## 13. Execution vs Work Product acceptance

WP1 review APPROVED + `work_products.status = APPROVED` while both executions remain
`WAITING_REVIEW`. No outcomes table exists or was created.

## 14-16. Graph projection, idempotency, out-of-order

Graph carries EXECUTION nodes and HAS_EXECUTION / PRODUCES edges only as projection;
`ai_task_executions` + `execution_work_products` remain the authorities.
Repeated `project_execution_created` / `project_execution_work_product_linked` produced no
duplicate node or edge; a link projection for a non-existent junction returns an error instead of
inventing facts; older/duplicate replays do not regress node metadata (GO-3 test 15 also re-proves
latestVersion monotonicity). Source records survive projector failure (test 16 section).

## 17. Bounded backfill

BACKFILL_ELIGIBLE_EXECUTIONS = 22 (20 pre-existing production + 2 fixture);
BACKFILL_ELIGIBLE_EXECUTION_WP_LINKS = 3 (fixture only; no historical junction invented).
Small batch (limit 3) first, then full tenant, then repeat:
work_nodes 188 / work_edges 257 before and after the repeat run → duplicates 0.
Production tenant now has 20 EXECUTION nodes and 20 HAS_EXECUTION edges, 0 invented PRODUCES.

## 18. Business source immutability

| Table | Pre | Post | Backfill-caused change |
| --- | --- | --- | --- |
| work_products | 4 | 6 (+2 acceptance fixture) | 0 |
| work_product_versions | 4 | 4 | 0 |
| documents | 20 | 20 | 0 |
| document_versions | 29 | 29 | 0 |
| work_units | 7 | 7 | 0 |
| ai_task_executions | 20 | 22 (+2 acceptance fixture) | 0 |

## 19. Cross-tenant security

Test 16 proved: cross-tenant `link_execution_work_product` denied (fail-closed), junction tenant
trigger raises `CROSS_TENANT`, and cross-tenant graph reads return nothing (no node, edge,
executor or Work Product metadata leaked). RLS unchanged elsewhere; junction INSERT is
`WITH CHECK (false)` so only the trusted RPC writes.

## 20. CHECK invariant negative tests (live, rolled back)

| Case | Result |
| --- | --- |
| AI with NULL ai_worker_id | rejected, SQLSTATE 23514 |
| HUMAN with NULL executor_user_id | rejected, 23514 |
| HUMAN with ai_worker_id set | rejected, 23514 |
| executor_type = 'HYBRID' | rejected, 23514 |

## 21-25. Regressions

- Office/document authority: `document_versions` count unchanged by every GO-4 operation;
  test 16 explicitly asserts no dual write when a Work Product version is created.
- GO-3: `tests/integration/15_go3_option_b_work_graph.sql` re-run → **exit 0**, states A/B/C pass,
  REALIZED_AS intact, direct `TASK → PRODUCES → WORK_PRODUCT` preserved.
- Work Product MVP: create / version / review / approve exercised live in the fixture.
- Sell Work: `work_units` untouched (7), `execution_work_products` never references work_units.
- WEE AI flow: `assign_task_to_ai` → `start_ai_task_execution` → `finish_ai_task_execution`
  succeeded post-migration with `executor_type = AI`.

## 26. Outbox / audit

Existing `outbox_events` + `_emit_outbox_event` reused; `execution.execution.created` and
`execution.work_product.linked` recorded (4 events in acceptance). No second event system.

## 27. Post-migration counts

ai_task_executions 22 (AI 21 / HUMAN 1), execution_work_products 3, work_execution_steps 120,
work_products 6, work_product_versions 4, documents 20, document_versions 29, work_units 7,
work_nodes 188 (EXECUTION 22), work_edges 257 (HAS_EXECUTION 22, EXECUTION→PRODUCES 3).

## 28. Test suite

Baseline main/feature: 6 failures / 237 pass. Post-migration run: 6 failed / 237 passed
(`domain-sdk-gate` 4, `schema-contract-gate` 1, `uni-copilot-readonly` 1) — identical pre-existing set.
`GO4_NEW_TEST_FAILURES = 0`.

## 29. Sell Work provenance query

For WP `8b32b374-…` (APPROVED) a single deterministic join over
`work_products → execution_work_products → ai_task_executions → tasks` returns: originating task,
both contributing executions, executor type, human executor id / AI worker id, start and completion
timestamps, step counts, step-write failure count, junction role (CREATED / CONTRIBUTED) and the
Work Product review decision. No title or timestamp inference.

## 30. Fixtures

Tenant `itest_go4_acceptance` (`a51a3de2-…f94c`) is retained as labeled acceptance evidence.
No real customer business record was altered.

## 31. Limitations

- Process-restart durability proven across separate DB sessions/requests, not by inducing an
  infrastructure restart.
- Integration test 16 required textual substitution of the two fixture owner UUIDs to run under psql.
- The six pre-existing unit-test failures remain untouched.
