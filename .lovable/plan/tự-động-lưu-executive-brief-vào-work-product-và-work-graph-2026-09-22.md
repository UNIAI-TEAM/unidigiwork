# Tự động lưu Executive Brief vào Work Product và Work Graph

## Mục tiêu
Mỗi phản hồi Executive Brief mới trong chat UniWork được lưu ngay thành Work Product và xuất hiện trong Work Graph, không phụ thuộc việc người dùng mở lại hội thoại.

## Triển khai
1. Tạo command database tenant-scoped, idempotent theo tin nhắn AI để lưu một Work Product loại Executive Brief, liên kết hội thoại và thực thể nguồn thật (đặc biệt TASK), đồng thời phát outbox trong cùng giao dịch.
2. Gọi command ngay sau khi phản hồi AI được lưu thành công; dùng chính nội dung Executive Brief đã trả về, không gọi AI lần hai.
3. Để projector hiện có chiếu Work Product vào Work Graph; chỉ tạo liên kết REFERENCES/PRODUCES khi có source linkage thật, không suy diễn.
4. Ghi `workProductId` và trạng thái lưu vào metadata tin nhắn để tải lại hội thoại vẫn biết kết quả đã được tạo và chống tạo trùng.
5. Bỏ cơ chế phụ thuộc vào việc component chat được mở lại để bắt đầu tạo; giao diện chỉ hiển thị liên kết/trạng thái của Work Product đã được server tạo.

## Kiểm tra
- Gửi một tin nhắn thật trong `/m`, nhận Executive Brief và xác nhận Work Product được tạo ngay.
- Xác nhận Work Product xuất hiện trong Work Graph, có liên kết đúng với task/ngữ cảnh thật và không tạo bản trùng khi gửi lại cùng command.
- Kiểm tra lỗi AI/lưu dữ liệu được hiển thị rõ, không để trạng thái “Đang soạn” vô hạn; kiểm tra màn hình điện thoại không tràn.
