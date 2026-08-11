# UNIWORK — CRUD Reality Report (v1)

Runtime: 37 cells, real actor JWTs, service-role verification.
Kết quả cuối: **33 PASS_REAL / 4 FAIL** (trước khi sửa: 24/37).

## Đã sửa trong đợt này (migration)
| # | Lỗi | Mức | Trạng thái |
|---|---|---|---|
| 1 | `transition_task` sang `done`/`canceled` luôn lỗi (`record_usage` chặn số âm) → không thể hoàn thành công việc | S0 | FIXED |
| 2 | `assign_task` lỗi `ON CONFLICT` (PK là task_id,user_id,role) → giao việc không lưu | S1 | FIXED |
| 3 | `create_task` bỏ qua idempotency key → bấm đúp tạo 2 công việc | S1 | FIXED |
| 4 | `record_usage` đếm trùng khi gửi lại cùng idempotency key | S2 | FIXED |

## Còn tồn đọng (chưa sửa, cần quyết định)
| ID | Vấn đề | Mức | Ghi chú |
|---|---|---|---|
| TASK-U-04 | RLS `tasks_tenant_write` (FOR ALL) cho phép mọi thành viên tenant UPDATE trực tiếp bảng `tasks` qua Data API, bỏ qua `transition_task`, row_version và outbox | S1 | Vi phạm Blueprint §command lifecycle. Sửa = thu hẹp policy còn SELECT + INSERT, nhưng phải chuyển các UI đang direct-write (documents.tsx, workspace.$id.tsx) sang RPC trước |
| TASK-D-01 | Thành viên thường DELETE cứng được task qua Data API (bảng có soft-delete `deleted_at`) | S1 | Cùng nguyên nhân với TASK-U-04 |
| TASK-AU-01 | `create/transition/assign task` chỉ ghi `outbox_events`, không ghi `audit_events` | S2 | Cần chốt hợp đồng audit cho bounded context Task |
| DOC-AU-01 | Tương tự cho Document | S2 | |

## Phát hiện tĩnh (scripts/crud-audit.mjs)
- 236 server functions, 72 routes, **33 orphan** (backend có, UI chưa gọi).
- **3 direct write** từ UI: `src/routes/_authenticated/documents.tsx:201,207`.
- **39 UI toast-only / local-state** (không persist), nổi bật:
  - `workspace.$id.tsx`: tạo task + upload tài liệu chỉ đổi state cục bộ.
  - `workspace.$id.stos.tsx`: xoá milestone chỉ cục bộ.

## Cách chạy lại
```
CRUD_E2E_PASSWORD=... node tests/runtime/crud/run-all-crud.mjs
```
Artifacts: `tests/runtime/crud/artifacts/crud-summary.json|md`, `crud-failures.json`.

## Lưu ý
Teardown còn 4 orphan id (tenant/user fixtures) mỗi lần chạy — cần bổ sung cascade purge qua `_test_purge_tenant`.
