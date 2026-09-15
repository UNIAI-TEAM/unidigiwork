# GO-3 implementation contract

GO-3 may start only after this file is the agreed contract. GO-3A does not implement projection.

## Identity

| Question | Answer |
| --- | --- |
| Work Product identity | `work_products.id` (live MVP) |
| Does Document insert create a `work_products` row? | **No** |
| Does Work Product insert create a `documents` row? | **No** (unless a later explicit “realize as file” command exists in live DDL) |
| Document IS_A Work Product | Classification / `business_type`, **not** shared UUID |

## Graph

| Question | Answer |
| --- | --- |
| WORK_PRODUCT node required? | **Yes** — live already uses it; `entity_id = work_products.id` |
| DOCUMENT node remains? | **Yes** — `entity_id = documents.id` |
| Stamp DOCUMENT node `semanticType=WORK_PRODUCT`? | **No** |
| Extra REALIZED_AS node hop? | **Only if** live already has that edge or a document FK on `work_products`. Default: reuse live WP↔DOCUMENT **links** |
| Work → Work Product edge | Prefer live equivalent of **PRODUCES** Task/Meeting → WORK_PRODUCT if present; **do not invent**. If only DOCUMENT attach exists, project that, do not rewrite to WP |
| latestVersion on WP node | From `work_products.current_version` / max `work_product_versions.version` |
| latestVersion on DOCUMENT node | From `documents.current_version` / max `document_versions.version` |

## Events

| Source event | Project |
| --- | --- |
| Live WP create / snapshot / status (exact event names: **dump outbox on live**) | WORK_PRODUCT node + workspace/creator edges that already exist in live triggers |
| `document.document.version_uploaded` (GO-2C, unchanged) | DOCUMENT node file latestVersion **only** |
| User link WP↔Task/Document/Meeting | Mirror live `link_work_entities` / WP links API — do not add a second writer |
| Office session events | **Not** graph product nodes |

Do not subscribe Office save to `work_product_versions`.

## Backfill

- Tenant-scoped, idempotent, read `work_products` + existing graph + `documents`.
- Do not invent Task/Meeting/AI origin.
- Do not create `work_products` rows from historical documents.
- Historical documents stay DOCUMENT nodes (workspace + creator if known).
- Historical WP rows stay WORK_PRODUCT nodes; copy only source-backed links.

## Compatibility

| Surface | Rule |
| --- | --- |
| `/work-products*` | Keep; GO-3 is projection/read, not a UI rewrite |
| `/work-catalog*` + WEE RPCs | Untouched |
| `/admin/cohorts`, `/admin/proof`, sell-work pilots | Untouched |
| `/documents*` + Office HTTP | Untouched GO-2C |
| Zip types.ts | Must be regenerated from live **before** GO-3 SQL |

## First GO-3 engineering step (still not GO-3A)

Read-only on live DB:

```sql
-- illustrative; run when credentials exist
SELECT to_regclass('public.work_products'), to_regclass('public.work_product_versions');
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name LIKE 'work_product%' ORDER BY 1,2;
SELECT DISTINCT entity_type FROM work_nodes;
SELECT code, source_type, target_type FROM work_relationship_types
 WHERE source_type = 'WORK_PRODUCT' OR target_type = 'WORK_PRODUCT' OR code IN ('PRODUCES','REALIZED_AS');
```

No DML.

## Explicitly out of scope

GO-4, Office AI, rewriting WEE, rewriting Meeting Intelligence, applying local `20260915053000_go3_work_product_graph.sql`.
