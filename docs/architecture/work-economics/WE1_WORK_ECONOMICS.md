# WE-1 — Work Economics & Sell Work Metering

Lớp **quan sát kinh tế** đặt trên WEE-1 (orchestrator), WEE-2 (governance) và
WEE-3 (chất lượng). Nguyên tắc: **chỉ đo cái đã xảy ra thật; tín hiệu thiếu được
nói rõ, không ước lượng, không quy đổi tiền tệ khi chưa có bảng giá thật.**

## 1. Đơn vị công việc bán được (Work Unit)

`public.work_units` — catalog toàn hệ thống, ánh xạ từ template bàn giao:

| Code | Template | Kết quả kỳ vọng | Ngưỡng thời gian máy |
|---|---|---|---|
| WEEKLY_PROJECT_INTELLIGENCE | SUMMARY_REPORT | REPORT_ACCEPTED | 180s |
| PROJECT_RISK_ANALYSIS | ANALYSIS_REPORT | PROJECT_RISK_IDENTIFIED | 240s |
| MEETING_TO_EXECUTION | MEETING_FOLLOW_UP | FOLLOW_UP_PREPARED | 180s |
| RESEARCH_BRIEF | RESEARCH_BRIEF | REPORT_ACCEPTED | 240s |

Template chưa ánh xạ ⇒ `work_unit_code = UNRESOLVED` và tín hiệu thiếu `WORK_UNIT`.

## 2. Bảng số đo

`public.work_execution_metrics` — một dòng cho mỗi lượt chạy (`execution_id` UNIQUE):

- **Thời gian máy** (`machine_duration_ms`): `completed_at − started_at`.
- **Thời gian thực tế** (`wall_duration_ms`): `COALESCE(reviewed_at, completed_at) − created_at`.
- **Chờ xếp hàng** (`queue_wait_ms`): `started_at − created_at`.
- **Mô hình**: `model_calls` = generator + evaluator; token cộng cả hai, kèm
  `token_source` = REAL | PARTIAL | MISSING.
- **Bước**: tổng / lỗi / chờ xác nhận từ `work_execution_steps`.
- **Con người can thiệp**: `human_confirmations` (đề xuất được xác nhận) +
  `human_review_events` (lượt được duyệt) + `revision_count`.
- **Chất lượng & kết quả**: sao chép từ WEE-3 (`quality_*`, `outcome`).
- **Trung thực**: `missing_signals[]` + `completeness` = COMPLETE | PARTIAL.

## 3. Ai được ghi

Không có policy INSERT/UPDATE. Chỉ RPC `recompute_work_execution_metrics(_execution_id)`
(SECURITY DEFINER, tự kiểm tra `is_tenant_member`) được ghi, và nó **tính lại toàn bộ
từ dữ liệu đã ghi** — client không gửi số nào lên, nên không thể bơm số đẹp.
Hàm idempotent: gọi lại luôn cho cùng kết quả.

## 4. Điểm nối vòng đời

`meterWorkExecution()` được gọi sau mỗi mốc: kết thúc lượt chạy (thành công/thất bại),
tiếp tục sau xác nhận hành động, yêu cầu chỉnh sửa, nghiệm thu. Metering lỗi
**không** làm hỏng lượt chạy (best-effort, trả `null`).

## 5. Tổng hợp

`work_economics_summary(_tenant_id, _workspace_id, _from, _to)` trả số lượt chạy,
lượt đủ tín hiệu, lượt nghiệm thu, outcome kiểm chứng, can thiệp của con người,
token, p50/p95 thời gian máy, và tỉ lệ đạt ngưỡng.

## 6. Giới hạn trung thực

- Chưa có **chi phí tiền tệ**: không có bảng giá token thật ⇒ WE-1 không quy đổi.
- Chưa đếm được **số lần retry bước**: `record_work_execution_step` upsert theo `seq`.
- `wall_duration_ms` phụ thuộc thời điểm con người duyệt, nên phản ánh cả độ trễ
  tổ chức chứ không riêng hiệu năng AI.

## 7. Bất biến giữ nguyên

Không mở đường ghi dữ liệu nghiệp vụ mới; không dùng service role; không đổi hành vi
pipeline; mọi truy vấn đọc chạy dưới RLS theo tenant.
