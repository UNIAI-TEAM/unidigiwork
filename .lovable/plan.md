# Email Hub — nâng lên chuẩn hộp thư doanh nghiệp

## Hiện trạng (~40%)

Đang chạy thật: hộp thư/đã gửi/nháp/lưu trữ/thùng rác, gắn sao, soạn — gửi — trả lời, đánh dấu đã đọc, chuyển thư mục, đếm thư, thống kê, thông báo, bản mobile.

Chỉ là vỏ giao diện, chưa có dữ liệu thật:
- Nhãn (labels) — danh sách luôn rỗng, tạo nhãn không lưu
- Quy tắc tự động (rules) — bảng điều khiển không chạy
- Tệp đính kèm — có chỗ hiển thị nhưng không tải lên/tải xuống được
- Bộ lọc nâng cao — lọc trên trang, không lọc trên máy chủ
- Chữ ký, soạn lại nhiều cửa sổ, chuyển tiếp thật: chưa có

Giới hạn lớn: chỉ gửi được cho người đã có tài khoản UNIWORK. Địa chỉ ngoài bị từ chối.

## Sẽ làm

### 1. Tệp đính kèm thật
Kho lưu trữ riêng cho email, tải lên khi soạn, hiển thị trong thư, tải xuống có kiểm tra quyền. Giới hạn 25MB/thư.

### 2. Nhãn và quy tắc thật
- Nhãn theo tổ chức: tạo/sửa/xoá/đổi màu, gắn nhiều nhãn cho một thư, lọc theo nhãn.
- Quy tắc tự động: điều kiện (người gửi, tiêu đề chứa, có đính kèm) → hành động (gắn nhãn, chuyển thư mục, đánh dấu đã đọc), chạy ngay khi thư đến.

### 3. Tìm kiếm và lọc trên máy chủ
Tìm theo người gửi/người nhận/tiêu đề/nội dung, khoảng thời gian, chưa đọc, có đính kèm, nhãn — chạy trên máy chủ nên đúng cả khi có nhiều nghìn thư.

### 4. Chữ ký và soạn thư đầy đủ
Chữ ký cá nhân tự chèn, trả lời tất cả, chuyển tiếp kèm nội dung gốc và đính kèm.

### 5. Tab riêng cho hộp thư ngoài (khung sẵn)
Theo lựa chọn của anh: giữ hộp thư nội bộ nguyên vẹn, thêm tab riêng cho tài khoản email bên ngoài. Đợt này chỉ dựng khung tab + màn hình "Chưa kết nối"; phần đồng bộ thư thật với nhà cung cấp làm ở đợt sau.

## Chi tiết kỹ thuật

- Migration mới: `email_labels`, `email_message_labels`, `email_rules`, `email_attachments`, `email_signatures` — đều có `tenant_id`, `row_version`, audit columns, RLS tenant-scoped + GRANT theo chuẩn dự án.
- Ghi dữ liệu qua RPC SECURITY DEFINER (`apply_email_labels`, `upsert_email_rule`, `run_email_rules_for_message`), server function trong `src/lib/api/emails.functions.ts` gọi RPC — không ghi trực tiếp từ component.
- Tìm kiếm: RPC `search_email_messages` (tenant boundary cứng, phân trang), thay bộ lọc phía trình duyệt hiện tại.
- Đính kèm: bucket riêng, chỉ lưu provider/bucket/object_key, URL ký ngắn hạn khi tải xuống.
- Quy tắc chạy trong cùng transaction với `sendEmail`/fan-out inbox, idempotent theo `message_id`.
- Giao diện: nối `LabelsRulesDialog`, `AdvancedFilterDialog`, `ComposeEmailDialog` vào backend thật; mobile `/m/email` dùng chung API.
- Chuỗi hiển thị qua i18n VI/EN, hit area ≥44px, kiểm tra 390/440/820/1280px.
