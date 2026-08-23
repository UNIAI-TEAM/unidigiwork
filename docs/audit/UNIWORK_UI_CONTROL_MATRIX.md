# UNIWORK — UI CONTROL MATRIX (runtime-verified)

Nguồn: `tests/runtime/stability-audit/artifacts/ui-controls.json` (kiểm kê tự động 21 route, actor thật).

| Route | Control | Loại | Kỳ vọng | Thực tế | Backend | Persist | Trạng thái |
|---|---|---|---|---|---|---|---|
| /tasks | Tạo công việc | button (empty state + toolbar) | Mở dialog, tạo task | Không mở dialog, 0 network request | không | không | **DEAD_CONTROL (P1)** |
| /documents | Tạo tài liệu mới | button | Tạo document | Click được, `documents=0` sau thao tác | chưa chứng minh | không | **NO_OP (P1)** |
| /documents | (tự động) tải danh sách thành viên | query | 200 | HTTP 400 `workspace_members?select=...profiles(...)` | có | – | **BROKEN (P2)** |
| /home | Làm mới, Tạo công việc, Xem tất cả | button | điều hướng/refetch | render + điều hướng OK | có | – | PASS_UI |
| /calendar | Tạo sự kiện, Xuất lịch (.ics), bộ lọc | button | mở dialog/xuất file | render OK, chưa chứng minh ghi DB | – | chưa | PASS_UI |
| /meeting | Bắt đầu họp ngay / Lên lịch / Tham gia bằng mã | button | tạo/join meeting thật | UI hoạt động; KPI cạnh nó là số giả | – | chưa | PARTIAL |
| /meeting | KPI "Hôm nay 4 · LIVE 1 · Bản ghi 12 · Tóm tắt AI 38" | metric | số thật | `meetings=0` trong DB | không | – | **MOCKED (P1 thương mại)** |
| /email | LABELS 24/18/15/6/9, ACCOUNTS 128/46, "28.4 GB/100 GB" | metric | số thật | `email_messages=0` | không | – | **MOCKED (P1 thương mại)** |
| /documents | "Storage 342.6 GB of 1 TB (34%)" | metric | dung lượng thật | tĩnh | không | – | **MOCKED** |
| topbar mọi route | "Nguyễn Văn A · Giám đốc Điều hành" | identity | tên user đăng nhập | user thật là stab_a | không | – | **MOCKED (P1)** |
| /tasks | mô tả dự án "…doanh nghiệp STOS" | text | mô tả workspace thật | chuỗi cứng | không | – | **MOCKED (P2)** |
| /search | ô tìm + tab loại | input | search_universal | chạy, 0 kết quả trên dữ liệu rỗng | có | – | PARTIAL |
| /notifications | Đánh dấu tất cả đã đọc, bộ lọc | button | cập nhật trạng thái | empty-state đúng | – | chưa | PASS_UI |
| /workspace | Tạo/Sửa/Xóa/Phân quyền/Mời | button | CRUD workspace | render, tenant thật hiển thị đúng | có | chưa test lại | PASS_UI |
| /people | Nhập/Xuất/Thêm người | button | CSV + invite | hiển thị đúng 1 thành viên thật | có | – | PASS_UI |
| /billing | Hủy gia hạn / đổi gói | button | Stripe | gói Free thật, không có Stripe live | một phần | – | PARTIAL |
| /admin | toàn trang | – | quản trị | tenant_owner bị chặn hoàn toàn | – | – | FAIL_CLOSED_SAFE |
| /ai | mẫu lời nhắc "Sprint 6", "quý 2 2025" | text | ví dụ | nội dung mẫu cứng | – | – | DEMO-INTENTIONAL |
| /knowledge | Quản trị nội dung | link | CRUD bài viết | empty-state đúng | – | – | PASS_UI |
| ⌘J UNI Copilot | gửi câu hỏi | textarea | trả lời có trích dẫn | có phản hồi, chưa chứng minh grounding | có | – | PASS_UI |

Tổng: 3 control P1 (1 DEAD_CONTROL, 1 NO_OP, 1 BROKEN query) + 5 khối dữ liệu mock hiển thị trên route thương mại.
