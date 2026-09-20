# GO-3 lifecycle semantics

| Source state | Graph |
| --- | --- |
| Document `deleted_at` set | DOCUMENT node deleted (existing trigger). Edges cascade. |
| Work Product `deleted_at` or `archived_at` set (if columns exist) | WORK_PRODUCT node deleted. No user-facing ghost. |
| User unlinks WP `REFERENCES`/`RELATED_TO` Document | system `REALIZED_AS` removed if no remaining user link |
| User unlinks WP↔Task/Meeting | system `PRODUCES` removed if no remaining user link |
| Workspace archived | existing workspace policies; no extra GO-3 rewrite |
| Tenant suspended | membership/RLS already hides nodes (`is_tenant_member` + `can_view_work_entity`) |

Audit/outbox rows are not deleted.

Graph is derived: a later backfill can restore nodes for rows that still exist.
