# Tối ưu Work Graph trên điện thoại

## Thay đổi
- Giữ màn hình desktop hiện tại; riêng mobile chuyển mỗi mục thành hàng task thu gọn, ưu tiên tiêu đề, trạng thái, tiến độ và hạn.
- Cho danh sách Work Graph cuộn dọc ổn định như lịch sử chat, giữ thanh lọc/tìm kiếm dễ truy cập.
- Task có tiêu đề hoặc thông tin dài sẽ mặc định rút gọn và có nút “Xem thêm/Thu gọn”; không làm nút mở task bị xung đột.
- Khi mở một task từ tab tổng hợp chat, Work Graph vẫn lọc đúng task và hiển thị dạng thu gọn mới.
- Dùng chuỗi i18n VI/EN, vùng bấm tối thiểu 44px và semantic tokens hiện có.

## Kiểm tra
- Kiểm thử ở 390px và 440px: cuộn danh sách, mở/thu gọn, mở chi tiết task, lọc task từ deep link và không tràn ngang.
- Chạy định dạng và kiểm tra tập trung cho Work Graph.
