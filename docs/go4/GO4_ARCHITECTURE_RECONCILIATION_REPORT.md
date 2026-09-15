# GO-4 architecture reconciliation report

**GO-4 NAME:** EXECUTION → WORK PRODUCT → OUTCOME FOUNDATION  
**Phase:** architecture / source-model only. **`GO4_IMPLEMENTED = NO`**.

Canonical: `https://github.com/UNIAI-TEAM/unidigiwork.git`  
Inspected HEAD: `f090f45477c57e076e95793b8a1af7633712c551` (GO-3 merge `0078497a` + runtime report).  
GO-3: **closed**. Not reopened. Office contracts not changed.

---

## 1–2. Canonical identity of Execution today

The only durable WEE runtime root is **`public.ai_task_executions`**.  
There is no `work_executions` table. `run` / `workflow_run` / `workflow_agent_runs` are **internal**, not business execution.

WEE pipeline (persisted as `work_execution_steps.kind`): CONTEXT → PLAN → GENERATE → ACTION → VALIDATE → REVIEW.  
Finish status is **`WAITING_REVIEW` or `FAILED`**, never auto-accepted.

## 3–6. Authority, Task vs Execution, Human+AI

- Task = work to be done (`tasks`).
- Execution = one attempt (`ai_task_executions`, unique `(task_id, revision)` → **N executions per Task**).
- `ai_worker_id` NOT NULL → **AI-only**. Human WP MVP has **no** execution row.
- **`EXECUTION_MODEL_SINGLE_AUTHORITY = NO`** until executor generalization (same table, not a new engine).

`work_units` is the catalog instantiated onto an execution via `bind_work_product_execution`. It is **not** `work_products`.

## 7–9. Provenance and GO-3 chain

**No FK today** from execution to `work_products`. GO-3 `AI_EXECUTION_WORK_PRODUCT_GRAPH = BLOCKED_BY_SOURCE_MODEL` remains fact.

Minimum relation: **`execution_work_products`** (N:M).  
Preserve `WORK_PRODUCT → REALIZED_AS → DOCUMENT → document_versions`.

Target chain:

```
TASK
  ↓ HAS_EXECUTION
EXECUTION
  ↓ PRODUCES
WORK_PRODUCT
  ↓ REALIZED_AS
DOCUMENT
  ↓
DOCUMENT_VERSION
```

## 8. Cardinality decision

| | Decision |
| --- | --- |
| Execution → Work Products | **1:N** |
| Work Product ← Executions | **N:1** (many attempts contribute) |
| Lineage of content | `work_product_versions` |
| Lineage of attempts | `ai_task_executions.revision` + junction `role` DRAFT/REVISION/FINAL |

Do not collapse revisions of a WP into a single execution.

## 10–12. Review / Outcome / status

Two review authorities exist; **map, do not merge**:

| Layer | Status meaning |
| --- | --- |
| Execution | SUCCEEDED ≈ `WAITING_REVIEW` after finish; `ACCEPTED` = human accepted **the run** |
| Work Product | `APPROVED`/`FINAL` = business acceptance; `CHANGES_REQUESTED` = rework |
| Outcome | **Derived** from WP acceptance. **No outcomes table in GO-4** |

AI can SUCCEED and WP can still require rework.

## 13, 22. Evidence

Step rows are durable. **`stepWriteFailures` Map is not.**  
`EXECUTION_EVIDENCE_DURABLE = PARTIAL`  
`EXECUTION_TELEMETRY_DURABLE = NO`

## 14–16. Graph

Recommend **EXECUTION node** only after junction writes.  
Edges: `HAS_EXECUTION`, `EXECUTION PRODUCES WORK_PRODUCT`.  
Retain GO-3 `TASK PRODUCES WORK_PRODUCT` as **derived shortcut**.

Query value after GO-4: originating task, executions, executor type, timestamps, evidence (steps), quality, dual review, realized documents — **deterministic**. Human time vs AI time uses existing metrics tables once Human executions exist.

## 17–19. Economics, work units, governance

Economics columns already hang off `execution_id`. Do not block. Do not bill.  
Action Intent v2 **not required** for provenance. Do **not** create Work Products through `needsAction` → CREATE_TASK.

## 20–21. Permissions and events

Reuse tenant RLS + Task/WP view predicates. Graph identity only.  
Reuse outbox. New event: `execution.work_product.linked`.

## 23. Minimum scope

Canonical execution identity + junction + optional graph node + outbox projection + review mapping + tests + step-failure durability.  
No Outcome Cloud, no new workflow engine, no Office rewrite.

---

## Three scenarios

### A — HUMAN

1. Task exists (`execution_mode` HUMAN or mixed).
2. GO-4 creates `ai_task_executions` with `executor_type=HUMAN`, `executor_user_id`, `ai_worker_id` NULL.
3. Human creates/updates `work_products` (existing MVP).
4. RPC links junction `role=FINAL`.
5. `work_product_reviews` → APPROVED. Execution may be ACCEPTED in parallel or skipped if Human path has no WAITING_REVIEW; contract: Human executions can finish as WAITING_REVIEW only if a second reviewer exists; otherwise WP review is sufficient. **Do not auto-copy WP APPROVED onto execution ACCEPTED.**

**Today:** step 2 does not exist; only step 3. Scenario A is **unsupported as execution provenance** until generalization.

### B — AI

