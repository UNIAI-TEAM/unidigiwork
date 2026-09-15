# GO-4 — Work Graph model for Execution

## Recommendation

**`EXECUTION_GRAPH_NODE_RECOMMENDED = YES`** (after source provenance exists)

**Option B:** first-class node type `EXECUTION`.  
Do **not** project Execution nodes without `execution_work_products` (or equivalent FK). Graph must not invent authority.

Do **not** treat the graph as a second execution store. Source remains `ai_task_executions`. Graph is a projection (GO-3 pattern: source write → outbox → idempotent projector).

## Node

- Type: `EXECUTION`
- `entity_id` = `ai_task_executions.id`
- Tenant from execution `tenant_id`
- Visibility: same as `can_view` of the parent Task (never richer than source)

## Canonical edges (source-backed)

| Edge | Meaning | Source |
| --- | --- | --- |
| `TASK --HAS_EXECUTION--> EXECUTION` | Attempt of a Task | `ai_task_executions.task_id` |
| `EXECUTION --PRODUCES--> WORK_PRODUCT` | Provenance | **new** `execution_work_products` only |
| `PERSON --PERFORMS--> EXECUTION` | Human executor | only if `executor_user_id` exists |
| `AI_WORKER --PERFORMS--> EXECUTION` | AI executor | `ai_worker_id` (requires AI_WORKER node; do not add until node type exists or map to PERSON-equivalent catalog node). If no AI_WORKER node type today, **defer** this edge. |

Inspected graph node types today include TASK, MEETING, WORKSPACE, DOCUMENT, WORK_PRODUCT, PERSON, … — **no EXECUTION, no AI_WORKER**. Adding `AI_WORKER` nodes is **out of GO-4 minimum** unless catalog already has a graph type. GO-4 minimum: EXECUTION node + HAS_EXECUTION + PRODUCES.

## Reconciling GO-3 `TASK --PRODUCES--> WORK_PRODUCT`

GO-3 `PRODUCES` is a **derived shortcut** from user `REFERENCES`/`RELATED_TO` (and meeting equivalents). It is **not** execution provenance.

**Policy: `RETAIN_AS_DERIVED_SHORTCUT`**

- Keep projecting `TASK → PRODUCES → WORK_PRODUCT` from existing GO-3 user links **and**, once provenance exists, also from `execution.task_id` + `execution_work_products` (idempotent unique `(from, type, to)`).
- Query “who produced this?” uses **HAS_EXECUTION + PRODUCES from Execution**, not the shortcut alone.
- Shortcut answers “this Task is associated with this deliverable” (semantic, still true if execution history is later attached).

This is useful projection, not a second truth: GO-3 user link and execution link may both exist; uniqueness prevents duplicate edges.

## Why a node (not metadata-only)

Sell Work / Context Engine questions (“which executions produced this WP?”, “human vs AI?”) need traversable identity. Metadata-only on WP would hide N executions and N work products.

Cost: one node per execution + 1–2 edges. Bounded by WEE volume, same projector/outbox as GO-3.

## Forbidden

- Inferring PRODUCES from timestamps.
- Writing graph inside the WEE finish transaction unless existing trigger pattern already does (prefer outbox).
- Using graph as SSOT for execution status.
