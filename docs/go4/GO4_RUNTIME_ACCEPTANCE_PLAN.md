# GO-4 runtime acceptance plan

Source acceptance is **code + SQL tests**. Live DB migration is **not** applied from Cursor.

## When to run

After this branch is merged or the migration is applied on a Lovable Cloud / staging database that already has GO-3 (`20260915090000`).

## Procedure

1. Confirm GO-3 closed: `docs/go3-runtime/GO3_RUNTIME_ACCEPTANCE_REPORT.md` still `GO3_READY = YES`.
2. Apply **only** `20260915120000_go4_execution_work_product.sql` through the normal Supabase migration path (privileged). Do not rewrite GO-3.
3. `psql -v ON_ERROR_STOP=1 -f tests/integration/15_go3_option_b_work_graph.sql` — GO-3 regression.
4. `psql -v ON_ERROR_STOP=1 -f tests/integration/16_go4_execution_work_product.sql` — GO-4 A/B/C + graph + tenant.
5. Optional: `go4_execution_graph_backfill(_tenant_id)` per tenant with executions; second run node/edge counts unchanged.
6. Confirm Office save still writes only `document_versions` (GO-2C / test 15 office section if RPCs exist).
7. Confirm no RLS policy drop on pre-GO-4 tables.

## Expected runtime flags after a successful live run

```
GO4_RUNTIME_READY = YES
GO4_READY = YES
GO4_STATUS = CLOSED
```

Until then:

```
GO4_RUNTIME_READY = NOT_RUN
GO4_READY = PARTIAL
GO4_STATUS = READY_FOR_RUNTIME_ACCEPTANCE
```
