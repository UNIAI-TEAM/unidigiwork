# GO-3 backfill

RPC: `go3_work_graph_backfill(_tenant_id, _limit)` (alias `work_product_graph_backfill`).

HTTP: `POST /api/admin/work-product-graph-backfill` with admin bearer. Body `{ tenantId, limit? }`.

Behavior:

- Tenant-scoped, limit 1..2000 (default 200).
- Touch existing `documents` (reuse DOCUMENT nodes, repair `latestVersion`, strip Option A semantic stamps).
- Touch existing `work_products` when the table and `tenant_id` column exist (reuse WORK_PRODUCT nodes).
- Replay user `REFERENCES`/`RELATED_TO` edges that involve `WORK_PRODUCT` into `REALIZED_AS` / `PRODUCES`.
- Do not invent Work Products for Documents or Documents for Work Products.
- Do not invent Task/Meeting/AI provenance.

Second run: unique constraints ⇒ 0 duplicate nodes/edges.

Resumable via `ORDER BY created_at LIMIT n` (operator repeats with larger limit). Observable JSON: `documentsProjected`, `workProductsProjected`.
