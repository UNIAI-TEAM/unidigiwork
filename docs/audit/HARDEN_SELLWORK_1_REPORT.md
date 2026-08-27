# HARDEN-SELLWORK-1 — Security, Contract Integrity & Economics Correctness

Phạm vi: siết an toàn lớp Sell Work (WEE-1/2/3 và WE-1/2/3) trước khi thương mại hoá.
Nguyên tắc xuyên suốt: **fail closed**, **không suy đoán số liệu**, **mọi chi phí dẫn xuất trong database**.

## 1. Uỷ quyền RPC SECURITY DEFINER

| RPC | Trước | Sau |
| --- | --- | --- |
| `recompute_work_execution_cost` | Không kiểm `auth.uid()`, không kiểm tenant | Bắt buộc phiên đăng nhập + `is_tenant_member`; thu hồi EXECUTE của `anon`/`public` |
| `recompute_work_execution_metrics` | Kiểm tenant một phần | Kiểm đủ; chỉ `authenticated`/`service_role` |
| `record_ai_usage_event` | Chưa tồn tại theo lượt gọi | Mới; chỉ ghi được cho lượt chạy thuộc tenant của caller |
| `reconcile_work_execution_steps` | Không kiểm quyền | Bắt buộc thành viên tenant |
| `bind_work_product_execution` | Ghi im lặng | Trả trạng thái `bound/reason` để caller đóng cổng |

Guard tự động: `tests/integration/12_harden_sellwork1_guards.sql` (mục 1 và 2).

## 2. Work Graph — schema drift

`meetings` dùng cột chuẩn `start_at`. Hai adapter đang chọn `starts_at` (trả rỗng âm thầm):

- `src/lib/api/work-graph.server.ts` — đã sửa.
- `src/lib/api/work-graph.functions.ts` — đã sửa.

Guard schema chống tái phát: mục 4 trong file SQL trên.

## 3. Work Product contract binding — fail closed

Trước: lỗi gắn bản chụp hợp đồng bị nuốt (`catch {}`), lượt chạy vẫn gọi AI → sinh ra kết quả **không có hợp đồng ràng buộc**.

Sau (`work-products.server.ts` + `ai-tasks.functions.ts`):

- `bindWorkProductExecution` ném lỗi khi RPC lỗi hoặc không gắn được.
- `ALREADY_BOUND` chỉ hợp lệ khi trùng đúng `code` + `version`; lệch phiên bản → `WORK_PRODUCT_CONTRACT_MISMATCH`.
- Khi thất bại: lượt chạy được đóng `FAILED` với mã lỗi tương ứng **trước** mọi lời gọi AI Gateway.
- Công việc AI cũ (không có hợp đồng) giữ đường chạy tương thích, không bị chặn.

## 4. Chi phí AI theo từng lượt gọi model

- `ai_usage_events` bổ sung `execution_id`, `purpose` (GENERATOR / EVALUATOR / PLANNER / OTHER), `provider`.
- `src/domain/work-economics/model-identity.ts` là **nơi duy nhất** tách `provider/model`; khớp với `split_ai_model_identity` phía SQL.
- `src/lib/api/ai-usage.server.ts` ghi telemetry vật lý (token, thời lượng). Không nhận chi phí từ client.
- `recompute_work_execution_cost` cộng chi phí theo từng lượt gọi, tra bảng giá theo `rate_version`/`rate_effective_at` tại thời điểm gọi → chi phí lịch sử tái tạo được.

## 5. Đúng đắn đa tiền tệ

Cohort trộn nhiều đơn vị tiền tệ không bao giờ được cộng gộp:

- `known_cost` = `NULL`, thành phần `CURRENCY_MISMATCH`, `completeness = INSUFFICIENT`, nhãn tiền tệ `MIXED`.
- Không quy đổi ngầm theo tỉ giá — quy đổi là quyết định thương mại, không phải suy diễn kỹ thuật.

## 6. Độ bền nhật ký bước

`recordStep` không còn nuốt lỗi: mỗi lần ghi hụt được log có cấu trúc và đếm; kết thúc pipeline gọi `reconcile_work_execution_steps` để đánh dấu bằng chứng **PARTIAL**. Không bịa ra bước không chứng minh được.

## 7. Regression

| Bộ | Kết quả |
| --- | --- |
| `src/domain/work-economics/*.test.ts` (26 test) | XANH |
| `src/domain` + `src/lib/architecture` (146 test) | 145 xanh · 1 đỏ |
| `tests/integration/11_we3_economics_guards.sql` | Giữ nguyên |
| `tests/integration/12_harden_sellwork1_guards.sql` | Mới |

Test đỏ duy nhất là `domain-sdk-gate` (nợ kiến trúc có sẵn ở `ai-tasks` / `reports-departments` / `workflow-agents`, không liên quan tới đợt siết này và đã tồn tại trước đó).

## 8. Việc còn lại

- Trả nợ `domain-sdk-gate`: chuyển các truy cập `.from("tasks"|"meetings"|"documents")` còn lại sang RPC domain.
- Bổ sung `purpose = PLANNER` khi bước PLAN chuyển sang gọi model riêng.
