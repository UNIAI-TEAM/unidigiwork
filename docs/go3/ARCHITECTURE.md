# GO-3 architecture (Option B)

Predecessor: [GO-3A](../go3a/GO3_IMPLEMENTATION_CONTRACT.md).

```
WORK UNIT (work_units)          catalog / Sell Work template
        │
        ▼  (not projected here unless source-backed)
EXECUTION (ai_task_executions)  BLOCKED_BY_SOURCE_MODEL for WP edges
        │
        ▼
WORK PRODUCT (work_products)    business deliverable
        │ REALIZED_AS (system, from live REFERENCES/RELATED_TO)
        ▼
DOCUMENT (documents)            file artifact
        │
        ▼
document_versions               Office / file history only
```

Work Product content snapshots remain `work_product_versions`. They are not Office versions.

A Work Product may exist without a Document. A Document may exist without a Work Product. Cardinality is 0..n artifacts; MVP uses at most one Document link.

## Option B rules

- Keep both node types. Do not stamp `DOCUMENT.semanticType = WORK_PRODUCT`.
- Do not interpret Document IS_A Work Product as shared UUID.
- `REALIZED_AS` is added because live `REFERENCES` / `RELATED_TO` do not name artifact realization. It is projected only from those user links (source-backed).
- Task → Document `ATTACHED_TO` / `REFERENCES` stays a document attachment. It does **not** create a Work Product.

## Commit-first

Source INSERT/UPDATE for documents, document_versions, work_products, and work_product_versions must succeed if graph projection throws. Triggers wrap projection and outbox emit in `EXCEPTION WHEN OTHERS`. Office save already commits then emits `document.document.version_uploaded`.
