# GO-3 edge mapping

Live WP editor (2026-09-15 bundle) creates user links with `REFERENCES` (default) or `RELATED_TO` from `WORK_PRODUCT` to `TASK` / `DOCUMENT` / `MEETING` / `MEETING_ARTIFACT`.

| Semantic concept | Canonical graph code | Source → target | Origin | Source evidence |
| --- | --- | --- | --- | --- |
| Workspace owns WP | `BELONGS_TO` | WORK_PRODUCT → WORKSPACE | SYSTEM | `work_products.workspace_id` |
| Workspace owns Document | `BELONGS_TO` | DOCUMENT → WORKSPACE | SYSTEM | `documents.workspace_id` (existing) |
| Creator of WP | `CREATED_BY` | PERSON → WORK_PRODUCT | SYSTEM | `created_by` / `owner_id` |
| Creator of Document | `CREATED_BY` | PERSON → DOCUMENT | SYSTEM | `documents.created_by` |
| Task produced WP | `PRODUCES` | TASK → WORK_PRODUCT | SYSTEM | live user `REFERENCES`/`RELATED_TO` WP↔TASK |
| Meeting produced WP | `PRODUCES` | MEETING → WORK_PRODUCT | SYSTEM | live user `REFERENCES`/`RELATED_TO` WP↔MEETING |
| WP realized as file | `REALIZED_AS` | WORK_PRODUCT → DOCUMENT | SYSTEM | live user `REFERENCES`/`RELATED_TO` WP↔DOCUMENT |
| Task attached a file | `ATTACHED_TO` | DOCUMENT → TASK | USER | existing; **not** converted to WP |
| Task references a file | `REFERENCES` | TASK → DOCUMENT | USER | existing; **not** converted to WP |
| Meeting attached a file | `ATTACHED_TO` / `GENERATES` | DOCUMENT↔MEETING | USER / existing registry | not converted to WP |
| Weak WP neighbors | `REFERENCES` / `RELATED_TO` | WORK_PRODUCT ↔ … | USER | live link UI; kept as the source fact |

`REALIZED_AS` is new: no live code named realization. `RELATED_TO` is too generic to be the only query key.

Not added: `IS_A`, `GENERATED_DOC`, `OUTPUT_OF`, `DOCUMENT_VERSION` nodes.

 leftover OPTION A `PRODUCES` TASK→DOCUMENT is not created from new attaches.
