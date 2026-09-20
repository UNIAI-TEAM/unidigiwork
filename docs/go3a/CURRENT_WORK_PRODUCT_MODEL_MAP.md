# GO-3A — Current Work Product model map

Inspected 2026-09-15 against:

| Source | What it is |
| --- | --- |
| `/Users/uranus/Projects/uniwork-platform` | Local platform tree (Lovable zip + later local GO-2C/GO-3 files). **Not a git repo.** Generated `src/integrations/supabase/types.ts` has **no** `work_products` / `work_product_versions` tables. |
| Live PWA | `https://unidigiwork.lovable.app` — **ahead of this zip** |
| UniWork Office | `/Users/uranus/Projects/uniwork-office` — GO-2C Bridge only; no Work Product tables |

No Postgres URL was available. Live table **names** `work_products` / `work_product_versions` are taken as operator-confirmed on the live database. Column/FK/RLS DDL for those tables is **not in this repository** and was not queried. Field lists below are from **live UI + client bundles**, not from `information_schema`.

---

## 0. Three different things named “Work Product”

| # | Product name | Persistence in **this repo** | Live surface | Role |
| --- | --- | --- | --- | --- |
| 1 | WEE / Sell Work **catalog** | `public.work_units` | `/work-catalog`, `/work-catalog/$code` | Template/contract for AI execution |
| 2 | Work Product **MVP deliverable** | **Absent from this zip** | `/work-products`, `/work-products/$id`, `/m/work-products` | Semantic output with review, snapshots, export |
| 3 | **Document** file | `public.documents` + `document_versions` | `/documents`, `/documents/$id` + Office Bridge | File artifact; Office save target |

Calling (1) and (2) the same entity is the main naming overload. They must stay separate.

---

## 1. Live MVP (not in this zip)

### Routes (live JS)

| Path | Bundle | Notes |
| --- | --- | --- |
| `/work-products` | `work-products-0T3eJdfq.js` | List + create + weekly stats + access policy |
| `/work-products/$id` | editor via `mermaid-HWGCJPDP-37pLZaFh.js` (`/_authenticated/work-products_/$id`) | In-app composer: content, AI, versions, review, comments, context, links, files, share |
| `/m/work-products`, `/m/work-products/$id` | `work-products.index-BXklqOXN.js`, `work-products._id-DA9AhVAF.js` | Mobile list/detail |
| Server fns | `work-deliverables.functions-*.js`, `work-products-docx.functions-*.js` | Hashed TanStack server fns (table names not in client) |

### Fields observed on live clients

Work Product row (list/detail):

`id`, `title`, `description`, `business_type`, `status`, `current_version`, `updated_at`, `created_at`, `workspace` / `workspaceName`, `ownerName`, `ai_generated`, `tags[]`

`business_type` enum (client): `PROPOSAL | REPORT | ANALYSIS | CONTRACT | PLAN | PRESENTATION | MEMO | DOCUMENT | OTHER`

`status` enum (list client): `DRAFT | IN_REVIEW | CHANGES_REQUESTED | APPROVED | FINAL | ARCHIVED`  
Mobile status labels also mention `PUBLISHED` — treat as live vocabulary, confirm on DDL later.

Versions (mobile `m.product.versions[]`): `id`, `version`, `summary` / `title`, `ai_generated`

Snapshot create (desktop): `id`, `aiGenerated`, `provenance[]` `{ type, id, title, stamp }` → returns `{ version }`

Restore: `{ id, version }`

Export file: `{ id, format, engine? }` → `{ artifact: { format }, engine, url via artifactId }`  
Engines: builtin vs `GENOFFICE`. Download is **artifact id**, not `documents.id`. **No** `/api/office/sessions` in this editor.

Links (mobile): graph-like neighbors `TASK`, `DOCUMENT`, `MEETING` with `entityId`, `title`, `subtitle`, `status`, `startsAt`.

Access policy: `viewScope` / `editScope` ∈ `TENANT | WORKSPACE | OWNER`, `adminOverride`.

Follow: `{ following, followerCount }`.

Share: user or workspace, optional expiry.

DOCX import: `{ fileName, mimeType, base64 }` → creates a Work Product and opens `/work-products/$id`.

### Graph (live client)

`workEntityHref` in live bundle:

```
DOCUMENT      → /documents/:id
WORK_PRODUCT  → /work-products/:id
MEETING_ARTIFACT → /meeting?artifact=:id
```

