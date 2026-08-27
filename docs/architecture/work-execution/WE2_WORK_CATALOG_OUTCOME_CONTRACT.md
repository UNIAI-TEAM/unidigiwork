# WE-2 — Work Catalog & Outcome Contract

Nâng `public.work_units` từ **metadata danh mục** thành **hợp đồng sản phẩm công việc có phiên bản**.
Không tạo catalog thứ hai. Không đụng tới định giá/thanh toán.

## 1. Hợp đồng gồm những gì

| Phần | Cột | Ý nghĩa |
|---|---|---|
| Inputs | `input_contract` | Trường bắt buộc/tuỳ chọn, kiểu, thực thể tham chiếu |
| Context | `context_contract` | Loại thực thể được phép nạp, trần số nguồn |
| Executor | `executor_contract` | Vai trò / kỹ năng nhân sự AI đủ điều kiện |
| Actions | `action_contract` | Hành động ghi được phép + trần tự chủ |
| Deliverable | `deliverable_contract` | Loại và mục bắt buộc của bản bàn giao |
| Acceptance | `acceptance_contract` | Tiêu chí nghiệm thu bắt buộc |
| Quality | `quality_contract` | Ngưỡng điểm tối thiểu + chiều bắt buộc |
| Review | `review_contract` | Chính sách duyệt của con người |
| SLA | `sla_contract`, `sla_machine_ms` | Thời gian máy/thực tế mục tiêu |
| Outcome | `expected_outcome_type` | Kết quả nghiệp vụ được coi là thành công |

Khoá chính `(code, version)`. `contract_hash` là dấu vân tay md5 của payload chuẩn hoá,
sinh bởi trigger `work_units_stamp`.

## 2. Bất biến

1. **Hợp đồng luôn đọc từ database.** Client chỉ gửi INPUT; không gửi tiêu chí, ngưỡng, SLA hay hợp đồng.
2. **Phiên bản đã dùng cho lượt chạy được nghiệm thu là bất biến** — trigger `work_units_guard_immutability`
   chỉ cho đổi `status`.
3. **Bản chụp bất biến**: `bind_work_product_execution` ghi `work_unit_code/version/contract_hash/contract_snapshot`
   vào `ai_task_executions` đúng một lần cho mỗi lượt chạy.
4. **Hợp đồng chỉ SIẾT, không NỚI**: tiêu chí bắt buộc được cộng thêm vào tiêu chí nghiệm thu;
   hành động ghi bị chặn nếu không nằm trong `allowedActions`; ngưỡng chất lượng lấy
   `greatest(75, minimumQualityScore)` trong `persist_work_quality` — sàn hệ thống không thể bị hạ.

## 3. Preflight (chặn trước khi tiêu tốn model)

`validateWorkProductExecution` (`src/lib/api/work-products.server.ts`) chạy trước
`start_ai_task_execution` trong `runAiTask`:

- trạng thái sản phẩm phải `ACTIVE`, phiên bản hợp lệ;
- đầu vào đúng kiểu và đủ trường bắt buộc;
- **uỷ quyền đầu vào đọc bằng RLS của chính actor** — không thấy hàng = `UNAUTHORIZED_INPUT`,
  khác tenant/workspace cũng bị chặn;
- nhân sự AI phải ACTIVE, cùng tenant, đúng vai trò và đủ kỹ năng, nếu không: `NO_ELIGIBLE_EXECUTOR`.

Thất bại → `ApiError WORK_PRODUCT_PREFLIGHT_FAILED`, không mở lượt chạy, không gọi model.

## 4. Runtime

```
runAiTask
  ├─ loadWorkProductByTemplate(template_code)      ← hợp đồng ACTIVE
  ├─ validateWorkProductExecution(...)             ← preflight, fail closed
  ├─ start_ai_task_execution
  ├─ bind_work_product_execution                   ← bản chụp bất biến
  └─ orchestrateWorkExecution({ contract })
       CONTEXT/PLAN/GENERATE  (như WEE-1)
       ACTION    → bỏ qua nếu hợp đồng cấm hành động ghi
       VALIDATE  → WEE-3 chấm, DB áp ngưỡng theo hợp đồng
       REVIEW    → luôn WAITING_REVIEW
```

## 5. Số liệu

`recompute_work_execution_metrics` (WE-1) ưu tiên bản chụp trên lượt chạy thay vì tra template.
`work_product_summary` gom số liệu theo `(work_unit_code, work_unit_version)`.

## 6. Giao diện

`/work-catalog` — danh mục hợp đồng: trạng thái, phiên bản, `contract_hash`, đầu vào, ngữ cảnh,
nhân sự đủ điều kiện, hành động được phép, tiêu chí bắt buộc, ngưỡng chất lượng, chính sách duyệt, SLA, outcome.

## 7. Không thuộc phạm vi

Định giá, hoá đơn, gói cước. WE-2 chỉ định nghĩa **sản phẩm công việc và cam kết kết quả**.
