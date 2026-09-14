# Sắp xếp và chỉnh kích thước card Home / My Space

## Mục tiêu
- Người dùng tự sắp xếp vị trí và chọn kích thước từng card trên **Trang chủ** (`/dashboard`) và **My Space** (`/home`).
- Thiết lập lưu theo tài khoản, đồng bộ đa thiết bị và không làm mất cấu hình của màn còn lại.

## Phạm vi triển khai

### 1. Trang chủ
- Giữ danh sách card hiện tại: KPI, Hoạt động, Phân bổ công việc, Dự án, Hoạt động gần đây, Lịch họp, Tổng quan không gian và Trợ lý AI.
- Bổ sung lựa chọn kích thước phù hợp cho từng card: **Nhỏ / Vừa / Lớn / Toàn hàng**.
- Cho phép kéo–thả để đổi vị trí trên desktop/tablet; trên điện thoại có nút **Lên / Xuống** dễ thao tác.
- Hiển thị ngay bố cục mới khi thay đổi và có nút khôi phục mặc định.

### 2. My Space
- Hoàn thiện cơ chế hiện có để kéo–thả, đổi kích thước và sắp xếp ổn định trên desktop, tablet, điện thoại.
- Giữ các card hiện tại: Tổng quan, Công việc của tôi, Sắp tới, Hộp việc và Tóm tắt AI.
- Không thay đổi dữ liệu công việc, lịch họp, thông báo hoặc hành vi nghiệp vụ.

### 3. Lưu theo người dùng
- Tiếp tục dùng cấu hình người dùng hiện có; không tạo bảng hoặc migration mới.
- Tách khóa `dashboard.*` và `home.*` để chỉnh Trang chủ không ghi đè My Space, và ngược lại.
- Đặt lại một màn chỉ khôi phục màn đó, không xóa cấu hình của màn còn lại.
- Giữ tương thích với cấu hình cũ và tự bổ sung card mới bằng giá trị mặc định.

### 4. Kiểm tra
- Xác minh đổi thứ tự và kích thước vẫn giữ nguyên sau khi tải lại trang.
- Kiểm tra desktop, iPad và điện thoại không tràn ngang; nút thao tác trên mobile tối thiểu 44px.
- Kiểm tra thay đổi Trang chủ không làm thay đổi My Space và ngược lại.

## Kỹ thuật
- Mở rộng bộ đọc/ghi preferences hiện có bằng namespace riêng cho Dashboard và Home.
- Dùng lưới 12 cột ở màn hình lớn; mobile luôn về một cột để bảo đảm dễ đọc.
- Tái sử dụng server functions hiện có, không đổi schema, route, quyền, RLS hoặc luồng dữ liệu nghiệp vụ.
