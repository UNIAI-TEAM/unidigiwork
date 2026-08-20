# UNIWORK — Sell Work Readiness

Câu hỏi: nền tảng đã đủ để **bán công việc do AI thực hiện** chưa?

| Điều kiện bắt buộc | Trạng thái | Bằng chứng |
|---|---|---|
| Có đơn vị công việc chuẩn hóa (task + deliverable) | ĐẠT một phần | tasks REAL; deliverable schema có nhưng `ai_task_executions` = 0 |
| AI thực thi được và trả kết quả + evidence | CHƯA ĐẠT | 0 lượt execution |
| Human review / accept / request changes | CHƯA CHỨNG MINH | RPC có, chưa có lượt chạy |
| Đo lường chất lượng (KPI, tỉ lệ duyệt) | ĐẠT một phần | `ai_agent_performance` 5 dòng, chưa gắn với execution thật |
| Định giá & thu tiền | CHƯA ĐẠT | thiếu `STRIPE_SECRET_KEY` |
| Hạn mức / entitlement theo gói | ĐẠT | entitlements 1377, quota checks 159 |
| Audit + outbox cho mọi lệnh quan trọng | ĐẠT | SEC.6 7×25/25 PASS |
| Cách ly dữ liệu khách hàng | ĐẠT (fail-closed) | 147/173 PASS, 26 over-restriction |

**Kết luận: CHƯA sẵn sàng Sell Work.** Nền móng (tenant, task, document, audit, outbox, quota) ở mức production-ready; nhưng vòng đời "AI nhận việc → giao kết quả → người duyệt → tính tiền" chưa chạy đầu-cuối lần nào.

Đường tới sẵn sàng: G1 → G2 → G3 (theo thứ tự), sau đó chạy lại bộ runtime để có bằng chứng.