Local zip `WORK_ENTITY_TYPES` **omits** `WORK_PRODUCT`. Live does not. These are **two node types**, not aliases.

### Writers / readers (live, inferred from UI)

| Action | Writer | Reader |
| --- | --- | --- |
| Create WP / import DOCX | `work-deliverables` + `work-products-docx` server fns | List/detail |
| Edit content + save | same | editor |
| Immutable snapshot | snapshot mutation | versions tab |
| Review approve / request changes | review mutations | review tab |
| Export DOCX/XLSX/PPTX/PDF | export mutation (builtin or GenOffice) | files tab |
| Link task/doc/meeting | links API | links tab + mobile |
| Share / follow / comments | dedicated mutations | share/comments |
| Graph display | `get_work_context` family (live `work-graph.functions` has more hashed fns than this zip) | related-work UI |

Office desktop is **not** a writer of this MVP.

---

## 2. WEE catalog — `work_units` (this repo + live `/work-catalog`)

**DDL:** `supabase/migrations/20260827121202_90f62f5f-dd94-4f9d-847e-b4b2e1726aef.sql` plus WE-2 contract columns in `20260827123211_27a6607c-5810-4691-97f8-878a10aa8186.sql`.

**Types:** `src/integrations/supabase/types.ts` → `work_units`.

**Columns (repo):** `code` (PK), `version`, `template_code`, `label`, `objective`, `category`, `status`, `description`, `deliverable_type`, `expected_outcome_type`, `sla_machine_ms`, `contract_hash`, `input_contract`, `context_contract`, `executor_contract`, `action_contract`, `deliverable_contract`, `acceptance_contract`, `quality_contract`, `review_contract`, `sla_contract`, timestamps.

**RLS:** SELECT for authenticated (`USING true` on catalog). Writes via WE-2 RPCs / admin, not Office.

**RPCs:** `bind_work_product_execution`, `work_product_contract_payload`, `work_product_summary`, `work_product_economics`, `resolve_work_unit_for_execution`.

**App:** `src/lib/api/work-products.server.ts`, `work-products.functions.ts`, `src/domain/work-products/contracts.ts`, `src/routes/_authenticated/work-catalog.tsx`. Live also `/work-catalog/$code` with cohort proof (`sell-work-cohort.functions`).

This is **not** a document and **not** the `/work-products` MVP row.

---

## 3. Documents — this repo (Office GO-2C)

### `documents`

Origin: `20260610075054_c7904a9e-d87e-4bdd-8563-1e3c854861bf.sql`, tenant/workspace later, file fields in `20260728122443_354e1b13-5b70-4e54-8056-0aff70c30c37.sql`.

**Columns (types.ts):** `id`, `tenant_id`, `workspace_id`, `title`, `folder`, `content`, `mime_type`, `size_bytes`, `storage_ref`, `current_version`, `tags`, `created_by`, `updated_by`, `deleted_at`, `row_version`, `created_at`, `updated_at`.

**RPCs:** `create_document`, `update_document`, `archive_document`, `upload_document_version`, Office session/save RPCs in GO-2C migration.

**Graph:** `tg_work_graph_project_document` → DOCUMENT node, `BELONGS_TO` workspace. `can_view_work_entity('DOCUMENT')` requires `deleted_at IS NULL`.

**UI:** `src/routes/_authenticated/documents.tsx`, `documents.$id.tsx`, `src/lib/api/documents.functions.ts`, `openInUniWorkOffice` → `POST /api/office/sessions`.

### `document_versions`

**Columns:** `id`, `document_id` → `documents`, `tenant_id`, `version`, `storage_ref`, `mime_type`, `size_bytes`, `comment`, `author_id`, `created_at`. UNIQUE `(document_id, version)`.

**Trigger:** `tg_document_versions_immutable` — no UPDATE/DELETE.

**Index:** `(document_id, version DESC)`.

**RLS:** tenant member SELECT/INSERT.

**Office save:** `_upload_document_version_trusted` / `office_save_complete` → **this table only**. Outbox `document.document.version_uploaded`. Audit includes `WORK_PRODUCT_VERSION_CREATED` as an **event name**, not a write to `work_product_versions`.

---

## 4. Work Graph (this repo vs live)

