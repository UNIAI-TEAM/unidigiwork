# GO-4 — Execution authority

## Decision

**`CANONICAL_EXECUTION_AUTHORITY` = `public.ai_task_executions`**  
**`CANONICAL_EXECUTION_ID` = `ai_task_executions.id`**  
**`EXECUTION_MODEL_SINGLE_AUTHORITY = YES`** (after GO-4 generalization; table name unchanged)

All `work_execution_*` rows FK to `ai_task_executions`. HUMAN and AI share this table. `workflow_runs` / `workflow_agent_runs` remain internal. `work_units` remains catalog (`bind_work_product_execution` is **not** Execution → Work Product).

## Executor rules

| executor_type | ai_worker_id | executor_user_id |
| --- | --- | --- |
| AI | required | null |
| HUMAN | null | required |

No HYBRID row type. Hybrid provenance = multiple execution rows linked to the same Work Product.

Existing rows backfilled `executor_type = AI`.

## HUMAN vs AI WEE

HUMAN rows are provenance. They do **not** run CONTEXT→PLAN→GENERATE→ACTION→VALIDATE→REVIEW. `start_human_task_execution` inserts `WAITING_REVIEW` with zero steps. `orchestrateWorkExecution` remains AI-only.

## What is not execution authority

- `work_execution_steps` — STEP
- `ai_usage_events` — TELEMETRY
- `workflow_agent_runs` — AGENT_INTERNAL_RUN
- `workflow_runs` — WORKFLOW_INTERNAL_RUN
- `work_units` — catalog
- `work_products` — deliverable
- `work_nodes` / `work_edges` — derived graph
