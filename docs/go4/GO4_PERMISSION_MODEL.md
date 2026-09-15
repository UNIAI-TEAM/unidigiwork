# GO-4 — Permission / tenant model

## Existing authorities (do not weaken)

- Tenant membership: `is_tenant_member`
- Task / workspace: existing RLS + `can_view_work_entity` / `_work_entity_scope`
- Work Product: `_go3_can_view_work_product` (GO-3)
- Document: existing document RLS (GO-2C)
- AI execution RPCs: tenant member + start/accept scoped to task owner / workspace admin

`NO_RLS_WEAKENING` remains a GO-4 invariant.

## Execution visibility rule

An Execution graph node **must never expose more than** the underlying `ai_task_executions` row allows.

Recommended predicate (implementation):

- Same `tenant_id` as the reader’s membership.
- Reader can view the parent **Task** (and therefore the workspace/project scope of that task).
- If linked Work Products exist, listing them still requires WP `can_view` per product. Execution node metadata (status, executor type, timestamps) follows Task visibility; **deliverable content** remains on the execution row and should use the same RPC/RLS as today’s WEE read path.

Cross-tenant: projector and backfill must use `_work_graph_link_system_in_tenant` (GO-3). No edge if tenant ids differ.

## Sensitive fields

Execution rows contain model output, evidence packs, costs. Graph nodes should store **identity + type**, not `deliverable_content` / `evidence_pack`. Context Engine retrieves detail through authorized source reads.

## Hybrid Human + AI

Human executor id is PII-adjacent. Same tenant + Task permission. Do not publish to other tenants’ graphs.
