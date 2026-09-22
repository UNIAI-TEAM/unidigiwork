# Làm mới Quản trị PWA mobile-native

## Mục tiêu

Thay màn Quản trị PWA hiện còn sơ sài hoặc rơi về giao diện web bằng một luồng mobile-native hoàn chỉnh. Quản trị viên có thể xem tài khoản, đổi mật khẩu, cấp/thu hồi quyền hệ thống và đổi vai trò trong tổ chức hiện tại ngay trên điện thoại.

## Phạm vi triển khai

### 1. Trung tâm Quản trị
- Làm mới `/m/admin` thành trang quản trị thực với trạng thái quyền, số liệu tổng quan và các mục điều hướng rõ ràng.
- Chỉ hiện thao tác người dùng được phép thực hiện; tài khoản chỉ có quyền đọc sẽ thấy trạng thái chỉ đọc.
- Trạng thái tải, rỗng, lỗi, thử lại và không có quyền đều dùng giao diện mobile-native.

### 2. Quản lý tài khoản
- Thêm danh sách tài khoản thật tại `/m/admin/accounts`: tìm kiếm, trạng thái xác nhận email, lần đăng nhập gần nhất và vai trò hiện tại.
- Thêm chi tiết tài khoản tại `/m/admin/accounts/:id`, không mở lại trang quản trị web.
- Cho quản trị viên đặt mật khẩu mới với xác nhận mật khẩu, tối thiểu 8 ký tự và phản hồi thành công/lỗi rõ ràng.
- Giữ mục đổi mật khẩu cá nhân trong Cài đặt PWA, yêu cầu xác minh mật khẩu hiện tại trước khi đổi.

### 3. Cấp quyền hai lớp
- **Quyền hệ thống:** cấp/thu hồi `admin`, `moderator`, `user`; bảo vệ quản trị viên cuối cùng và vô hiệu hóa thao tác nếu chỉ có quyền đọc.
- **Vai trò tổ chức:** đổi `tenant_owner`, `tenant_admin`, `manager`, `member`, `guest` trong tổ chức đang chọn; hỗ trợ kích hoạt/tạm dừng thành viên theo quyền hiện có.
- Hiển thị rõ nhãn “Quyền hệ thống” và “Vai trò tổ chức”, kèm cảnh báo xác nhận cho thay đổi nhạy cảm.
- Tải lại danh sách, chi tiết và quyền truy cập ngay sau mỗi thay đổi.

### 4. Điều hướng và giao diện
- Bổ sung đầy đủ tuyến mobile cho danh sách và chi tiết tài khoản; cập nhật ánh xạ để mọi liên kết quản trị vẫn nằm trong `/m/*`.
- Dùng cùng shell PWA, token màu, typography, danh sách thu gọn, sheet/dialog và vùng chạm tối thiểu 44px.
- Không bọc hoặc nhúng giao diện desktop; không dùng bảng ngang trên điện thoại.
- Toàn bộ chuỗi mới có VI/EN và metadata riêng cho từng màn.

## Kỹ thuật và an toàn
- Tái sử dụng API và lệnh nghiệp vụ thật đang có; không tạo dữ liệu mẫu và không ghi trực tiếp từ giao diện.
- Mọi thay đổi vai trò tổ chức đi qua RPC hiện có, giữ tenant isolation, RLS, audit/outbox và bảo vệ chủ sở hữu cuối cùng.
- Quyền hệ thống tiếp tục được kiểm tra phía máy chủ; không tin quyền từ trình duyệt hoặc bộ nhớ cục bộ.
- Không thay đổi thủ công cây tuyến sinh tự động và không thay kiến trúc PWA hiện tại.

## Kiểm tra hoàn tất
- Kiểm tra bằng tài khoản có quyền quản trị: tìm tài khoản, mở chi tiết, đặt lại mật khẩu, cấp/thu hồi quyền hệ thống, đổi vai trò tổ chức.
- Kiểm tra tài khoản chỉ đọc/không có quyền không thể thực hiện thao tác ghi.
- Kiểm tra các màn `/m/admin`, danh sách và chi tiết ở 390px, 440px và 820px: không tràn ngang, không thoát sang giao diện web, không có lỗi trình duyệt.
- Chạy typecheck, kiểm tra định dạng và các cổng kiến trúc/quyền liên quan; phân biệt rõ lỗi nền có sẵn nếu có.
