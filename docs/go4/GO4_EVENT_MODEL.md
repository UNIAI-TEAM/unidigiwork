# GO-4 — Event / outbox model

## Principle

Reuse `public.outbox_events` via `_emit_outbox_event`.  
**No second event bus. No graph write as SSOT.**

Same as GO-3: source write → outbox → idempotent projector.

## Existing execution-related events

| Event type | Aggregate | When |
| --- | --- | --- |
| `task.ai.execution_started` | `ai_task_execution` | `start_ai_task_execution` |
| `task.ai.execution_finished` | `ai_task_execution` | `finish_ai_task_execution` (WAITING_REVIEW or FAILED) |
| `task.ai.changes_requested` | `ai_task_execution` | `request_ai_execution_changes` |
| `task.ai.execution_accepted` | `ai_task_execution` | `accept_ai_task_execution` |
| `task.task.updated` / status | task | existing task transitions |

GO-3 WP events (do not change semantics):

| Event type | Aggregate |
| --- | --- |
| `work_product.work_product.upserted` | work_product |
| `work_product.work_product.version_created` | work_product_version |

## Gaps (design only)

No events today for:

- execution ↔ work product bind
- work product review requested/completed (`work_product_reviews` writes)
- business Outcome (not in GO-4)

Minimum GO-4 events to add **only when** provenance table is written:

- `execution.work_product.linked` — payload `{ execution_id, work_product_id, role }`
- Projector consumes it to emit `EXECUTION` node + `HAS_EXECUTION` + `PRODUCES`

Optional later: `work_product.review.upserted` if reviews must appear on the graph. Not required to close provenance.

## Projector

Extend GO-3 `work-graph-projector.server.ts` / SQL helpers.  
Idempotent on `(tenant_id, from_node, relationship_type, to_node)`.  
Failures retry via existing outbox; must not roll back WP/execution source writes.
