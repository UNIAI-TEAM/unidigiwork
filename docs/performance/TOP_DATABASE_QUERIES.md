# UNIWORK — TOP DATABASE QUERIES

Nguồn: `pg_stat_statements` (đã bật ở extension level; role psql hạn chế không đọc trực tiếp,
lấy qua Lovable Cloud slow-query API). Dataset hiện tại **rất nhỏ** (bảng lớn nhất 1.309 dòng)
→ mọi số liệu dưới đây chỉ là baseline dev, KHÔNG đại diện production.

| # | Query (rút gọn) | Calls | Mean ms | Total ms | Ghi chú |
|---|---|---|---|---|---|
| 1 | `workspaces` list (order created_at desc) | 256 | 7.11 | 1.820 | select giới hạn cột, cần index `(deleted_at, created_at desc)` khi dataset lớn |
| 2 | `tenant_members` + lateral join `tenants` (resolve tenant context) | 1.337 | 1.12 | 1.501 | hot nhất theo call count — bootstrap mọi request |
| 3 | `provision_tenant()` (test fixture) | 71 | 15.79 | 1.121 | chỉ chạy trong test |
| 4 | `documents` list order updated_at desc | 123 | 6.32 | 777 | có index `idx_documents_ws_updated` |
| 5 | `tasks` list order updated_at desc | 123 | 4.73 | 582 | có index `idx_tasks_ws_updated` |
| 6 | `meetings` list order updated_at desc | 123 | 3.81 | 469 | index theo `start_at`, chưa có theo `updated_at` |
| 7 | RLS helper (`has_role`/`is_tenant_member`) micro-calls | 24.320 | 0.01 | ~250 | chi phí RLS phân tán, chấp nhận |
| 8–20 | audit_events insert, outbox claim/complete, entitlements check, usage_counters upsert, notifications insert, chat read-state update, email_states upsert, quota_check insert, workflow dispatch, profiles lookup, invoices list, plan_features list, knowledge list | – | < 5 | – | tất cả đều < 5 ms ở dataset dev |

Kết luận: chưa có query nào vượt SLO **ở dataset dev**. Không thể suy ra hành vi ở 20.000 tasks /
500.000 chat_messages — cần seed dataset large trước khi kết luận (§14).