1. `start_ai_task_execution` (existing).
2. Pipeline GENERATE writes `deliverable_*` on the execution.
3. **Missing today:** materialize `work_products` + junction (trusted RPC, not CREATE_TASK).
4. Finish → WAITING_REVIEW. Human `accept_ai_task_execution` (run) **and** WP review (business). Independent.

### C — HYBRID

1. AI execution revision 1 → WP v1 `role=DRAFT`.
2. Human execution revision 2 (or Human WP version with `author` user) → WP v2 `role=REVISION`.
3. Same `work_product_id`. Two execution ids in junction.
4. Accept WP. Documents via REALIZED_AS unchanged.

Identity: WP id stable; versions increment; executions are separate rows.

---

## Sell Work proof query (after implementation)

For accepted WP: task via executions.task_id **and/or** GO-3 PRODUCES; all junction executions; executor_type; started/finished; steps + quality; execution review + WP reviews; rework = CHANGES_REQUESTED + extra revisions; documents via REALIZED_AS.

**Not possible today** without guessing.

---

## Required decisions (explicit)

1. Canonical Execution authority = **`ai_task_executions`** (AI/WEE); Human not yet in that table.  
2. Canonical Execution ID = **`ai_task_executions.id`**.  
3. One Task, multiple Executions = **YES**.  
4. One Execution, multiple Work Products = **YES** (junction).  
5. Multiple Executions, one Work Product = **YES** (junction + WP versions).  
6. Deterministic source relation = **`execution_work_products`** (does not exist yet).  
7. EXECUTION graph node = **YES, after (6)**.  
8. Canonical edges = `HAS_EXECUTION`, `EXECUTION PRODUCES WORK_PRODUCT`; GO-3 REALIZED_AS unchanged.  
9. Direct TASK PRODUCES WORK_PRODUCT = **retain as derived shortcut**.  
10. Review lives on **both** execution (AI run) and `work_product_reviews` (business).  
11. Acceptance of business value = **`work_products.status`**.  
12. Outcome in GO-4 = **derived**, no new table.  
13. Evidence = **PARTIAL** (steps durable; failure Map not).  
14. In-memory telemetry = **YES** (`stepWriteFailures`).  
15. Minimum migration = additive executor columns + junction + graph type/edges + outbox event + projector.  
16. Must not change: GO-3 Option B semantics, Office, `workflow_runs`, WP MVP meaning, Sell Work pricing.  
17. New table: **`execution_work_products`** (required).  
18. Runtime tests: integration 16 scenarios A/B/C, cross-tenant, idempotent projector, GO-3 unchanged.

---

## Flags

```
GO3_BASELINE_PRESERVED = YES
CANONICAL_EXECUTION_AUTHORITY = ai_task_executions
CANONICAL_EXECUTION_ID = ai_task_executions.id
EXECUTION_MODEL_SINGLE_AUTHORITY = NO
TASK_EXECUTION_CARDINALITY = 1:N
EXECUTION_WORK_PRODUCT_CARDINALITY = 1:N
MULTIPLE_EXECUTIONS_PER_WORK_PRODUCT_SUPPORTED = YES (target; source junction missing)
EXECUTION_WORK_PRODUCT_SOURCE_RELATION = NONE_TODAY; GO4 = execution_work_products
EXECUTION_WORK_PRODUCT_RELATION_DETERMINISTIC = YES (designed junction; not present in live DDL)
EXECUTION_GRAPH_NODE_RECOMMENDED = YES
EXECUTION_GRAPH_NODE_TYPE = EXECUTION
TASK_EXECUTION_EDGE = HAS_EXECUTION
EXECUTION_WORK_PRODUCT_EDGE = PRODUCES
DIRECT_TASK_WORK_PRODUCT_EDGE_POLICY = RETAIN_AS_DERIVED_SHORTCUT
HUMAN_EXECUTION_SUPPORTED = NO (source); YES after executor generalization
AI_EXECUTION_SUPPORTED = YES
HYBRID_EXECUTION_SUPPORTED = NO (source); YES after junction + Human rows
WORK_PRODUCT_REVIEW_AUTHORITY = work_product_reviews
WORK_PRODUCT_ACCEPTANCE_AUTHORITY = work_products.status
OUTCOME_AUTHORITY = DERIVED_FROM_WORK_PRODUCT_ACCEPTANCE
OUTCOME_NEW_TABLE_REQUIRED = NO
EXECUTION_EVIDENCE_DURABLE = PARTIAL
EXECUTION_TELEMETRY_DURABLE = NO
SELL_WORK_PROVENANCE_SUFFICIENT = NO (today); YES after GO-4 contract
OUTBOX_REUSED = YES
SECOND_EVENT_SYSTEM_REQUIRED = NO
RLS_MODEL_COMPATIBLE = YES
CROSS_TENANT_MODEL_SAFE = YES
NEW_TABLES_REQUIRED = YES (execution_work_products)
EXISTING_TABLES_REQUIRING_CHANGE = ai_task_executions (additive executor_*); work_nodes CHECK; work_relationship_types
MINIMUM_MIGRATION_REQUIRED = YES (additive only; not applied)
GO4_SCOPE_CLEAR = YES
GO4_IMPLEMENTATION_CONTRACT_READY = YES
GO4_IMPLEMENTED = NO
GO4A_READY = YES
GO4_STATUS = ARCHITECTURE_CLOSED_READY_FOR_IMPLEMENTATION
```

Architecture truth was not sacrificed to force every flag green: single-authority is **NO** until Human shares `ai_task_executions`; provenance is **designed** not live; telemetry Map remains a durability gap.
