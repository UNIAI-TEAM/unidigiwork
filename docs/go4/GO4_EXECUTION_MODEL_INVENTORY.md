# GO-4 — Execution model inventory

Inspected: `/Users/uranus/Projects/unidigiwork-canonical` `main` `f090f454` (contains GO-3 merge `0078497a` + runtime report).  
GO-3 remains closed. No tables or runtime were changed in this phase.

## Canonical identity of an execution *today*

There is **no** table named `work_executions`. The persisted WEE/AI runtime root is:

**`public.ai_task_executions`**  
Primary key: `id` (uuid).  
Required executor: `ai_worker_id` (NOT NULL → AI-only).  
Task: `task_id` (NOT NULL, unique with `revision`).  
Tenant / workspace: `tenant_id`, `workspace_id`.

Human Work Product MVP writes `work_products` with `created_by` / `owner_id` and **does not** create an execution row.

## Classification of execution-like models

| TABLE / ENTITY | CLASS | PURPOSE | PK | TENANT | TASK | EXECUTION | WORK PRODUCT | DOCUMENT | STATUS | AUTHORITY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ai_task_executions` | **CANONICAL_EXECUTION (AI/WEE only)** | One AI attempt/revision of a Task | `id` | `tenant_id` | `task_id` | self | **none (FK)**; `work_unit_*` is catalog; `deliverable_*` is inline text | none | `QUEUED/RUNNING/WAITING_REVIEW/CHANGES_REQUESTED/ACCEPTED/FAILED` | Authoritative for AI Task Execution |
| `work_execution_steps` | STEP | CONTEXT→PLAN→GENERATE→ACTION→VALIDATE→REVIEW | `id` | `tenant_id` | `task_id` | `execution_id` → `ai_task_executions` | none | none | `PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED/AWAITING_CONFIRMATION` | Authoritative step log |
| `work_execution_metrics` | DERIVED | Duration, tokens, SLA, revision_count | `id` | `tenant_id` | `task_id` | `execution_id` | none | none | copies execution/quality | Derived |
| `work_execution_costs` | DERIVED | Human/AI/platform cost | `execution_id` 1:1 | `tenant_id` | via execution | `execution_id` | none | none | completeness flags | Derived |
| `work_execution_feedback` | TELEMETRY | Partner usefulness survey | `id` | `tenant_id` | via execution | `execution_id` | none | none | usefulness | Optional |
| `ai_usage_events` | TELEMETRY | Model/token usage | `id` | (row) | optional | optional `execution_id` | none | none | n/a | Telemetry |
| `ai_workers` | EXECUTOR CATALOG | Named AI worker | `id` | `tenant_id` | n/a | referenced | n/a | n/a | ACTIVE | Catalog |
| `ai_action_proposals` | GOVERNANCE | Proposed writes (CREATE_TASK, …) | `id` | tenant via row | optional | optional | none | none | PROPOSED/… | Authoritative for Action Layer |
| `workflow_runs` / `workflow_steps` | WORKFLOW_INTERNAL_RUN | Workflow engine, not WEE | `id` | via workflow | not WEE | not WEE | none | none | workflow_run_status | **Not** business execution |
| `workflow_agent_runs` | AGENT_INTERNAL_RUN | Workflow agent loop | `id` | via agent | n/a | n/a | none | none | run status | Internal |
| `tasks` | WORK DEFINITION | What needs to be done | `id` | `tenant_id` | self | `ai_execution_status`, `execution_mode` HUMAN\|AI_ASSISTED | via GO-3 graph only | via attach | task_status | Authoritative Task |
| `work_units` | CATALOG | Versioned work *definition* | `(code,version)` | n/a (global catalog) | n/a | bound onto execution | **name collision only** | n/a | ACTIVE/… | Catalog, not WP |
| `work_products` | DELIVERABLE | Business Work Product (GO-3) | `id` | `tenant_id` | `primary_context_*` optional | **no execution_id** | self | via GO-3 REALIZED_AS | DRAFT…FINAL | Authoritative WP |
| `work_product_versions` | WP VERSION | Business/content snapshot | `id` | `tenant_id` | n/a | `author_agent_id` optional | `work_product_id` | none | version int | Authoritative WP version |
| `work_product_reviews` | WP REVIEW | Human review of a WP | `id` | `tenant_id` | n/a | none | `work_product_id` | none | PENDING/APPROVED/CHANGES_REQUESTED/CANCELED | Authoritative WP review |
| `documents` / `document_versions` | ARTIFACT | File + Office versions | `id` | tenant | attach | none | REALIZED_AS | self | GO-2C | Unchanged |

## WEE pipeline (not a second engine)

`orchestrateWorkExecution` in `src/lib/api/work-execution.server.ts`:

CONTEXT → PLAN → GENERATE → ACTION → VALIDATE → REVIEW

Mutations go through SECURITY DEFINER RPCs (`start_ai_task_execution`, `record_work_execution_step`, `finish_ai_task_execution`, `persist_work_quality`, `accept_ai_task_execution`). ACTION only creates `PROPOSED` `ai_action_proposals`. `needsAction` currently maps planned write steps to **CREATE_TASK** proposals, not Work Product creation.

## Task vs execution in source

- `UNIQUE (task_id, revision)` on `ai_task_executions` → one Task **can** have N AI executions (revisions).
- `tasks.execution_mode` HUMAN | AI_ASSISTED; HUMAN mode does not insert executions.
- Accepting an AI execution may `transition_task` to `done` — Task completion is **not** the same as Work Product APPROVED.
