# GO-3 merge decisions

Canonical file is always the base. Snapshot versions were not copied wholesale.

| CANONICAL_PATH | CANONICAL_STATE | GO3_REQUIRED_CHANGE | MERGE_DECISION | PRESERVED_NEWER_CODE | RESULT |
| --- | --- | --- | --- | --- | --- |
| `src/lib/api/outbox-processor.server.ts` | Push/email/webhook drain; no graph channel | Project `document.document.version_uploaded`, `document.version.created`, WP outbox events | Insert graph projection before existing fan-out | All three delivery channels + claim/complete/fail | Merged |
| `src/domain/work-graph/relationship-types.ts` | `WORK_PRODUCT` entity present; MVP WP user links missing from TS rules | Add `REALIZED_AS`, `PRODUCES`, WP REFERENCES/RELATED_TO, labels | Additive rules only. Did **not** add snapshot `PRODUCES` Task→Document | Existing TASK/DOCUMENT/MEETING rules | Merged |
| `src/domain/work-graph/route-resolver.ts` | Already `/work-products/:id` | None | Leave canonical | MVP href | Unchanged |
| `src/lib/api/work-graph.server.ts` | Resolves DOCUMENT/TASK/…; no WP rows | Fetch `work_products` for graph chrome | Add `WORK_PRODUCT` case | Artifact deep-links, RLS-scoped client | Merged |
| `src/lib/api/work-graph.functions.ts` | Search omits WP | Search `work_products` | Add search case | Existing link/unlink/getWorkContext | Merged |
| `src/lib/architecture/schema-contract-gate.test.ts` | NAVIGABLE missing WP though resolver has it | Include `WORK_PRODUCT` | One-token add | WEE contract tests | Merged |
| `src/integrations/supabase/types.ts` | Live WP/Office/Sell Work typings | RPC stubs | Add `go3_work_graph_backfill`, `project_document_version_uploaded`, `project_work_product_upserted` only | Entire generated schema | Merged |
| `src/routeTree.gen.ts` | Generated; admin trace only | Register backfill route | Additive entries | All existing routes | Merged |
| `tests/integration/15_go3_option_b_work_graph.sql` | New file | Canonical `work_product_versions.author_id` | Copy then change INSERT column | n/a | Adapted |
| `src/domain/ai-context/contracts.ts` | RELATIONSHIP_WEIGHTS keyed by all relationship codes | New codes need weights | Add PRODUCES/CREATED_BY/REALIZED_AS weights | Existing weights | Merged |
| `src/lib/api/work-products.functions.ts` | WEE `work_units` catalog | None | Do not replace | Sell Work catalog | Unchanged |
| `src/routes/api/office/*` | GO-2C | None | Do not touch | Office save writer | Unchanged |
