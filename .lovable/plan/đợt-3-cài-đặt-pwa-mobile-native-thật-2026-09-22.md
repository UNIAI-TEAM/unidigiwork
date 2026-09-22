# Đợt 3 — Cài đặt PWA mobile-native thật

## Mục tiêu

Tách `/m/settings` khỏi trang Cài đặt web dùng chung. Toàn bộ danh sách và màn chi tiết chạy trong shell PWA, dùng dữ liệu tài khoản/tổ chức thật và không còn nội dung mẫu.

## Phạm vi triển khai

1. **Màn Cài đặt độc lập cho PWA**
   - Tạo giao diện mobile-native riêng cho `/m/settings` và từng mục qua `?tab=`.
   - Giữ thanh đầu PWA, tiêu đề dính, nút quay lại, safe-area và vùng chạm tối thiểu 44px.
   - Không render lại `SettingsPage`, `AppSidebar`, `AppTopbar` hoặc bố cục desktop.

2. **Dữ liệu và thao tác thật**
   - Hồ sơ/Tài khoản: đọc danh tính đang đăng nhập và tổ chức hiện tại; bỏ tên, email, chức danh và số điện thoại mẫu.
   - Mật khẩu: giữ luồng xác minh mật khẩu hiện tại và cập nhật mật khẩu thật.
   - Thông báo: dùng tùy chọn in-app/email và thiết bị push đang lưu thật.
   - Giao diện: nối trực tiếp theme, độ tương phản, cỡ chữ và kiểu chữ đang đồng bộ đa thiết bị.
   - Ngôn ngữ: nối bộ ngôn ngữ thật đang hỗ trợ; không dựng lựa chọn giả.
   - Thành viên: hiển thị thành viên của tenant hiện tại theo quyền thật; quản trị sâu dẫn tới màn quản trị mobile phù hợp khi có.
   - Gói & thanh toán: đọc subscription, entitlement và hóa đơn thật; không hard-code tên gói, giá hoặc ngày gia hạn.
   - Tích hợp, bảo mật và dữ liệu: chỉ hiện capability/trạng thái có nguồn thật; bỏ danh sách kết nối, phiên đăng nhập và sao lưu giả.

3. **Chuẩn hóa giao diện**
   - Dùng các control hệ thống cho nút, input, switch và select; không dùng nút HTML tự style ở màn mobile mới.
   - Dùng semantic tokens, hỗ trợ sáng/tối, nội dung Việt/Anh và trạng thái loading/error/empty.
   - Các nhóm cài đặt là danh sách phẳng, không lồng card trang web.

4. **Tương thích và kiểm tra**
   - Giữ nguyên `/settings` desktop và toàn bộ API/quyền hiện tại.
   - Giữ deep link `/m/settings?tab=...` cho 11 mục hiện có.
   - Kiểm tra tài khoản thật ở 390px, 440px và 820px: mở từng mục, đổi giao diện/ngôn ngữ/thông báo, không tràn ngang và không lỗi trình duyệt.
