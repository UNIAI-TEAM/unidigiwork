# GO-3 projection architecture

Smallest projector on the existing Work Graph.

```
source write  ──commit──►  outbox row (best-effort emit)
                              │
                         drainOutbox
                              │
                    project_* RPC (service_role)
                              │
                 upsert work_nodes UNIQUE (tenant_id, entity_type, entity_id)
                 upsert work_edges UNIQUE (tenant_id, source, target, relationship)
```

Idempotency is the unique constraints, not process memory.

Document projector: `_touch_document_graph_node`. Strips any leftover `semanticType=WORK_PRODUCT`.

Work Product projector: `_touch_work_product_graph_node`. Reads `work_products` via `to_jsonb` so live extra columns are ignored.

Cross-tenant: `_work_graph_link_system_in_tenant` returns NULL when tenant ids differ. RPC returns `{ ok:false, error:'CROSS_TENANT' }` for mismatched payload tenant.

Query: existing `get_work_context` + `resolveWorkEntities` (now loads `work_products` for `WORK_PRODUCT` nodes). Graph RLS still uses `can_view_work_entity` on the source row.
