# GO-3 implementation source map

Architectural predecessor: [docs/go3a/](../go3a/GO3A_ACCEPTANCE_REPORT.md) (`GO3A_READY = YES`, OPTION B).

Inspected 2026-09-15. Live PWA `https://unidigiwork.lovable.app` is ahead of this zip. No Postgres URL was available in this environment.

## Authorities (do not merge)

| Authority | Source of truth | Graph node | App route | Writers in this zip / live |
| --- | --- | --- | --- | --- |
| Work Product (deliverable) | `work_products` / `work_product_versions` | `WORK_PRODUCT` → `work_products.id` | `/work-products/:id` | Live hashed `work-deliverables.functions-*`. Zip fixture table only if missing. |
| Document (file) | `documents` / `document_versions` | `DOCUMENT` → `documents.id` | `/documents/:id` | `create_document`, `upload_document_version`, GO-2C `office_save_complete` |
| Work Unit (catalog) | `work_units` | not a WP node | `/work-catalog`, `/admin/cohorts`, `/admin/proof` | `src/lib/api/work-products.server.ts` (WEE bind RPCs) |

## Live Work Product fields (client, not dumped DDL)

Create payload: `idempotencyKey`, `title`, `businessType`, `description`, `workspaceId`, `primaryContextType=WORKSPACE`, `primaryContextId`, `useTemplate`.

Row: `id`, `title`, `description`, `business_type`, `status`, `current_version`, `updated_at`, `created_at`, `ai_generated`, `tags`, `workspaceName`, `ownerName`.

Versions: `id`, `version`, `summary`/`title`, `ai_generated`.

Links UI (mermaid editor): source `WORK_PRODUCT`, targets `TASK|DOCUMENT|MEETING|MEETING_ARTIFACT`, relationship **`REFERENCES` (default) or `RELATED_TO`**. No `REALIZED_AS` in the live bundle. No `document_id` on create.

## Graph foundation reused

| Object | File |
| --- | --- |
| Tables | `work_nodes`, `work_edges`, `work_relationship_types` (`supabase/migrations/20260816014508_*.sql`) |
| Visibility | `can_view_work_entity`, `_work_entity_scope` (extended for `WORK_PRODUCT`) |
| System link | `_work_graph_link_system`, `_work_graph_link_system_in_tenant` |
| User link | `link_work_entities` / `unlink_work_entities` |
| Read | `get_work_context` |
| Outbox | `_emit_outbox_event`, `claim_outbox_events`, `src/lib/api/outbox-processor.server.ts` |

## GO-3 code (this phase)

| Concern | File |
| --- | --- |
| Migration | `supabase/migrations/20260915090000_go3_option_b_work_graph.sql` |
| Semantic map | `src/domain/work-graph/go3-mapping.ts` |
| Projector RPC wrappers | `src/lib/api/work-graph-projector.server.ts` |
| Outbox graph channel | `src/lib/api/outbox-processor.server.ts` |
| Vocabulary | `src/domain/work-graph/relationship-types.ts` |
| Href | `src/domain/work-graph/route-resolver.ts` |
| Resolve/search | `src/lib/api/work-graph.server.ts`, `work-graph.functions.ts` |
| Backfill HTTP | `src/routes/api/admin/work-product-graph-backfill.ts` |
| Integration | `tests/integration/15_go3_option_b_work_graph.sql` |

Superseded (do not apply as architecture): `20260915053000_go3_work_product_graph.sql` (DOCUMENT `semanticType=WORK_PRODUCT`). The Option B migration replaces those functions.

## Events

| Event | Writer | Projector |
| --- | --- | --- |
| `document.document.version_uploaded` | `_upload_document_version_trusted` / Office complete | `project_document_version_uploaded` → DOCUMENT `latestVersion` only |
| `work_product.work_product.upserted` | `tg_go3_work_product_write` (best-effort) | `project_work_product_upserted` |
| `work_product.work_product.version_created` | `tg_go3_work_product_version_write` | same WP node monotonic `latestBusinessVersion` |

Office audit name `WORK_PRODUCT_VERSION_CREATED` is **not** a write to `work_product_versions`.

## AI / WEE

`ai_task_executions` has no `document_id` in this zip → `AI_EXECUTION_WORK_PRODUCT_GRAPH = BLOCKED_BY_SOURCE_MODEL`.
