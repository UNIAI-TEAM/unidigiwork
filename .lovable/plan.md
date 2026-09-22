# Báo cáo tự động sau Cuộc họp

## Mục tiêu
Khi biên bản cuộc họp được tổng hợp thành công, UNIWORK tự tạo hoặc cập nhật một Work Product loại Báo cáo, liên kết nguồn với Cuộc họp và phản ánh tiến độ các công việc đã xác nhận trên Work Graph.

## Phạm vi triển khai

### 1. Báo cáo có cấu trúc từ dữ liệu thật
- Mở rộng bước tổng hợp cuộc họp để tạo nội dung báo cáo gồm: tóm tắt điều hành, mục tiêu, chỉ tiêu/KPI, kế hoạch hành động, deadline, phân công, tiến độ Work Graph, quyết định, rủi ro và nguồn.
- Chỉ dùng biên bản, tóm tắt, quyết định và action item của cuộc họp; trường chưa có dữ liệu ghi “Chưa xác định” hoặc “AI đề xuất”, không tự bịa.
- Tiến độ lấy từ các Task thật đã được người dùng xác nhận từ action item; không tự chuyển đề xuất thành Task.

### 2. Work Product và Work Graph
- Thêm một RPC tenant-scoped, idempotent để tạo/cập nhật đúng một Work Product `REPORT` cho mỗi phiên bản tóm tắt cuộc họp.
- Ghi phiên bản Work Product bất biến, provenance từ cuộc họp/tóm tắt/Task, outbox và liên kết `MEETING → WORK_PRODUCT`; không đụng `document_versions` và không tạo writer thứ hai.
- Khi action item được xác nhận, báo cáo lần sau sẽ phản ánh deadline, người phụ trách, trạng thái và phần trăm tiến độ mới nhất từ Work Graph.

### 3. Tự động hóa và giao diện Cuộc họp
- Sau khi `save_meeting_summary` thành công, tự tạo báo cáo và trả về mã Work Product.
- Hiển thị trạng thái báo cáo trong khu vực AI/biên bản cuộc họp và nút mở Work Product trên cả màn mobile-native lẫn trải nghiệm họp hiện có.
- Cho phép tạo lại báo cáo theo phiên bản tóm tắt mới bằng cùng luồng idempotent.

## An toàn và quyền
- Giữ `_meeting_host_guard`, RLS, tenant isolation và quyền workspace hiện có.
- Mutation đi qua server function + RPC; không direct-write từ giao diện.
- Lỗi tạo báo cáo không làm mất tóm tắt; ghi trạng thái lỗi bền vững để có thể thử lại.

## Kiểm tra
- Kiểm tra idempotency, tenant isolation, versioning, outbox và liên kết Work Graph.
- Chạy typecheck, architecture/domain/tenant/RLS tests liên quan.
- Chạy luồng thật: biên bản → tóm tắt → báo cáo → Work Product → Work Graph; kiểm tra mobile 390/440/820px không tràn ngang.
