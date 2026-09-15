# GO-3A — Reconciliation plan (design only — do not execute)

## Conflict 1 — Homonym “Work Product”

| | |
| --- | --- |
| CURRENT | `work_units` APIs named Work Product; live `/work-products` is a different deliverable; Office audit event `WORK_PRODUCT_VERSION_CREATED` means document version |
| TARGET | Three names in code/docs: **Catalog item** (`work_units`), **Work Product** (`work_products`), **Document** (`documents`) |
| MIGRATION | Rename in **application language** only. Do not rename WEE tables. |
| COMPATIBILITY | Keep `listWorkProducts` / `getWorkProduct` on `work_units` for `/work-catalog`. New WP APIs stay on deliverable fns (`work-deliverables.*` live). |
| RISK | Low if names stay in UI copy; high if someone merges tables |
| ROLLBACK | N/A (docs/API aliases only) |

## Conflict 2 — This zip vs live schema

| | |
| --- | --- |
| CURRENT | Zip `types.ts` has no `work_products`. Live PWA + operator DB have them. Local GO-3 assumed they must not exist. |
| TARGET | Treat **live DB + live PWA** as WP runtime. Refresh schema dump **read-only** at start of GO-3. |
| MIGRATION | None now. Do not apply `20260915053000_go3_work_product_graph.sql`. |
| COMPATIBILITY | Office GO-2C on `documents` stays. |
| RISK | Applying local GO-3 would stamp DOCUMENT nodes as WORK_PRODUCT and fight live node type |
| ROLLBACK | Leave local GO-3 files unused |

## Conflict 3 — Two version axes

| | |
| --- | --- |
| CURRENT | WP snapshots vs `document_versions` |
| TARGET | Keep both; different entities |
| MIGRATION | None. If dump shows Office save also inserting `work_product_versions`, stop that writer (GO-3 must not add it) |
| COMPATIBILITY | PWA document history and WP versions tab both keep working |
| RISK | Medium if export was incorrectly stored as `document_versions` — inspect artifacts table first |
| ROLLBACK | N/A |

## Conflict 4 — Graph types

| | |
| --- | --- |
| CURRENT | Zip enum missing `WORK_PRODUCT`; live href exists |
| TARGET | Add `WORK_PRODUCT` to zip vocabulary **when implementing GO-3**, matching live registry |
| MIGRATION | Additive CHECK / `work_relationship_types` only after live dump |
| COMPATIBILITY | Existing DOCUMENT edges unchanged |
| RISK | Duplicate PRODUCES TASK→DOCUMENT vs TASK→WORK_PRODUCT |
| ROLLBACK | Do not insert new edge codes until dump |

## Conflict 5 — Sell Work

| | |
| --- | --- |
| CURRENT | Catalog + live `/admin/cohorts`, `/admin/proof`, `/admin/sell-work/pilots` |
| TARGET | Unchanged |
| MIGRATION | None |
| COMPATIBILITY | Required |
| RISK | Using `work_products` rows as catalog items |
| ROLLBACK | N/A |

## Data classification (no deletes)

Without row dumps, classify **systems**, not rows:

| System | Class |
| --- | --- |
| Live `/work-products` | ACTIVE_CANONICAL for deliverable identity |
| `documents` / Office | ACTIVE_CANONICAL for files |
| `work_units` | ACTIVE_CANONICAL for catalog |
| Local GO-3 projection | NOT live; do not backfill onto production |
| Unknown WP rows on live | UNKNOWN until `SELECT` (tenant, timestamps, document link) |

## Approaches allowed later (not now)

KEEP · ADAPT (zip types to live) · PROJECT (graph from existing tables) · READ-ONLY LEGACY · BACKFILL REFERENCE (edges from live links only)

Forbidden now: DROP tables, merge WP into documents, dual-write Office save.
