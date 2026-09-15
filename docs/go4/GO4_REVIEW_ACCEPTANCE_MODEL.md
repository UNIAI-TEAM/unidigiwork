# GO-4 — Review and acceptance model

## What exists today (two authorities)

### 1. AI execution review (WEE)

Table: `ai_task_executions`  
RPC: `accept_ai_task_execution`, `request_ai_execution_changes`  
Statuses: `WAITING_REVIEW` → `ACCEPTED` | `CHANGES_REQUESTED`  
Actor: Task `human_owner_id` / `created_by` / workspace owner|admin  
Side effect: may `transition_task` to `done`  
Outbox: `task.ai.execution_accepted`, `task.ai.changes_requested`

**What is reviewed:** the **AI execution output** (deliverable text on the execution row), **not** a `work_products` row.

### 2. Work Product review (MVP)

Table: `work_product_reviews` on `work_product_id`  
Statuses: `PENDING | APPROVED | CHANGES_REQUESTED | CANCELED`  
WP status: `DRAFT | IN_REVIEW | CHANGES_REQUESTED | APPROVED | FINAL | ARCHIVED`

**What is reviewed:** the **Work Product** (business deliverable).

### 3. WEE quality (not acceptance)

`quality_status`: `NOT_EVALUATED | EVALUATING | PASSED | PASSED_WITH_WARNINGS | FAILED_QUALITY | EVALUATION_ERROR`  
`quality_score`, `quality_dimensions`, `quality_issues` on the execution.  
This is machine validation, not human business acceptance.

### 4. WEE `outcome` jsonb

Execution-local outcome payload / catalog `expected_outcome_type`.  
**Not** GO-4 business Outcome Cloud.

## Semantic mapping (GO-4)

| Concept | Authority | Notes |
| --- | --- | --- |
| Execution finished successfully | `ai_task_executions.status` in `{WAITING_REVIEW, ACCEPTED, CHANGES_REQUESTED}` after `finish_ai_task_execution` | Finish never auto-ACCEPTED |
| Execution accepted (AI output) | `accept_ai_task_execution` | Distinct from WP APPROVED |
| Work Product review | `work_product_reviews` | Keep |
| Work Product accepted | `work_products.status` in `{APPROVED, FINAL}` | Business acceptance |
| Outcome | **Derived** from WP acceptance (+ optional SLA later) | **No `outcomes` table in GO-4** |
| Document | Artifact; not the acceptance object | GO-3 REALIZED_AS |

**Recommended direction (compatible with source):**

- Execution produces Work Product (after provenance table exists).
- **Review/acceptance of business value lives on Work Product.**
- `accept_ai_task_execution` remains **AI-output gate** (human confirms the run before/while WP is created). GO-4 must not delete it.
- Do not auto-APPROVE a Work Product because an execution is ACCEPTED.
- Do not treat Document approval as Outcome.

## Outcome definition (no new table)

**Work Product** = what was produced.  
**Outcome** = whether that production achieved the accepted business result.

GO-4 foundation: `work_products.status` + latest `work_product_reviews` is enough to express accepted / rework / not accepted. Outcome Cloud (SLA met, customer resolved, commercial value) is GO-5+.

`OUTCOME_NEW_TABLE_REQUIRED = NO`
