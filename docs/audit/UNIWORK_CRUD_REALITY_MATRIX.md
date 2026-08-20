# UNIWORK — CRUD Reality Matrix

Nguồn: `tests/runtime/crud/artifacts/crud-summary.json` (37/37 PASS_REAL), `tests/runtime/tenant-isolation/artifacts/*`, row-count DB 2026-08-20.

| Entity | Create | Read | Update | Delete/Archive | Persist | Tenant isolation | Audit | Outbox | Kết luận |
|---|---|---|---|---|---|---|---|---|---|
| workspace | PASS | PASS | PASS | n/a | PASS | PASS | PASS | PASS | REAL |
| workspace_tag | PASS | PASS | PASS | PASS | PASS | PASS | – | – | REAL |
| task | PASS | PASS | PASS | direct-write DENIED (đúng) | PASS | PASS | PASS | PASS | REAL |
| document | PASS | PASS | PASS | ARCHIVE PASS (idempotent) | PASS | PASS (9/9 RLS) | PASS | PASS | REAL |
| tenant_member | – | PASS | role change PASS | status change PASS | PASS | PASS | PASS | PASS | REAL |
| meeting | RPC có | PASS | PASS | cancel + notify PASS | PASS | PASS | PASS | PASS | REAL (chưa test tự động) |
| notification | trigger | PASS | mark read PASS | delete PASS | PASS | PASS | – | – | REAL |
| email (nội bộ) | PASS | PASS | state PASS | – | PASS | PASS | – | – | REAL nhưng không phải email thật |
| chat_message | PASS | PASS | – | – | PASS | PASS | – | – | THIN DATA |
| ai_task_execution | chưa có bản ghi | – | – | – | – | – | – | – | UNVERIFIED |
| meeting_summary / transcript | 0 rows | – | – | – | – | – | – | – | UNVERIFIED |
| invoice / subscription | seed | PASS | PASS | – | PASS | PASS | – | – | REAL (không có Stripe live) |

Ghi chú quan trọng: 26/173 case trong bộ tenant-isolation là **fail-closed over-restriction** (documents/email chặn cả chủ sở hữu hợp lệ ở một vài đường đọc), không phải rò rỉ dữ liệu.
