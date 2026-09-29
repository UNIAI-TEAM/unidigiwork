# Tối ưu không gian màn Công việc

## Thay đổi
- Thu gọn sidebar mặc định trên desktop, vẫn giữ nút mở rộng và ghi nhớ lựa chọn của người dùng.
- Cho AI Copilot ẩn hoàn toàn; đặt nút mở lại dễ thấy trên vùng Công việc và ghi nhớ trạng thái.
- Mở rộng bảng Kanban theo không gian còn lại trên desktop.
- Trên mobile, chuyển bảng sang các cột ngang có chiều rộng ổn định để xem và cuộn thuận tiện, thay vì ép từng cột thành danh sách dài.

## Kiểm tra
- Kiểm tra desktop 1280px và mobile 390px.
- Xác nhận sidebar, nút ẩn/hiện Copilot, bảng Kanban và trạng thái ghi nhớ hoạt động đúng.
- Kiểm tra lỗi hiển thị và bản dựng hiện tại.

## Kỹ thuật
- Chỉ chỉnh giao diện màn Công việc và trạng thái hiển thị cục bộ; không thay đổi dữ liệu hay nghiệp vụ.
- Dùng các thành phần và token giao diện hiện có của UniWork.
