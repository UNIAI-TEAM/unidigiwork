# GO-4 implementation report

**Branch:** `feature/go4-execution-work-product`  
**Base:** `f090f45477c57e076e95793b8a1af7633712c551` (`origin/main`, GO-3 closed)  
**Migration:** `supabase/migrations/20260915120000_go4_execution_work_product.sql`  
**Not applied to production from Cursor.**

## What landed

1. **`ai_task_executions` generalized** — `executor_type` `AI|HUMAN`, nullable `ai_worker_id` (AI required), `executor_user_id` (HUMAN required). Existing rows backfilled `AI`. Table name unchanged. No `work_executions` table.
2. **`execution_work_products`** — N:M junction, tenant guard, unique `(execution_id, work_product_id)`, roles `CREATED|CONTRIBUTED`. Writes only via `link_execution_work_product`.
3. **HUMAN provenance** — `start_human_task_execution` inserts WAITING_REVIEW without AI WEE steps. Orchestrator was not rewritten and does not call this RPC.
4. **Graph** — node `EXECUTION` (`entity_id = ai_task_executions.id`). Edges `HAS_EXECUTION`, `EXECUTION PRODUCES WORK_PRODUCT`. GO-3 `TASK/MEETING PRODUCES WORK_PRODUCT` and `REALIZED_AS` retained. Shortcut `TASK PRODUCES` also projected from junction + `task_id`.
5. **Outbox reused** — `execution.execution.created`, `execution.work_product.linked`, plus existing `task.ai.execution_started`.
6. **Durable telemetry** — `step_write_failure_count` + `record_execution_step_write_failure`. Map is cache only.
7. **Backfill** — `go4_execution_graph_backfill` projects existing executions and **existing** junctions only. No invented historical Execution→WP links.

## Dual review (unchanged authorities)

- Execution: `accept_ai_task_execution`
- Work Product: `work_product_reviews` + `work_products.status`
- Outcome: derived from WP acceptance. **No outcomes table.**

## Governance gap (documented, not Action Intent v2)

`needsAction` still maps to `CREATE_TASK` only. GO-4 does **not** add `CREATE_WORK_PRODUCT` / `LINK_WORK_PRODUCT` as governed AI actions. Linking is a trusted human/server RPC. AI-generated WPs must still be created through existing WP MVP + `link_execution_work_product`.

## Tests

- Unit: `go4-mapping.test.ts`, `go4-execution-authority.test.ts`, projector classification
- Integration: `tests/integration/16_go4_execution_work_product.sql` (A/B/C, graph, tenant, backfill, durability)

## Out of scope (held)

Billing, marketplace, Outcome Cloud, WEE rewrite, Office, GO-5, HYBRID as a row-level executor_type.
