# GO-3A acceptance report

GO-3A is architecture reconciliation. No tables created or dropped. No Office changes. No GO-3 projector shipped as accepted baseline.

## What we found

Live UniWork already runs a **Work Product deliverable MVP** (`/work-products`) with independent identity, review, snapshots, export (builtin/GenOffice), and a **WORK_PRODUCT** graph node. That model is **missing from this platform zip** (`types.ts` has no `work_products`).

This zip’s “Work Product” code is mostly **`work_units` (WEE catalog)** plus **Documents/Office**. Local GO-3 that treated Document as the Work Product identity is **invalid against live**.

## Flags

| Flag | Value |
| --- | --- |
| EXISTING_WORK_PRODUCTS_MAPPED | YES |
| EXISTING_WORK_PRODUCT_VERSIONS_MAPPED | YES |
| DOCUMENTS_MODEL_MAPPED | YES |
| DOCUMENT_VERSIONS_MODEL_MAPPED | YES |
| WORK_PRODUCT_GRAPH_NODE_MAPPED | YES |
| DOCUMENT_GRAPH_NODE_MAPPED | YES |
| WORK_PRODUCTS_PURPOSE | MIXED |
| WORK_PRODUCT_VERSIONS_PURPOSE | BUSINESS_VERSION |
| DUPLICATE_ARTIFACT_AUTHORITY | NO |
| DUPLICATE_VERSION_AUTHORITY | NO |
| DOCUMENT_ARTIFACT_AUTHORITY | documents |
| DOCUMENT_VERSION_AUTHORITY | document_versions |
| OFFICE_SAVE_SINGLE_WRITER | YES |
| NO_DOCUMENT_VERSION_DUAL_WRITE | YES |
| NO_DUPLICATE_WORK_PRODUCT_AUTHORITY | YES |
| WORK_PRODUCT_SEMANTIC_MODEL_CLEAR | YES |
| GRAPH_REPRESENTATION_DECIDED | YES |
| LEGACY_MIGRATION_PLAN_DEFINED | YES |
| SELL_WORK_COMPATIBILITY_PRESERVED | YES |
| GO3_IMPLEMENTATION_CONTRACT_READY | YES |
| GO3A_READY | **YES** |

## Purpose enums (expanded)

`WORK_PRODUCTS_PURPOSE = MIXED`: live deliverable identity + lifecycle/review + in-app content + export. Not Sell Work catalog (`work_units`). Not Office file identity.

`WORK_PRODUCT_VERSIONS_PURPOSE = BUSINESS_VERSION`: immutable editor snapshots + provenance. Not Office file history.

`DUPLICATE_* = NO` from **writer paths in evidence**. Confirm on live DDL that export artifacts are not also `document_versions` rows for the same Office save.

Physical column lists for `work_product*` were **not** dumped (no DB URL). Mapping is from live UI/bundles + operator table names. GO-3’s first step is a read-only schema dump, not a new product model.

## GO3A_READY

Ownership is unambiguous:

- Files: `documents` / `document_versions` / Office  
- Deliverable: live `work_products` / `work_product_versions`  
- Catalog: `work_units`  
- Graph: both DOCUMENT and WORK_PRODUCT nodes, derived  

GO-3 may implement **projection only** per `GO3_IMPLEMENTATION_CONTRACT.md`.
