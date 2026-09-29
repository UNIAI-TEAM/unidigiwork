# Bảng Công việc theo tổ chuyên môn

## Mục tiêu
Tạo một bảng Công việc dành cho trường học, dùng chung Work Graph hiện có. Tổ trưởng chỉ xem và quản lý công việc có người phụ trách thuộc tổ của mình; Ban Giám hiệu vẫn có thể chọn Tổ Toán hoặc Tổ Văn để theo dõi.

## Phạm vi thực hiện
- Thêm lối vào **Công việc của tổ** trên trang Điều hành trường.
- Bảng gồm các cột trạng thái hiện có: Cần làm, Đang làm, Bị chặn, Hoàn thành; hỗ trợ tạo việc, đổi trạng thái và mở chi tiết.
- Tổ trưởng được cố định vào tổ đã gán trong hồ sơ, không có bộ chọn tổ và không thể truyền tên tổ từ trình duyệt để vượt quyền.
- Ban Giám hiệu được chọn từng tổ; giáo viên không được dùng màn hình quản lý này.
- Công việc thuộc tổ được xác định từ người phụ trách/người được giao thuộc tổ đó; không thêm Work Graph hoặc nguồn dữ liệu thứ hai.
- Trạng thái trống, đang tải, lỗi và giao diện điện thoại 390px, máy tính bảng 820px, desktop đều đầy đủ.

## An toàn dữ liệu và quyền
- Thêm RPC đọc bảng theo tổ và các lệnh tạo/chuyển trạng thái qua trusted boundary; máy chủ tự xác định tenant, vai trò và tổ.
- Tổ trưởng chỉ được thao tác công việc thuộc tổ mình; không được giao việc cho người ngoài tổ.
- Ban Giám hiệu giữ quyền toàn trường; dữ liệu doanh nghiệp và các màn hình Công việc hiện tại không đổi.
- Giữ nguyên `tenant_member_profiles.department` là nguồn tổ duy nhất; công việc kế thừa tổ qua owner/assignee.
- Mọi thay đổi quan trọng giữ `row_version`, `idempotency_key`, audit và outbox theo luồng Công việc hiện có.

## Thực hiện kỹ thuật
- Tạo migration mới cho các RPC/phân quyền theo tổ, không sửa migration cũ và không thêm cột `department` vào `tasks`.
- Thêm server functions có xác thực và validation cho danh sách, tạo việc, chuyển trạng thái và danh sách thành viên hợp lệ trong tổ.
- Tạo route riêng `/school-dept-tasks`, dùng i18n VI/EN và component giao diện hiện có.
- Bổ sung liên kết từ Dashboard Ban Giám hiệu và giao diện tổ trưởng.

## Kiểm thử
- Tổ trưởng Tổ Toán thấy/quản lý việc Toán nhưng không thấy hoặc sửa việc Văn; Tổ Văn kiểm tra ngược lại.
- Ban Giám hiệu chọn và xem được cả hai tổ.
- Không gán được người ngoài tổ; công việc nhiều người phụ trách hiển thị cho đúng tổ liên quan.
- Kiểm tra cách ly tenant, idempotency, audit/outbox, typecheck/build và luồng thật trên 390/820/1280px.
