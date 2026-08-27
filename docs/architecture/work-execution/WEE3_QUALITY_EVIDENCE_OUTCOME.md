# WEE-3 — Quality, Evidence & Outcome Engine

Lớp chất lượng đặt trên WEE-1 (orchestrator) và WEE-2 (governance). Nguyên tắc:
**máy chủ là nguồn sự thật về chất lượng; AI không tự tuyên bố mình đạt.**

## 1. Điểm nối vào pipeline

```
CONTEXT → PLAN → GENERATE → ACTION → VALIDATE(WEE-3) → REVIEW
```

Bước `VALIDATE` không còn gọi "bộ tự chấm" của chính model. Nó chạy:

1. Kiểm tất định: bản bàn giao rỗng, thiếu mục theo outline, trích dẫn bịa,
   nguồn ngoài tenant.
2. Kiểm chứng hành động: mọi đề xuất đã xác nhận phải trỏ tới object có thật
   trong database (cùng tenant) thì mới được tính là outcome.
3. Evaluator riêng: một lượt gọi model độc lập với prompt kiểm định, chấm từng
   tiêu chí nghiệm thu và tính nhất quán nội tại.
4. Tổng hợp điểm **ở máy chủ** theo trọng số có version
   (`wee3.quality.v1`), rồi áp **hard gate**.
5. Lưu `quality_*` + `evidence_pack` qua RPC `persist_work_quality`.

## 2. Trạng thái bước phản ánh cơ chế, không phản ánh chất lượng

| Tình huống | Trạng thái bước VALIDATE |
|---|---|
| Chấm xong, điểm đạt | SUCCEEDED |
| Chấm xong, điểm **chưa đạt** | SUCCEEDED (kết luận nằm ở `quality_status`) |
| Evaluator lỗi / payload sai / lưu thất bại | FAILED — **không có** kết luận chất lượng |

Không bao giờ suy ra "đạt" từ việc cơ chế chấm hỏng (fail-closed).

## 3. Hard gate (ghi đè mọi điểm số)

`FABRICATED_CITATION`, `FOREIGN_TENANT_EVIDENCE`, `REQUIRED_CRITERION_MISSING`,
`CLAIMED_ACTION_NOT_EXECUTED`, `CRITICAL_CONTRADICTION`, `EMPTY_DELIVERABLE`.

## 4. Deliverable ≠ Outcome

- **Deliverable**: nội dung AI soạn ra.
- **Outcome**: kết quả nghiệp vụ đã được kiểm chứng (object thật tồn tại) hoặc
  được con người nghiệm thu. Chỉ con người chuyển outcome sang `ACCEPTED`.

## 5. Giới hạn trung thực

Evaluator là lượt gọi riêng với prompt riêng, nhưng **dùng chung hạ tầng
provider** với generator — đây không phải độc lập tuyệt đối; ghi rõ trong
`assessment.evaluator.independenceNote` và hiển thị cho người duyệt.

## 6. Bất biến giữ nguyên từ WEE-1/WEE-2

- Không mở đường ghi dữ liệu nghiệp vụ mới; bước ACTION vẫn chỉ tạo `PROPOSED`.
- `ai-tasks.server.ts` và `work-quality.server.ts` không dùng service role.
- Mọi mutation vòng đời vẫn đi qua RPC `SECURITY DEFINER`.
- Revision đã đóng là bất biến: `persist_work_quality` chặn ghi đè lịch sử.
