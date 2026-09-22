# Tối ưu chat dài trên điện thoại

## Mục tiêu
- Mỗi lần mở hội thoại, ưu tiên hiển thị lượt công việc mới nhất thay vì dàn toàn bộ lịch sử.
- Lịch sử cũ vẫn nằm trong cùng luồng và có thể cuộn lên/xuống tự nhiên.
- Nội dung trả lời dài được thu gọn mặc định, có nút “Xem thêm” / “Thu gọn”.

## Triển khai
1. Nhóm tin nhắn theo từng lượt yêu cầu–phản hồi; lượt mới nhất mở đầy đủ, các lượt cũ hiển thị gọn.
2. Giữ vùng lịch sử cuộn độc lập, tự đưa người dùng tới lượt mới nhất khi mở hoặc nhận phản hồi mới; giữ nút quay về nội dung mới nhất.
3. Thêm thành phần nội dung có ngưỡng chiều dài, gradient báo còn nội dung và nút mở/thu gọn tối thiểu 44px.
4. Áp dụng cùng cách đọc nhanh cho phần lịch sử chat trong tab tổng hợp theo công việc.
5. Bổ sung nhãn tiếng Việt/Anh và kiểm tra ở màn hình điện thoại: cuộn, mở/thu gọn, không tràn ngang.

## Phạm vi kỹ thuật
- Chỉ thay đổi giao diện và trạng thái hiển thị phía người dùng.
- Không đổi dữ liệu hội thoại, logic AI, quyền truy cập hoặc Work Graph.
