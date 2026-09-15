# GO-3 security

- No public graph read endpoint. Reads go through `get_work_context` (SECURITY INVOKER) which calls `can_view_work_entity`.
- `WORK_PRODUCT` visibility is a SELECT on `work_products` (invoker RLS). Missing table ⇒ not visible.
- Cross-tenant edges are denied (`WORK_GRAPH_CROSS_TENANT` / projector `CROSS_TENANT`). No metadata leak.
- Backfill HTTP requires a verified admin role. Uses service role only on the server.
- Graph metadata is title, type, status, version numbers, timestamps — not body, bytes, tokens, or signed URLs.
- Office GO-2C contract unchanged: no service-role in Desktop/PWA.
