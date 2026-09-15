# GO-3 event mapping

Reuse `outbox_events` / `outbox_deliveries`. Channel `graph` is allowed. No second queue.

| Source event | Payload (safe) | Projection |
| --- | --- | --- |
| `document.document.version_uploaded` | `document_id`, `version`, tenant | DOCUMENT node + monotonic `latestVersion` + workspace/creator. **Not** WP versions. |
| `work_product.work_product.upserted` | `work_product_id`, tenant | WORK_PRODUCT node + safe metadata + BELONGS_TO / CREATED_BY |
| `work_product.work_product.version_created` | `work_product_id`, `version` | monotonic `latestBusinessVersion` only |

User `link_work_entities` is not an outbox event. `AFTER INSERT ON work_edges` projects `REALIZED_AS` / `PRODUCES` when the user edge is a WP↔Document/Task/Meeting `REFERENCES`/`RELATED_TO`.

Skipped (no retry): `CROSS_TENANT`, `NOT_FOUND`, `INVALID_PAYLOAD`, `DELETED_OR_MISSING`, `SOURCE_TABLE_MISSING`.

Never logged: WP body, document body, Office tokens, signed URLs, service-role secrets.
