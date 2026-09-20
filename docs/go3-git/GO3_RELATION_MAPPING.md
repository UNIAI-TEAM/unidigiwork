# GO-3 relation mapping (canonical)

Source of truth remains business tables. Graph edges are derived.

| SOURCE_TABLE/FIELD/RELATION | SOURCE_ENTITY | TARGET_ENTITY | GRAPH_EDGE | PROJECTION_RULE | TENANT_RULE | IDEMPOTENCY_KEY |
| --- | --- | --- | --- | --- | --- | --- |
| `documents.id` + document projector / existing document triggers | DOCUMENT | (node) | node `DOCUMENT` | Ensure node; set `metadata.latestVersion` monotonically from version events | Payload tenant must match `documents.tenant_id` else `CROSS_TENANT` | `(DOCUMENT, documents.id)` |
| `work_products.id` + insert trigger `tg_work_graph_work_product` + WP projector | WORK_PRODUCT | (node) | node `WORK_PRODUCT` | Reuse existing node; set `metadata.latestBusinessVersion` monotonically | Same tenant | `(WORK_PRODUCT, work_products.id)` |
| `work_products.workspace_id` (canonical trigger) | WORK_PRODUCT | WORKSPACE | `BELONGS_TO` SYSTEM | Already canonical; GO-3 does not replace | Tenant of WP | unique edge constraint |
| User `link_work_entities` `REFERENCES`/`RELATED_TO` WP↔DOCUMENT | WORK_PRODUCT | DOCUMENT | overlay `REALIZED_AS` SYSTEM | Only if user link exists; never from Task→Document attach | Both nodes same tenant | `(REALIZED_AS, WP node, DOCUMENT node)` |
| User `link_work_entities` `REFERENCES`/`RELATED_TO` WP↔TASK | TASK | WORK_PRODUCT | overlay `PRODUCES` SYSTEM | Source-backed user link only | Same tenant | `(PRODUCES, TASK node, WP node)` |
| User `link_work_entities` `REFERENCES`/`RELATED_TO` WP↔MEETING | MEETING | WORK_PRODUCT | overlay `PRODUCES` SYSTEM | Source-backed user link only | Same tenant | `(PRODUCES, MEETING node, WP node)` |
| `ATTACHED_TO` / `REFERENCES` TASK↔DOCUMENT | TASK | DOCUMENT | keep user edge | **No** Work Product synthesized | Same tenant | existing attach key |
| `document.document.version_uploaded` outbox | DOCUMENT | — | latestVersion only | Same projector as below | Cross-tenant skip | node id |
| `document.version.created` outbox (GO-2C save complete) | DOCUMENT | — | latestVersion only | Do not rename event; normalize `documentId`/`versionNumber` | Cross-tenant skip | node id |
| `work_product.work_product.upserted` / `version_created` | WORK_PRODUCT | — | WP node metadata | Does not write `document_versions` | Tenant of WP | node id |
| `ai_task_executions` | — | — | none | No `document_id`; **BLOCKED_BY_SOURCE_MODEL** | — | — |

Not inferred from: same workspace, similar titles, timestamps, or Task→Document co-occurrence.
