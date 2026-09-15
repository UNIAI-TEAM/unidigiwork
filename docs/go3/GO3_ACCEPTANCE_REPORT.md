# GO-3 acceptance report

Date: 2026-09-15. Predecessor: [GO-3A](../go3a/GO3A_ACCEPTANCE_REPORT.md) (`GO3A_READY = YES`).

GO-3 implements Option B graph projection for the three-authority model. It does not collapse Work Unit, Work Product, and Document. Cloud runtime was not executed.

## What shipped

- Additive migration `20260915090000_go3_option_b_work_graph.sql`: `WORK_PRODUCT` node type, `REALIZED_AS` / `PRODUCES` overlays, DOCUMENT projector without `semanticType=WORK_PRODUCT`, WP outbox, tenant-scoped backfill.
- Zip-only `CREATE TABLE IF NOT EXISTS work_products` / `work_product_versions` when live tables are absent. Live DDL remains authoritative (`NO_NEW_WORK_PRODUCT_TABLES = YES`).
- Projector + outbox reuse; no second event system; no GO-4; Office RPCs untouched.

## Flags

```
GO3A_CONTRACT_FOLLOWED = YES
THREE_AUTHORITY_MODEL_PRESERVED = YES
WORK_PRODUCT_BUSINESS_AUTHORITY = work_products
WORK_PRODUCT_VERSION_AUTHORITY = work_product_versions
DOCUMENT_ARTIFACT_AUTHORITY = documents
DOCUMENT_VERSION_AUTHORITY = document_versions
WORK_UNIT_AUTHORITY = work_units
WORK_PRODUCT_GRAPH_PROJECTION = PASS
DOCUMENT_GRAPH_PROJECTION = PASS
WORK_PRODUCT_DOCUMENT_LINK = PASS
TASK_WORK_PRODUCT_GRAPH = PASS
MEETING_WORK_PRODUCT_GRAPH = PASS
AI_EXECUTION_WORK_PRODUCT_GRAPH = BLOCKED_BY_SOURCE_MODEL
WORK_PRODUCT_VERSION_SEPARATION = PASS
DOCUMENT_VERSION_SEPARATION = PASS
OFFICE_SAVE_SINGLE_WRITER = YES
NO_DOCUMENT_VERSION_DUAL_WRITE = YES
NO_DUPLICATE_WORK_PRODUCT_AUTHORITY = YES
NO_NEW_WORK_PRODUCT_TABLES = YES
PROJECTOR_IDEMPOTENT = YES
EVENT_RETRY_DUPLICATES = 0
OUT_OF_ORDER_SAFE = YES
LATEST_VERSION_REGRESSION = NO
BACKFILL_IMPLEMENTED = YES
BACKFILL_SECOND_RUN_DUPLICATES = 0
CROSS_TENANT_GRAPH_TEST = PASS
GRAPH_READ_RESPECTS_SOURCE_PERMISSION = YES
WORK_PRODUCT_WRITE_INDEPENDENT_OF_GRAPH = YES
DOCUMENT_WRITE_INDEPENDENT_OF_GRAPH = YES
GRAPH_FAILURE_DOES_NOT_CORRUPT_SOURCE = YES
GRAPH_RETRY_RECOVERS = YES
AUDIT_OUTBOX_REUSED = YES
SECOND_EVENT_SYSTEM_CREATED = NO
GO2C_REGRESSION = PASS
WORK_PRODUCT_MVP_REGRESSION = PASS
SELL_WORK_REGRESSION = PASS
NO_GO4_IMPLEMENTATION = YES
GO3_CODE_READY = YES
GO3_RUNTIME_READY = NOT_RUN
GO3_READY = PARTIAL
```

Projection / idempotency / cross-tenant / backfill flags are **code+SQL contract** results. They are not Lovable Cloud runtime proofs.

## Notes

- Live WP↔Document/Task/Meeting links are user `REFERENCES`/`RELATED_TO`. GO-3 projects system `REALIZED_AS` and `PRODUCES` from those links only.
- `MEETING_ARTIFACT` is unchanged and is not converted to Work Product.
- Local Option A migration `20260915053000_go3_work_product_graph.sql` is superseded in behavior by `20260915090000_*` (functions replaced). Do not treat Option A as architecture.

## NEXT REQUIRED STEP

TARGET TOOL: LOVABLE  
GO-3 LIVE RUNTIME ACCEPTANCE

Do not start that step from this Cursor phase.
