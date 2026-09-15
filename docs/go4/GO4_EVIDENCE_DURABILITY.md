# GO-4 — Evidence durability (implemented)

## Durable (Postgres)

| Source | Answers |
| --- | --- |
| `ai_task_executions` | executor_type, executor_user_id / ai_worker_id, status, deliverable, quality, reviewed_by/at, **`step_write_failure_count`**, evidence jsonb |
| `work_execution_steps` | AI WEE steps only (HUMAN rows have none) |
| `execution_work_products` | what was produced |
| `work_execution_metrics` / `work_execution_costs` | duration, tokens, cost |
| `ai_action_proposals` | proposed writes |
| `outbox_events` | started / created / linked / accepted |
| `work_product_versions` / `work_product_reviews` | WP change + business review |

## Process-local cache (non-authoritative)

`processStepWriteFailures` Map remains **only** as an in-process cache. Durable writes go through `record_execution_step_write_failure`.

**`EXECUTION_EVIDENCE_DURABLE = YES`** (step failures stored on the execution row)  
**`EXECUTION_TELEMETRY_DURABLE = YES`** for GO-4 provenance  
**`IN_MEMORY_TELEMETRY_AUTHORITATIVE = NO`**

If both the step RPC and the failure RPC fail, the run still continues (fail-open for business work). Completeness is `PARTIAL` via `reconcile_work_execution_steps`.