| | This zip | Live client |
| --- | --- | --- |
| Tables | `work_nodes`, `work_edges`, `work_relationship_types` | same names (assumed; live hrefs exist) |
| Entity types | TENANT, WORKSPACE, TASK, PERSON, MEETING, CHAT_CHANNEL, DOCUMENT, EMAIL, MEETING_ARTIFACT | **plus `WORK_PRODUCT`** |
| Unique node | `(tenant_id, entity_type, entity_id)` | (same pattern) |
| Document projector | `tg_work_graph_project_document` | unknown extra WP projector |
| Read | `get_work_context`, `link_work_entities` | additional hashed graph fns |

Premature local GO-3 (`docs/go3/*`, `20260915053000_go3_work_product_graph.sql`) stamped `semanticType=WORK_PRODUCT` **on DOCUMENT nodes**. That **collides** with live `WORK_PRODUCT` entity type. Do not apply it.

---

## 5. Sell Work / WEE runtime (keep)

| Table / RPC | Purpose |
| --- | --- |
| `work_units` | Catalog/contract |
| `ai_task_executions` | AI run; deliverable_* text fields; **no document_id** in this zip |
| `work_execution_metrics/costs/steps` | Metering |
| `work_pricing_policies` | Price |
| Live `/admin/cohorts`, `/admin/proof`, `/admin/sell-work/pilots` | Cohort proof UI (not in this zip) |

---

## 6. Meeting artifacts

`meeting_artifacts` — Meeting Intelligence structured outputs (SUMMARY, DECISION, …). Graph `MEETING_ARTIFACT`. **Not** `documents` and **not** `/work-products`.

---

## 7. Matrix

| TABLE | PURPOSE | SOURCE WRITER | SOURCE READER | AUTHORITATIVE? | DUPLICATES? | KEEP / REFACTOR / DEPRECATE / UNKNOWN |
| --- | --- | --- | --- | --- | --- | --- |
| `work_products` (live; **no DDL in zip**) | MVP deliverable identity + status + current_version | Live WP server fns | `/work-products*` | **Yes** for WP semantic/business identity | Not a duplicate of `documents` (different id, UI, graph type) | **KEEP** |
| `work_product_versions` (live; **no DDL in zip**) | Immutable **content** snapshots + provenance | Snapshot mutation | versions tab | **Yes** for WP content history | Not `document_versions` (no Office save path) | **KEEP** |
| Companion WP domains (shares, comments, review, artifacts, follow, access) | Review/share/export | Live WP UI | Live WP UI | Yes for those concerns | Export artifacts ≠ `document_versions` (artifactId download) | **KEEP** (names UNKNOWN until dump) |
| `documents` | File document identity | `create_document`, uploads, Office | PWA documents + Office | **Yes** for file identity | No | **KEEP** |
| `document_versions` | Immutable **file** versions | `upload_document_version`, Office complete | PWA version list, Office download | **Yes** for file history | No | **KEEP** |
| `office_sessions` / `office_save_operations` | Office session only | Office HTTP | server only | Session, not product | No | **KEEP** |
| `work_units` | Execution catalog | WE-2 / seed | `/work-catalog`, bind RPC | **Yes** for catalog | Name collision only | **KEEP** |
| `work_nodes` / `work_edges` | Derived graph | triggers + `link_work_entities` | `get_work_context` | **No** (derived) | Must not own files | **KEEP**; extend types to match live `WORK_PRODUCT` |
| `meeting_artifacts` | Meeting structured output | Meeting Intelligence | meeting UI / graph | Yes for that domain | Not WP MVP | **KEEP** |
| `ai_task_executions` | AI execution record | WEE | task AI panel | Yes for execution | May mention deliverable text; not file SSOT | **KEEP** |

Row counts: **not available** (no DB session). Do not classify live rows as TEST_FIXTURE vs ACTIVE without a read-only query.

---

## 8. Local premature GO-3 (do not treat as baseline)

Present only in this working tree, **not** on live (live already has `/work-products` + `WORK_PRODUCT` nodes):

- `src/domain/work-product-semantics/`
- `src/lib/api/work-graph-projector.server.ts`
- `src/lib/api/work-product-semantics.functions.ts`
- `src/routes/api/admin/work-product-graph-backfill.ts`
- `supabase/migrations/20260915053000_go3_work_product_graph.sql`
- `tests/integration/14_work_product_graph.sql`
- `docs/go3/*`

Assumption that was **false** vs live: `NO_PARALLEL_WORK_PRODUCT_TABLE` and “Document node carries Work Product semantics.”

GO-3A **does not delete** these files and **does not apply** that migration.
