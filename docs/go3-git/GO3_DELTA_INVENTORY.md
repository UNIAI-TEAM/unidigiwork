# GO-3 delta inventory

Base: `UNIAI-TEAM/unidigiwork` `main` `9f2ffc049e8ac01d003beb49fbd7be0d55a6e5cf`  
Delta source: `/Users/uranus/Projects/uniwork-platform` (stale snapshot, not canonical)

| SOURCE_PATH | DESTINATION_PATH | CLASSIFICATION | REASON | CANONICAL_CONFLICT | ACTION |
| --- | --- | --- | --- | --- | --- |
| `supabase/migrations/20260915090000_go3_option_b_work_graph.sql` | same | NEW_SAFE_COPY | Timestamp after latest canonical `20260911064940_*`; never applied | None | Copy; keep timestamp |
| `tests/integration/15_go3_option_b_work_graph.sql` | same | MERGE_REQUIRED | Canonical tests end at `12_*`; WP version column is `author_id` not snapshot `created_by` | Medium | Copy then adapt INSERT |
| `src/domain/work-graph/go3-mapping.ts` (+ test) | same | NEW_SAFE_COPY | Absent in canonical | None | Copy |
| `src/domain/work-product-semantics/*` | same | NEW_SAFE_COPY | Absent; must not replace WEE `work-products.functions.ts` | Low naming | Copy new dir |
| `src/lib/api/work-graph-projector.server.ts` (+ test) | same | NEW_SAFE_COPY | Absent | None | Copy |
| `src/lib/api/work-product-semantics.functions.ts` | same | NEW_SAFE_COPY | Distinct from catalog `work-products.functions.ts` | None | Copy |
| `src/routes/api/admin/work-product-graph-backfill.ts` | same | NEW_SAFE_COPY | Canonical admin API only has trace | Low (routeTree gen) | Copy; regenerate route tree |
| `src/lib/api/outbox-processor.server.ts` | same | MERGE_REQUIRED | Canonical is live fan-out; snapshot adds graph channel | High if wholesale | Minimum graph branch |
| `src/domain/work-graph/relationship-types.ts` | same | MERGE_REQUIRED | Canonical already has `WORK_PRODUCT` entity; missing `REALIZED_AS`/`PRODUCES` and WP user-link rules used by MVP UI | Medium | Add codes + rules + labels only |
| `src/domain/work-graph/route-resolver.ts` | same | ALREADY_PRESENT | `WORK_PRODUCT` → `/work-products/:id` | None | No change |
| `src/lib/api/work-graph.server.ts` | same | MERGE_REQUIRED | Resolver has no `WORK_PRODUCT` row fetch | Low | Add case |
| `src/lib/api/work-graph.functions.ts` | same | MERGE_REQUIRED | Search has no `WORK_PRODUCT` | Low | Add case |
| `src/lib/architecture/schema-contract-gate.test.ts` | same | MERGE_REQUIRED | NAVIGABLE omits `WORK_PRODUCT` though resolver has it | Low | Add token |
| `src/integrations/supabase/types.ts` | same | MERGE_REQUIRED | Full snapshot types would wipe live WP tables | High | RPC stubs only |
| `docs/go3a/*` | same | NEW_SAFE_COPY | Architecture authority | None | Copy |
| `docs/go3/{ARCHITECTURE,IMPLEMENTATION_SOURCE_MAP,VERSION_SEMANTICS,EDGE_MAPPING,EVENT_MAPPING,PROJECTION_ARCHITECTURE,BACKFILL,LIFECYCLE_SEMANTICS,SECURITY,PERFORMANCE_NOTES,TEST_MATRIX,RUNTIME_EVIDENCE,GO3_ACCEPTANCE_REPORT}.md` | same | NEW_SAFE_COPY | Option B docs | None | Copy listed files only |
| `docs/go3-sync/*` | — | NOT_REQUIRED | Historical Cursor/Lovable sync | — | Omit |
| `supabase/migrations/20260915053000_go3_work_product_graph.sql` | — | SUPERSEDED_BY_CANONICAL | Option A | Would fight live WP nodes | **Do not copy** |
| `tests/integration/14_work_product_graph.sql` | — | SUPERSEDED_BY_CANONICAL | Option A stub | — | **Do not copy** |
| Snapshot `types.ts` / WP UI / GO-2C office HTTP | — | NOT_REQUIRED | Canonical already newer | Destructive | **Do not copy** |

`PRODUCES` Task→Document from snapshot `relationship-types.ts` is **not** ported (Option A leftover). Option B PRODUCES is Task/Meeting → Work Product only.
