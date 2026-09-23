# Kết nối hộp thư ngoài (Outlook/Gmail) vào Email Hub

## Mục tiêu
Mỗi người dùng tự đăng nhập tài khoản Outlook hoặc Gmail của họ. UNIWORK đọc thư của họ và hiển thị trong tab riêng của Email Hub, cùng nhãn, quy tắc và chữ ký.

## Việc cần anh làm trước (2 phút)
Em sẽ mở 2 thẻ cấu hình trong lượt làm việc: một cho Outlook, một cho Gmail. Mỗi thẻ cần một "ứng dụng đăng nhập" tạo ở trang quản trị của Microsoft và Google. Nếu anh chưa có, thẻ có hướng dẫn từng bước. Không có bước này thì nút "Kết nối" sẽ báo chưa cấu hình.

## Người dùng sẽ thấy gì
1. Trong thanh bên Email Hub, mục **Tài khoản** có nút "Thêm tài khoản" → chọn Outlook hoặc Gmail → cửa sổ đăng nhập của nhà cung cấp → quay lại và hiện địa chỉ email đã kết nối.
2. Chọn một tài khoản đã kết nối sẽ mở **tab riêng**: danh sách thư thật lấy từ hộp thư đó (hộp thư đến, đã gửi, chưa đọc, có đính kèm), mở xem nội dung, tải đính kèm.
3. Nút **Đồng bộ** kéo thư mới; nhãn/thư mục bên nhà cung cấp được ánh xạ sang nhãn của Email Hub; chữ ký lấy từ tài khoản (Gmail) được lưu thành chữ ký cá nhân dùng khi soạn thư.
4. Quy tắc tự động của Email Hub chạy cho cả thư ngoài mới đồng bộ (gắn nhãn, chuyển thư mục, đánh dấu đã đọc).
5. Nút **Ngắt kết nối** xoá kết nối và thư đã đồng bộ của tài khoản đó.
6. Hộp thư nội bộ giữ nguyên, không trộn lẫn.

## Chi tiết kỹ thuật
- App User Connectors `microsoft_outlook` và `google_mail`; luồng consent qua popup + redirect code, đổi code trong server function, lưu `lovack_*` đã mã hoá trong `app_user_connections` (AES-256-GCM, `APP_USER_CONNECTION_KEY_SECRET`).
- `src/integrations/lovable/appUserConnector.ts` (server-only) theo đúng knowledge file; route `/oauth/email/return`.
- Migration mới: `app_user_connections` (service_role only) và `external_email_accounts`, `external_email_messages` (tenant_id, row_version, audit cols, RLS tenant + owner-scoped, GRANT chuẩn); ghi qua RPC SECURITY DEFINER `upsert_external_email_account`, `ingest_external_email_messages` (idempotent theo `provider_message_id`), `delete_external_email_account`.
- Server functions `src/lib/api/external-email.functions.ts`: `startEmailConnect`, `completeEmailConnect`, `listExternalAccounts`, `syncExternalMailbox`, `getExternalMessage`, `disconnectExternalAccount`. Mọi gọi provider dùng `callAsAppUser` phía máy chủ; không trả token về trình duyệt.
- Scopes: Gmail `gmail.readonly` + userinfo; Outlook `Mail.Read`, `offline_access`, `User.Read`.
- Đồng bộ chạy theo yêu cầu (nút Đồng bộ) + khi mở tab; giới hạn 50 thư/lần, phân trang theo con trỏ lưu trong account row.
- Sau khi ingest, gọi `run_email_rules_for_message` cho thư mới.
- UI: `email.tsx` thêm mục Tài khoản thật + tab tài khoản ngoài; mobile `/m/email` dùng chung API. Chuỗi VI/EN, hit area ≥44px, kiểm tra 390/440/820/1280px.
- Đợt này chỉ **đọc** thư ngoài. Gửi thư từ tài khoản ngoài để đợt sau (cần scope ghi).
