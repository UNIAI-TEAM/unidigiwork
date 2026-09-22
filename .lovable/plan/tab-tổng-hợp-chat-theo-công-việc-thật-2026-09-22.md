# Tab tổng hợp chat theo công việc thật

## Mục tiêu
Biến phần “Theo công việc” thành nơi tổng hợp dữ liệu thật theo từng task, dùng chung tại chat mobile và trang chi tiết công việc, đồng thời mở đúng task trong Work Graph.

## Phạm vi triển khai
1. **Danh sách task thật trong chat**
   - Đọc danh sách task theo tenant và quyền hiện tại từ Work Graph.
   - Có tìm kiếm, trạng thái và chọn task để xem tổng hợp.

2. **Tổng hợp theo từng task**
   - Hiển thị các hội thoại thật đã gắn task, trích dẫn task hoặc tạo task qua orchestration.
   - Hiển thị góp ý/bình luận thật của task.
   - Hiển thị công việc, tài liệu, quyết định, execution và Work Product liên quan từ Work Graph.
   - Nội dung chat dài dùng cơ chế “Xem thêm/Thu gọn” hiện có.

3. **Hai điểm truy cập thống nhất**
   - Tab “Theo công việc” trong `/m`.
   - Tab “Chat tổng hợp” trong chi tiết task mobile `/m/tasks/:id`.
   - Cả hai dùng chung một màn hình và cùng nguồn dữ liệu.

4. **Liên kết Work Graph**
   - Nút mở Work Graph truyền `task` để lọc đúng task.
   - Work Graph giữ phân quyền tenant, chỉ trả task và quan hệ người dùng được phép xem.

5. **Kiểm tra luồng thật**
   - Xác nhận task từ chat/orchestration xuất hiện trong tab tổng hợp.
   - Xác nhận lịch sử chat, góp ý và quan hệ Work Graph tải đúng.
   - Kiểm tra màn hình điện thoại không tràn ngang và các nút có vùng bấm phù hợp.

## Kỹ thuật
- Giữ `ai_messages.metadata.contextEntities/sources` và provenance `CREATE_TASK.conversation_id` làm liên kết hội thoại–task; không tạo nguồn dữ liệu song song.
- Dùng server functions có xác thực và RLS hiện có; không đọc domain table trực tiếp từ giao diện.
- Nếu phát hiện thiếu liên kết dữ liệu thật, bổ sung qua migration mới và command/projection hiện hành, không sửa lịch sử migration.
