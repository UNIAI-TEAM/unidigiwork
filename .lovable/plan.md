# Work Graph: tương tác và nhắn tin theo task

## Phạm vi
- Trên mỗi task, hiển thị tổng số tin nhắn gắn với task và thời điểm tương tác cuối cùng.
- Thêm nút **Nhắn tin** ngay trên task; mở vùng soạn thu gọn và gửi vào luồng **Nhóm phụ trách** hiện có.
- Sau khi gửi thành công, cập nhật ngay số tin nhắn và thời gian cuối mà không cần tải lại trang.

## Cách triển khai
- Mở rộng truy vấn phân trang Work Graph để tổng hợp theo task trong một lượt: bình luận của nhóm và tin nhắn AI đã gắn task; không phát sinh truy vấn riêng cho từng dòng.
- Giữ nguyên quyền tổ chức/RLS và dùng lệnh `comment_task` hiện có để ghi tin nhắn, kèm khóa chống gửi trùng.
- Cập nhật kiểu dữ liệu và giao diện Work Graph bằng token/i18n hiện có; nút và vùng nhập đạt tối thiểu 44px trên điện thoại.
- Thêm migration mới, không sửa migration cũ; cập nhật roadmap.

## Kiểm tra
- Typecheck và định dạng mã nguồn.
- Chạy luồng thật ở màn hình điện thoại: mở Work Graph, gửi tin từ một task, xác nhận số tin tăng, thời gian cuối đổi và tin xuất hiện trong tổng hợp chat của task.
- Kiểm tra bộ lọc người phụ trách/hạn và không tràn ngang.
