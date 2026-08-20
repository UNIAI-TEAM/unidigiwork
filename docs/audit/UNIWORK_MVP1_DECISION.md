# UNIWORK — MVP1 Decision

**Phán quyết: NOT READY cho MVP1 thương mại. READY cho MVP1 nội bộ / pilot có kiểm soát.**

Lý do (chỉ dựa trên bằng chứng runtime):
1. Nền tảng công việc là thật: 37/37 CRUD PASS_REAL, audit + outbox chịu tải đa worker (7×25/25).
2. Nhưng ba mắt xích bán hàng chưa chạy: AI thực thi công việc (0 lượt), trí tuệ cuộc họp (0 bản ghi), thanh toán (thiếu khóa Stripe).
3. Email hiện là email nội bộ trong hệ thống, không gửi ra ngoài — cần nói rõ với khách hàng hoặc nối nhà cung cấp thật.

Điều kiện tối thiểu để chuyển sang READY:
- 1 vòng AI Task Execution đầu-cuối có deliverable + evidence + human accept, ghi nhận trong DB.
- 1 cuộc họp có transcript và summary thật.
- Thanh toán bật được và tạo 1 hóa đơn thật.
- Đóng 26 case fail-closed và bỏ nút chết ở /reports, /people.

Artifacts: `docs/audit/UNIWORK_FEATURE_INVENTORY.md`, `UNIWORK_CRUD_REALITY_MATRIX.md`, `UNIWORK_GAP_REGISTER.md`, `UNIWORK_SELL_WORK_READINESS.md`, `tests/runtime/*/artifacts/`.
