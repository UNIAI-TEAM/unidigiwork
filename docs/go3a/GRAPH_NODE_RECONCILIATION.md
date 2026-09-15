# GO-3A — Graph node reconciliation

## Live vs this zip

| Node type | This zip CHECK / TS enum | Live `workEntityHref` |
| --- | --- | --- |
| DOCUMENT | yes | `/documents/:id` |
| WORK_PRODUCT | **no** | `/work-products/:id` |
| MEETING_ARTIFACT | yes | `/meeting?artifact=:id` |
| TASK, MEETING, WORKSPACE, PERSON, EMAIL, CHAT_CHANNEL | yes | matching app routes |

They are **intentionally different**. Do not delete either type.

## What each node means

| Node | `entity_id` | Created by (this zip) | Created by (live, from UI) |
| --- | --- | --- | --- |
| DOCUMENT | `documents.id` | `tg_work_graph_project_document` | same family; still file documents |
| WORK_PRODUCT | `work_products.id` | **not implemented in zip** | live WP create/import/editor (projector not in client) |

Same UUID appearing as both types would be a **bug**. Do not alias them.

## Edges (this zip)

Known document edges: `BELONGS_TO` DOCUMENT→WORKSPACE; user `ATTACHED_TO` DOCUMENT→TASK/MEETING; `REFERENCES` TASK→DOCUMENT; `GENERATES` MEETING→DOCUMENT (registry).

Live mobile WP detail loads **links** TASK / DOCUMENT / MEETING. Exact `relationship_type` codes are **not in the client bundle**. GO-3 must read `work_relationship_types` on live DB before adding `PRODUCES` / `REALIZED_AS`.

Local GO-3 added `PRODUCES` TASK→DOCUMENT and `CREATED_BY` PERSON→DOCUMENT. If live already uses TASK→WORK_PRODUCT, that local vocabulary is the wrong target.

## Desired long-term shape vs now

Conceptual:

```
Task ──PRODUCES──► Work Product ──?──► Document
```

**Do not force `REALIZED_AS` in GO-3** unless live data has a real document realization FK or a dedicated edge. Today Documents are **linked** neighbors, not the WP identity.

If a Work Product `business_type = DOCUMENT` but has no `documents` row, that is still a valid WP (in-app content / export artifact). Graph DOCUMENT node is optional.

## Decision for GO-3

1. Keep DOCUMENT nodes as they are (file SSOT projection).
2. Keep / project WORK_PRODUCT nodes from `work_products` (live already has the type).
3. Do **not** put `semanticType=WORK_PRODUCT` on DOCUMENT nodes (supersedes local `docs/go3/WORK_PRODUCT_GRAPH_DECISION.md` OPTION A).
4. Do **not** delete historical DOCUMENT or WORK_PRODUCT nodes.
5. Office version events update DOCUMENT metadata only (`document_versions`), never WP identity.
