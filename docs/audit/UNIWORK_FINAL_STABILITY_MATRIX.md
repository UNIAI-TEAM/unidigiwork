# UNIWORK — FINAL STABILITY MATRIX

| Domain | Capability | UI | Backend | Persistence | Multi-user | RLS | Realtime | Error | Perf | Status | Ưu tiên |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Auth | Đăng nhập/phiên | ✔ | ✔ | ✔ | ✔ | ✔ | – | ✔ | – | PASS_REAL | – |
| Tenant | Onboarding + guard | ✔ | ✔ | ✔ | ✔ | ✔ | – | ✔ | – | PASS_REAL | – |
| Tenant | Cách ly A/B | ✔ | ✔ | ✔ | ✔ | ✔ | – | ✔ | – | PASS_REAL | – |
| Tasks | Tạo từ UI | ✘ | ✘ | ✘ | – | – | – | ✘ | – | DEAD_CONTROL | P1 |
| Tasks | Tạo qua RPC | – | ✔ | ✔ | – | ✔ | – | ✔ | – | PASS_REAL | – |
| Documents | Tạo/lưu | ✔ | ? | ✘ | – | ✔ | – | ✘ | – | NO_OP | P1 |
| Documents | Danh sách thành viên | ✔ | ✘ | – | – | – | – | ✘ | – | BROKEN | P2 |
| Meetings | Quản lý lịch họp | ✔ | ✔ | ? | – | ✔ | ✔ | ✔ | – | PARTIAL | P1 |
| Meetings | KPI dashboard | ✔ | ✘ | – | – | – | – | – | – | MOCKED | P1 |
| Meetings | LiveKit runtime | ✔ | ? | – | – | – | – | – | – | BLOCKED | – |
| Email | Hộp thư nội bộ | ✔ | ✔ | ? | ✔ | ✔ | – | ✔ | – | PARTIAL | P1 |
| Email | Gửi ra ngoài (SMTP) | ✔ | ✘ | – | – | – | – | – | – | NOT_IMPLEMENTED | P1 |
| Search | search_universal | ✔ | ✔ | – | ✔ | ✔ | – | ✔ | – | PASS_UI | P2 |
| Copilot | Hỏi/đáp | ✔ | ✔ | ? | – | ✔ | – | ✔ | – | PASS_UI | P2 |
| Notifications | Danh sách/đọc | ✔ | ✔ | ? | – | ✔ | ✔ | ✔ | – | PASS_UI | P2 |
| Workspace | CRUD | ✔ | ✔ | ? | – | ✔ | – | ✔ | – | PASS_UI | P2 |
| Billing | Gói/thanh toán | ✔ | ✔ | ✔ | – | ✔ | – | ✔ | – | PARTIAL | P2 |
| Admin | Console | ✔ | ✔ | – | – | ✔ | – | ✔ | – | FAIL_CLOSED_SAFE | P2 |
| Workflow | Builder/trigger | ✔ | ? | ? | – | ✔ | – | ✔ | – | UNVERIFIED | P2 |
| AI Workforce | Tuyển & giao việc | ✔ | ? | ✘ (0 row) | – | ✔ | – | ✔ | – | UNVERIFIED | P2 |
| PWA | Cài đặt/mobile | ✔ | – | – | – | – | – | – | – | PASS_UI | P2 |
| Toàn app | Hiệu năng | – | – | – | – | – | – | – | ✘ | BLOCKED | P1 |
