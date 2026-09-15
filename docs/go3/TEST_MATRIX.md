# GO-3 test matrix

| Case | Where | Expected |
| --- | --- | --- |
| A Task attaches Document only | `15_go3_option_b_work_graph.sql` | ATTACHED_TO only; 0 WP nodes from that document id |
| B Task links Work Product only | same | PRODUCES TASK→WP; 0 DOCUMENT node with WP id |
| C Task → WP → Document | same | PRODUCES + REALIZED_AS |
| WP node metadata | same | business type/status/version, no body |
| Document latestVersion out of order | same | 5 then 4 stays 5 |
| WP business version out of order | same | no regression |
| Idempotent project | same | 0 extra nodes/edges |
| Cross-tenant | same | CROSS_TENANT / no edge |
| Backfill ×2 | same | 0 duplicate nodes/edges |
| WP version ≠ document version | same | `work_product_versions` insert does not add `document_versions` |
| Office save single writer | same (skip if RPCs absent) | `document_versions` +1, WP versions unchanged |
| Graph failure | same | source title unchanged; retry recovers |
| Meeting document attach | same | ATTACHED_TO preserved |
| AI execution WP | same | no `document_id` column |
| Unit mapping | `go3-mapping.test.ts` | REALIZED_AS / PRODUCES / tenant / monotonic |
| Adapter separation | `document-adapter.test.ts` | WP id ≠ Document id |
| Projector skip | `work-graph-projector.server.test.ts` | CROSS_TENANT skipped |

GO-2C / Sell Work / WP MVP UI: no contract changes in this phase; regression is source-level (Office RPCs untouched, `work_units` APIs untouched, `/work-products` UI not redesigned).
