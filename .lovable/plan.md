# Deadline và tiến độ thật trong Work Graph

## Thay đổi
- Cho phép đặt, đổi hoặc xoá deadline trực tiếp trên task trong Work Graph; thao tác đi qua command hiện có và cập nhật projection/outbox theo tenant.
- Giữ trạng thái nghiệp vụ của task khi quá hạn; chu kỳ tự động 15 phút đánh dấu `overdue`, gửi cảnh báo một lần cho người phụ trách và cập nhật metadata Work Graph.
- Tính tiến độ task tự động từ các bước thực thi thật liên kết bằng `task_id`; nếu chưa có bước thì suy ra từ trạng thái task như hiện tại.
- Hiển thị deadline, nhãn “Quá hạn”, thanh tiến độ và số bước hoàn thành ngay trong task thu gọn trên mobile.
- Đồng bộ lại danh sách sau khi lưu deadline và giữ deep link Work Graph hoạt động.

## Kỹ thuật
- Mở rộng hàm nhắc hạn hiện có thay vì tạo writer thứ hai; không đổi trạng thái task khi đến hạn.
- Bổ sung migration mới qua Lovable Cloud để tính và chiếu `progress`, `completed_steps`, `total_steps`, `due_state` vào node TASK.
- UI gọi server command `setTaskDueAt`; không ghi trực tiếp từ trình duyệt.

## Kiểm tra
- Kiểm tra migration, chu kỳ tự động hiện hữu và dữ liệu Work Graph.
- Kiểm thử mobile đặt deadline, trạng thái quá hạn, tiến độ theo bước, không tràn ngang.
