# GO-4 implementation contract

This file is the agreed contract **before** any GO-4 migration. This phase does **not** implement it.

## Identity

| Question | Answer |
| --- | --- |
| Canonical Execution (WEE/AI today) | `ai_task_executions.id` |
| Human/AI/Hybrid authority after GO-4 | **Same table**, generalized — **not** `workflow_runs`, **not** a second engine |
| Work Product | `work_products.id` (GO-3 / MVP, unchanged) |
| Document | `documents.id` / `document_versions` (GO-2C, unchanged) |
| work_units | Catalog contract; `bind_work_product_execution` stays catalog bind |

## Must implement (minimum)

1. **Executor generalization on `ai_task_executions`**  
   Additive columns: `executor_type` (`HUMAN|AI|HYBRID|SYSTEM`), nullable `ai_worker_id` when HUMAN, `executor_user_id`.  
   Do not rename the table in GO-4 (compatibility with RPCs, outbox aggregate `ai_task_execution`).

2. **`execution_work_products`**  
   `(tenant_id, execution_id, work_product_id, role, created_at)` unique `(execution_id, work_product_id)`.  
   SECURITY DEFINER RPC `link_execution_work_product`. Tenant match required. No title inference.

3. **Graph (optional but recommended)**  
   Node type `EXECUTION`. Edges `HAS_EXECUTION`, `EXECUTION → PRODUCES → WORK_PRODUCT`.  
   Retain GO-3 `TASK → PRODUCES → WORK_PRODUCT` as derived shortcut.

4. **Outbox**  
   `execution.work_product.linked` → existing projector. Reuse `_emit_outbox_event`.

5. **Review mapping (code + docs, not a new system)**  
   Execution ACCEPTED ≠ WP APPROVED. Tests must prove both.

6. **Evidence hardening**  
   Replace process-local `stepWriteFailures` Map with durable failure (or fail the run). Required for Sell Work completeness, not for the FK itself.

7. **Runtime tests** (new file, e.g. `tests/integration/16_go4_execution_work_product.sql`)  
   Scenarios A/B/C; cross-tenant deny; projector idempotent; GO-3 REALIZED_AS still holds; no Office dual-write.

## Must NOT change

- GO-3 migration / Option B mapping / `REALIZED_AS`  
- `work_products` MVP columns except **no** requirement to add `execution_id` (junction is preferred for N:M)  
- `documents` / `document_versions` / Office save  
- `workflow_runs` / workflow-agents  
- Sell Work pricing / billing  
- RLS weakening  
- Action Intent v2 (not required for provenance). **Do not** create WPs via `needsAction` → `CREATE_TASK`.

## Action / governance

AI-generated Work Products must go through: proposal or trusted RPC → preview/confirmation as existing Action Layer requires → audit/outbox.  
`link_execution_work_product` is a trusted command, tenant-checked, like other WEE RPCs.

## Tables

| Action | Object |
| --- | --- |
| **New** | `execution_work_products` |
| **Alter (additive)** | `ai_task_executions` executor columns; `work_nodes.entity_type` allow `EXECUTION`; `work_relationship_types` `HAS_EXECUTION` / Execution `PRODUCES` |
| **Do not drop/rewrite** | `ai_task_executions`, `work_products`, `work_execution_steps`, GO-3 functions |

## Explicitly out of scope

Outcome Cloud table, marketplace, billing, dozens of workers, autonomous company, new graph database, GO-5, Office architecture, replacing WEE pipeline, Action Intent v2.

## First engineering step after this contract is accepted

Read-only live check:

```sql
SELECT to_regclass('public.ai_task_executions'), to_regclass('public.work_products');
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='ai_task_executions'
   AND column_name IN ('work_product_id','executor_type');
SELECT to_regclass('public.execution_work_products');
```

Expect `work_product_id` / `execution_work_products` **absent**. Then implement on a feature branch.
