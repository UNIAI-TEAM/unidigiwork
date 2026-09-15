# GO-3 performance notes

| Path | Bound |
| --- | --- |
| Document version event | 1 document fetch, 1 node upsert, 1–2 edge upserts |
| WP upsert event | 1 work_products fetch (`to_jsonb`), 1 node upsert, ≤2 edges |
| User WP link | 1 overlay edge upsert after the user edge |
| Backfill | `LIMIT` documents + `LIMIT` work_products per tenant, then existing WP user edges for that tenant only |

No workspace-wide scan per event. No N+1 provenance walk. No unbounded backfill. No broad graph cache invalidation (reads are live SQL).

Retry: existing outbox exponential backoff (`fail_outbox_event`). Skippable errors complete the outbox row without retry.
