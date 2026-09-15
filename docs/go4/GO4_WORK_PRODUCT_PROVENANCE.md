# GO-4 — Execution ↔ Work Product provenance

## Current source relation

**There is no deterministic FK between `ai_task_executions` and `work_products`.**

Inspected and rejected as provenance:

| Candidate | Why it is not EXECUTION → PRODUCES → WORK_PRODUCT |
| --- | --- |
| `bind_work_product_execution` / `work_unit_code` | Binds **work_units** catalog + contract snapshot |
| `work_product_inputs` jsonb | Contract input values, not `work_products.id` |
| `deliverable_title` / `deliverable_content` | Inline AI text on the execution; never inserted as WP |
| `work_products.created_by_agent_id` | Agent authorship of WP, not execution id |
| `work_products.primary_context_type = TASK` | Task context, not execution |
| `work_product_versions.author_agent_id` | Version author, not execution |
| Same tenant / task / title / timestamp | Forbidden inference (GO-3 rule, still in force) |

This is why GO-3 reported `AI_EXECUTION_WORK_PRODUCT_GRAPH = BLOCKED_BY_SOURCE_MODEL`.

## Cardinality (target)

| Question | Decision |
| --- | --- |
| One Task, many Executions? | **Yes** — already `UNIQUE (task_id, revision)` |
| One Execution, many Work Products? | **Yes** — board package example (report + sheet + deck) |
| Many Executions, one Work Product? | **Yes** — AI draft execution then human revision execution contributing to the same WP; WP `current_version` / `work_product_versions` is the content lineage. Executions are attempts, not WP versions. |

Do **not** hardcode 1:1.

## Minimum authoritative relation (design only)

New table (name reserved for implementation; **not created now**):

`execution_work_products`

| Column | Rule |
| --- | --- |
| `tenant_id` | Required; must match both execution and WP |
| `execution_id` | FK `ai_task_executions.id` |
| `work_product_id` | FK `work_products.id` |
| `role` | `DRAFT \| REVISION \| FINAL \| ARTIFACT_SET` |
| `created_at` | Provenance time |
| Unique `(execution_id, work_product_id)` | Idempotent |

Writes only through a SECURITY DEFINER RPC after the business write that creates/links the WP.  
Do not infer rows in backfill from titles.

Human Scenario A: requires a Human execution row (see authority doc) **or** GO-4 implementation explicitly defers Human→WP provenance to `created_by` until executor generalization. The contract prefers generalization so Scenario A is first-class.

## GO-3 preservation

`WORK_PRODUCT → REALIZED_AS → DOCUMENT` unchanged.  
Office still writes only `document_versions`.  
Execution must never dual-write Office versions.
