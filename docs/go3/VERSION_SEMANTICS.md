# GO-3 version semantics

Two version axes. They are not synchronized.

| Axis | Table | Meaning | Written by | Graph |
| --- | --- | --- | --- | --- |
| Business / content snapshot | `work_product_versions` | WP editor snapshot / restore / `v{n}` on `/work-products/:id` | Live WP snapshot mutation | `WORK_PRODUCT.metadata.latestBusinessVersion` (monotonic) |
| Office / file | `document_versions` | Immutable file bytes + mime + storage_ref | `upload_document_version`, `office_save_complete` | `DOCUMENT.metadata.latestVersion` (monotonic) |

Do **not**:

- insert `work_product_versions` because Office saved
- insert `document_versions` because WP content was snapshotted
- create `DOCUMENT_VERSION` graph nodes

Out-of-order: `GREATEST(existing, incoming)`. v5 then v4 leaves 5.

`documents.current_version` and `work_products.current_version` remain source; graph metadata is derived.
