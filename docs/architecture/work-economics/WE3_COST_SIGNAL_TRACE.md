# WE-3 · Vết tín hiệu CHI PHÍ (trước khi định giá)

Nguyên tắc: **không có tín hiệu ≠ 0**. Mọi số đo thiếu được đánh dấu và hạ
`completeness` xuống `PARTIAL`, không bao giờ điền 0 để bảng số "đẹp".

## 1. Tín hiệu chi phí máy (AI)

| Tín hiệu | Nguồn | Phân loại | Ghi chú |
|---|---|---|---|
| `input_tokens` / `output_tokens` | `work_execution_metrics` (WE-1) | REAL / PARTIAL | PARTIAL khi thiếu phần evaluator |
| `generator_model`, `evaluator_model` | `work_execution_metrics` | REAL | Khoá tra bảng giá |
| `model_calls` | `work_execution_metrics` | REAL | Dùng cho phí theo lượt gọi |
| Đơn giá token | `ai_model_cost_rates` (có `rate_version`, `effective_from`) | REAL khi có bản ghi | Thiếu bảng giá ⇒ `MISSING_MODEL_RATE` |

## 2. Tín hiệu chi phí người

| Tín hiệu | Nguồn | Phân loại | Ghi chú |
|---|---|---|---|
| `human_confirmations`, `human_review_events` | `work_execution_metrics` | REAL | Số lần can thiệp |
| Thời gian duyệt thực tế | — | MISSING | Chưa đo; dùng định mức phút/lần trong `human_cost_policies` |
| Đơn giá lao động nội bộ | `human_cost_policies` | REAL khi có chính sách | Thiếu ⇒ `MISSING_HUMAN_POLICY` |

## 3. Tín hiệu kết quả (mẫu số của đơn vị kinh tế)

| Tín hiệu | Nguồn | Phân loại |
|---|---|---|
| `revision_count` | `work_execution_metrics` | REAL |
| `quality_passed`, `quality_score` | WE-3 Quality Engine | REAL |
| `outcome_accepted`, `outcome_verified` | `ai_task_executions` | REAL |
| Doanh thu thực thu | — | MISSING (chưa có thanh toán) |

## 4. Nơi lưu và cách tính

- `work_execution_costs`: ảnh chụp chi phí từng lượt chạy, tính lại bằng RPC
  `recompute_work_execution_cost` (idempotent, chạy trong database).
- Client **không bao giờ** gửi chi phí/token lên; chỉ admin được ghi bảng giá.
- Pipeline tính lại theo sản phẩm công việc: remeter WE-1 → tính chi phí WE-3.

## 5. Ràng buộc kiến trúc đã áp dụng

- File `src/lib/api/work-pricing.functions.ts` giữ đúng dạng **vỏ mỏng**: chỉ
  import, kiểu đã bị xoá lúc biên dịch và khai báo server function. Mọi schema
  dùng chung (`CURRENCY_SCHEMA`, `PRICING_MODEL_SCHEMA`) và hàm thuần nằm ở
  `src/domain/work-economics/pricing.ts`. Đặt hằng số cấp module trong file
  server function sẽ bị lớp tách bỏ đi và gây lỗi nạp module lúc chạy.
- Không có sự kiện thanh toán, hoá đơn hay trừ credit ở lớp WE-3.
