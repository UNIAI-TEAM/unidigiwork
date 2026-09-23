# UniWork Chat — Conversation to Work

## Kết quả khảo sát (dùng lại, không tạo hệ thống song song)

Đã có sẵn và sẽ tái sử dụng:

- Trò chuyện nội bộ: phòng chat 1:1, nhóm, phòng theo công việc và phòng chung, thành viên, đã đọc/chưa đọc, ghim tin, trả lời, trợ lý AI trong phòng.
- Công việc: tạo việc thật qua lớp nghiệp vụ hiện có (có hạn mức, nhật ký, thông báo, tự đăng vào phòng chat).
- Quyết định: đã có 4 trạng thái và luồng xác nhận.
- Tri thức: đã có bài viết tri thức theo tổ chức.
- Work Graph: đã có cơ chế nối hai thực thể; sẽ nối theo đúng mô hình này.

Khoảng thiếu:

- **Commitment (cam kết với khách hàng)**: chưa có module riêng. Sẽ lưu dưới dạng công việc có nhãn `commitment` cộng bản ghi cam kết nhẹ trong bảng đề xuất, và báo rõ đây là giải pháp gần nhất.
- **Nội dung nhập từ Zalo/WhatsApp/Telegram/Viber**: chưa có gì.
- **Rút trích công việc từ hội thoại có bằng chứng**: chưa có.

## Sẽ làm

### 1. Nhập nội dung từ bên ngoài (Save to UniWork)

- Nút "Lưu vào UniWork" ở khung soạn tin và menu hội thoại.
- Dán nhiều đoạn tin, tải ảnh/PDF/tệp xuất hội thoại, chọn nguồn (Zalo/WhatsApp/Telegram/Viber/Khác), tên nhóm, người chia sẻ, dự án, mức chia sẻ.
- Màn hình "Xem lại bản nhập": xem trước nội dung, cảnh báo trùng lặp (theo vân tay nội dung), ghi rõ "Do người dùng nhập thủ công", phân biệt tác giả gốc với người nhập.

### 2. Rút trích công việc (Extract work)

- Chạy trên hội thoại nội bộ và trên bản nhập.
- AI trả về danh sách đề xuất: loại (Việc / Quyết định / Cam kết / Tri thức), tiêu đề, mô tả, **trích dẫn bằng chứng**, mức tin cậy, trường còn thiếu.
- Người dùng sửa/bỏ chọn/xác nhận từng mục. Chỉ khi xác nhận mới tạo bản ghi thật. Không tự đoán người nhận hay hạn chót: để trống và bắt buộc người duyệt chọn.
- Mỗi bản ghi tạo ra được nối ngược về hội thoại, tin nhắn/bản nhập và đoạn bằng chứng, đồng thời nối vào Work Graph hiện có.

### 3. Bảng điều khiển hội thoại (panel phải)

Tóm tắt phần chưa đọc, Đã quyết gì, Còn treo gì, Hứa gì với khách, Tạo việc từ hội thoại này. Mọi câu trả lời kèm liên kết về tin nhắn nguồn; kết quả là gợi ý cho tới khi xác nhận.

### 4. Kênh bên ngoài + trang Cài đặt → Tích hợp → Nhắn tin

- Danh sách Zalo OA, WhatsApp Business, Telegram bot, Viber bot kèm **trạng thái năng lực thật**: Nhập thủ công / Nhận tin / Trả lời / Hỗ trợ nhóm.
- Trong đợt này **chỉ bật "Nhập thủ công"** cho cả 4 kênh; phần nhận tin qua webhook có sẵn khung kiến trúc (giao diện adapter, xác thực chữ ký, chống trùng) nhưng chưa bật vì chưa có thông tin đăng nhập của nhà cung cấp.
- Không giả lập kết nối, không dùng cách đọc chat không chính thức.

## Kỹ thuật

Migration mới (tất cả có `tenant_id`, `row_version`, cột kiểm toán, RLS theo tổ chức + quyền thành viên hội thoại, GRANT đầy đủ):

- `external_messaging_connections` — kênh của tổ chức, năng lực đã xác minh, trạng thái; token chỉ nằm trong kho bí mật, không trả về trình duyệt.
- `conversation_imports` — lô nhập: nguồn, tên nhóm, người chia sẻ, người nhập, thời gian gốc, vân tay chống trùng (unique theo tenant + fingerprint).
- `conversation_import_messages` — từng đoạn: tác giả gốc (dạng chữ), thời gian, nội dung, tệp đính kèm.
- `external_identity_map` — ánh xạ danh tính bên ngoài ↔ người dùng UniWork.
- `work_extraction_runs` + `work_extraction_proposals` — đề xuất AI, bằng chứng, độ tin cậy, trạng thái duyệt, khóa idempotency.
- `work_source_citations` — nối bản ghi đã tạo ↔ hội thoại/tin nhắn/lô nhập + đoạn trích.
- RPC `SECURITY DEFINER`: `create_conversation_import`, `record_extraction_proposals`, `approve_extraction_proposal`, `list_conversation_sources`; một writer, idempotent, ghi audit.

Máy chủ: `src/lib/api/conversation-import.functions.ts`, `conversation-extract.functions.ts`, `messaging-connectors.functions.ts` + `messaging-connectors.server.ts` (giao diện adapter: connect/disconnect/capabilities/verify webhook/normalize/health). Webhook công khai `src/routes/api/public/hooks/messaging/$provider.ts` với xác thực chữ ký và chống xử lý lặp — bật khi kênh có thông tin đăng nhập.

AI dùng cổng AI sẵn có của dự án, chạy phía máy chủ, mô hình mặc định, đầu ra có cấu trúc kèm bằng chứng; không bao giờ trộn dữ liệu giữa hai tổ chức.

Giao diện: nâng cấp trang trò chuyện hiện có (cột trái thêm mục Hội thoại bên ngoài + bộ lọc Chưa đọc / Giao cho tôi / Cần duyệt; panel phải Conversation Intelligence), thêm hộp thoại Lưu vào UniWork, màn xem lại bản nhập, màn duyệt đề xuất, trang Cài đặt → Tích hợp → Nhắn tin. Bản di động dùng chung API. Chuỗi Việt/Anh, vùng bấm ≥44px, kiểm tra 390/440/820/1280px.

## Kiểm chứng trước khi báo xong

- Nhập một đoạn hội thoại thật → rút trích → xác nhận 2 việc + 1 quyết định → thấy trong dự án và Work Graph, bấm ngược về nguồn.
- Thử với 2 tổ chức khác nhau và thử truy cập trái quyền (phải bị chặn).
- Gửi lặp cùng một lô nhập/webhook → không tạo bản ghi trùng.
- Báo cáo rõ kênh nào chạy thật, kênh nào mới có khung.
