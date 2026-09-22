# Tự động phân loại tin nhắn nhóm phụ trách

## Mục tiêu
Mỗi tin nhắn mới trong **Nhóm phụ trách** được AI phân loại thành **Task**, **Góp ý** hoặc **Công việc liên quan**. Nếu là Task, UniWork tự tạo task con ngay, không cần người dùng nhập lại.

## Luồng người dùng
1. Người dùng chọn người nhận và gửi tin như hiện nay.
2. Tin nhắn xuất hiện ngay trong lịch sử với trạng thái đang phân loại.
3. UniWork hiển thị nhãn kết quả trên tin nhắn:
   - **Task mới**: tạo task con, kế thừa không gian làm việc, liên kết với task gốc và mở được trong Work Graph.
   - **Góp ý**: giữ trong lịch sử và đưa vào mục Góp ý.
   - **Công việc liên quan**: liên kết với đúng task/tài liệu/Work Product đã được nhận diện.
4. Danh sách task, góp ý, liên kết và Work Graph tự làm mới sau khi xử lý.

## Quy tắc an toàn
- Chỉ dùng đối tượng mà người gửi có quyền xem trong cùng tổ chức.
- Task mới dùng khóa chống trùng từ chính tin nhắn; gửi lại hoặc retry không tạo task thứ hai.
- Chỉ tạo liên kết khi nhận diện được duy nhất một đối tượng đủ tin cậy; nếu chưa chắc, vẫn lưu nhãn nhưng không tự liên kết sai.
- Việc lưu phân loại, tạo task/liên kết và phát sự kiện được thực hiện qua lệnh nghiệp vụ có kiểm tra tenant; Work Graph vẫn là projection chỉ đọc.
- Không dùng bảng đánh giá AI hiện có cho góp ý hội thoại vì khác ngữ nghĩa.

## Triển khai kỹ thuật
1. Thêm metadata phân loại vào `task_comments`, gồm loại, độ tin cậy, tiêu đề task trích xuất, đối tượng liên quan, model/version và trạng thái xử lý.
2. Thêm lệnh RPC idempotent để ghi kết quả phân loại; với `TASK` tạo task con và outbox trong cùng giao dịch; với `RELATED_WORK` gọi helper liên kết Work Graph hiện có.
3. Thêm bộ phân loại server-side dùng `openai/gpt-6-astra` qua Responses API dạng stream, đầu ra JSON có schema chặt; nạp danh sách ứng viên liên quan đã lọc quyền trước khi phân loại.
4. Sau khi `sendTaskMessage` thành công, chạy phân loại và áp dụng kết quả; lỗi AI không làm mất tin nhắn, trạng thái được lưu để retry và quan sát.
5. Hiển thị nhãn, trạng thái và liên kết/task vừa tạo trong hội thoại; bổ sung chuỗi tiếng Việt/Anh.
6. Kiểm tra chống trùng, tenant isolation, tạo task thật, liên kết đúng, lỗi classifier, giao diện 390–440px và các gate kiến trúc liên quan.
