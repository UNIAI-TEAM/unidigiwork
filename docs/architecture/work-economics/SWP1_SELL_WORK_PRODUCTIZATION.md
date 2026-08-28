# SWP-1 — Sell Work Productization & Runtime Cohort Proof

Trạng thái: triển khai (adapter mỏng quanh WEE-1/2/3 và WE-1/2/3 — không thêm framework mới).

## 1. Ba sản phẩm công việc chủ lực

| Mã | Sản phẩm | Mức trưởng thành | Mẫu bàn giao |
|---|---|---|---|
| `WPI_V1` | Thông tin dự án hằng tuần | UNDERSTAND (read-only) | `WPI_WEEKLY_INTELLIGENCE` |
| `MTE_V1` | Chuyển cuộc họp thành công việc | TRANSFORM (đề xuất hành động) | `MTE_EXECUTION_PACKAGE` |
| `PRV_V1` | Phục hồi dự án | ACT (đề xuất, siết chặt) | `PRV_RECOVERY_PLAN` |

Mỗi sản phẩm là một hợp đồng có phiên bản trong `work_units` (input schema, ngữ cảnh
cho phép, hành động cho phép, ngưỡng chất lượng, SLA, chính sách duyệt). Hợp đồng đã
dùng cho lượt chạy được nghiệm thu là **bất biến**.

Hành vi riêng của sản phẩm nằm ở `DeliverableTemplate.productInstructions`
(`src/domain/ai-tasks/contracts.ts`) và chỉ **siết thêm** prompt hệ thống của WEE-1;
mọi ràng buộc an toàn toàn cục (chỉ đọc, trích dẫn bắt buộc, chống prompt injection,
không tự thực thi) giữ nguyên.

## 2. Đầu vào do sản phẩm khai báo

`runAiTask` nhận thêm `inputs` (vd. `meeting_id` cho `MTE_V1`). Đầu vào này **không**
cấp quyền: preflight WE-2 kiểm tra từng thực thể theo RLS của actor và phạm vi
tổ chức/không gian làm việc; sai ⇒ `UNAUTHORIZED_INPUT`. Giá trị từ hệ thống
(`project_id`, `meeting_id` của công việc) luôn ghi đè giá trị do client gửi.

## 3. Mô hình cohort

RPC `compute_work_product_cohort(_code, _version, _from, _to, _tenant_id, _include_synthetic)`
là **nguồn sự thật duy nhất** cho chỉ số cohort. UI không tự tính.

- Phạm vi: thành viên tổ chức → cohort của tổ chức đó; platform admin → toàn nền tảng.
- `cohort_class` (`REAL` / `SYNTHETIC` / `TEST`) loại dữ liệu không thật khỏi bằng chứng.
- Ngưỡng cỡ mẫu: `EARLY` ≥ 5, `PROVISIONAL` ≥ 20, `PROVEN` ≥ 50.
- Thiếu dữ liệu hiển thị là "Không đủ dữ liệu", tuyệt đối không làm tròn thành 0.
- Phân loại thất bại tất định theo mã lỗi (`classifyFailure`), không dùng văn bản tự do.

## 4. Bề mặt

| Đường dẫn | Mục đích |
|---|---|
| `/work-catalog` | Danh mục hợp đồng sản phẩm công việc |
| `/work-products/$code` | Hợp đồng + cohort + lượt chạy + khởi chạy |
| `/admin/cohorts` | Bảng điều khiển cohort (nội bộ) |
| `/admin/proof` | Bằng chứng — chỉ dữ liệu thật, kèm giới hạn tuyên bố |

## 5. Bất biến

1. AI không tự thực thi thay đổi nghiệp vụ; mọi hành động chờ người xác nhận.
2. Không có đường ghi chỉ số cohort từ client.
3. Tín hiệu tự báo cáo (`work_execution_feedback`) không bao giờ trộn vào chỉ số hệ thống.
4. Cỡ mẫu quyết định tuyên bố được phép công bố, không phải ngược lại.
