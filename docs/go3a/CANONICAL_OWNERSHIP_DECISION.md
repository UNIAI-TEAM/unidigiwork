# GO-3A — Canonical ownership decision

Replace `NO_PARALLEL_WORK_PRODUCT_TABLE` with **`NO_DUPLICATE_WORK_PRODUCT_AUTHORITY`**.

Multiple tables may exist. Two writers must not both be source-of-truth for the same artifact/version.

## OPTION chosen for Document IS_A Work Product

**OPTION B (envelope), not adapter-only OPTION A.**

Live already has an independent Work Product identity (`/work-products/:id`) and a `WORK_PRODUCT` graph node. A Document is one possible **linked artifact**, not the Work Product row.

Creating a Document does **not** require creating a `work_products` row.  
Creating a Work Product does **not** make `documents.id` the Work Product id.

“Document IS_A Work Product” remains a **type/classification** (`business_type = DOCUMENT` is allowed on the MVP). It is not `documents.id = work_products.id`.

---

## One authority per concept

| Concept | Canonical owner | Must not own it |
| --- | --- | --- |
| Work Product **semantic identity** | Live `work_products.id` | `documents.id`, `work_units.code`, graph node id |
| Work Product **business type** | `work_products.business_type` | mime type on documents |
| Work Product **business lifecycle** (draft / review / approve / archive) | `work_products.status` + live review UI | `document_versions`, Office session |
| Work Product **content version** | `work_product_versions` (snapshot/restore in live editor) | `document_versions`, Office save |
| **Document artifact identity** | `documents.id` | `work_products.id` |
| **Document file version** | `document_versions` | `work_product_versions`, export artifacts |
| **Office edit session** | `office_sessions` / `office_save_operations` | Work Product composer |
| **Storage object for Office files** | `documents.storage_ref` / `document_versions.storage_ref` (bucket `documents`) | WP GenOffice export (separate artifact id) |
| **Exported WP file** (builtin/GenOffice) | Live export **artifact** (downloaded by `artifactId`) | Must not become a second Office version history |
| Execution **catalog / template** | `work_units` | `work_products` |
| **AI execution record** | `ai_task_executions` + WEE metrics | WP snapshots (provenance flags only) |
| **Review state (WP)** | Live WP review tab | Document share `document_permissions` |
| **Acceptance / quality (WEE)** | `work_units` contracts + `persist_work_quality` / execution outcome | WP status (different product: catalog run vs deliverable doc) |
| **Evidence / provenance (WP snapshot)** | Snapshot `provenance` payload | Graph (derived) |
| **Graph representation** | `work_nodes` / `work_edges` **derived** | Never SSOT for files or WP content |
| **Meeting structured output** | `meeting_artifacts` | `work_products`, `documents` unless a real document is attached |
| **Sell Work cohort proof** | Live cohort APIs on `work_units` code | `/work-products` MVP |

---

## Dual-write rules

| Flow | Allowed write | Forbidden |
| --- | --- | --- |
| UniWork Office save | `document_versions` (+ `documents.current_version`) | `work_product_versions` |
| WP editor snapshot | `work_product_versions` | `document_versions` |
| WP file export | WP artifact store | Treating export as Office version |
| WEE bind | `ai_task_executions` contract snapshot | Creating `work_products` rows as a side effect (unless a future explicit product rule) |

`OFFICE_SAVE_SINGLE_WRITER = YES`  
`NO_DOCUMENT_VERSION_DUAL_WRITE = YES`

---

## What `work_products` is

**MIXED deliverable registry**, not the Sell Work catalog:

- Semantic result of work (proposal, report, …)
- Business lifecycle + review
- In-app content + immutable snapshots
- Optional file export
- Optional links to Task / Meeting / Document

It is **not** (B) Sell Work catalog — that is `work_units`.  
It is **not** (E) a thin wrapper whose id equals `documents.id`.

## What `work_product_versions` is

**BUSINESS_VERSION / content snapshot**, not Office file version:

- Version number shown as `v{n}` on the WP
- Optional AI flag and provenance list
- Restore in the in-app editor

If a future dump shows file bytes/checksums duplicated from `document_versions` for the same Office save, that would flip `DUPLICATE_VERSION_AUTHORITY` to YES. **Live client evidence does not show Office save writing this table.**
