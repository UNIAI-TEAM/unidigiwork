# Thông báo tin nhắn task và dấu hiệu trên Work Graph

## Mục tiêu
- Mỗi tin nhắn mới trong hội thoại gắn task tạo thông báo đúng người nhận.
- Work Graph hiển thị rõ task đã có tin nhắn và số lượng tương tác.
- Trạng thái “mới” được tính riêng theo người đang đăng nhập, không lộ dữ liệu giữa tổ chức.

## Triển khai
1. Mở rộng truy vấn Work Graph để trả về số thông báo tin nhắn chưa đọc của từng task cho người hiện tại.
2. Giữ việc lưu tin nhắn và phát sự kiện thông báo trong cùng giao dịch, chống gửi trùng bằng khóa idempotency.
3. Hiển thị badge “Tin nhắn mới” khi còn thông báo chưa đọc; task đã từng có hội thoại vẫn giữ biểu tượng và tổng số tin.
4. Khi người nhận mở hội thoại task, đánh dấu các thông báo tin nhắn của task đó là đã đọc và làm mới Work Graph/chuông thông báo.
5. Kiểm tra giao diện điện thoại, quyền tenant, gửi tin thật và trạng thái badge trước/sau khi mở hội thoại.

## Chi tiết kỹ thuật
- Không tạo nguồn dữ liệu song song; trạng thái chưa đọc suy ra từ bảng thông báo hiện có.
- Truy vấn và cập nhật qua RPC có kiểm tra người dùng/tenant; không ghi trực tiếp từ giao diện.
- Outbox tiếp tục là nguồn phát thông báo in-app/push hiện hữu.
