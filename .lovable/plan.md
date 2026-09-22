# Đợt 3 PWA — Task mobile-native

## Mục tiêu
Làm mới hoàn toàn `/m/tasks` và `/m/tasks/:id` theo giao diện mobile-native, không render hoặc mở bố cục web, đồng thời giữ nguyên dữ liệu thật, quyền truy cập và các quy trình nghiệp vụ hiện có.

## Phạm vi triển khai

### 1. Danh sách Task mobile-native
- Tách màn danh sách thành component mobile độc lập, dùng header sticky, tìm kiếm, bộ lọc trạng thái/ưu tiên/hạn và phân trang tải từ máy chủ.
- Hiển thị mỗi Task dạng hàng thu gọn: trạng thái, ưu tiên, người phụ trách, deadline/quá hạn, tiến độ việc con và cập nhật gần nhất.
- Giữ tạo Task thật qua command hiện có; bổ sung deadline, ưu tiên và người phụ trách khi nguồn dữ liệu/quyền cho phép.
- Có skeleton, lỗi có nút thử lại, empty state và vùng chạm tối thiểu 44px.

### 2. Chi tiết Task mobile-native
- Dùng header sticky với quay lại, theo dõi, chia sẻ liên kết canonical `/m/tasks/:id` và menu hành động.
- Chia nội dung thành các tab native: Tổng quan, Hội thoại, Việc con, Tệp và Liên quan.
- Tổng quan cho phép chỉnh sửa thật tiêu đề, mô tả, trạng thái, ưu tiên, deadline, nhãn và người phụ trách bằng server function/RPC hiện có.
- Hội thoại tái sử dụng quyền nhắn nhóm phụ trách, hỏi UNI AI và nhắn cấp trên; tự đánh dấu đã đọc.
- Việc con cho phép tạo, mở và hoàn tất; mọi deep link Task cha/con luôn ở `/m/tasks/:id`.
- Tệp cho phép tải lên, tải xuống và xóa trong phạm vi quyền hiện tại.
- Liên quan mở Work Graph mobile và các Work Product mobile; không dẫn người dùng PWA về trang web.

### 3. Điều hướng và dữ liệu
- Chuẩn hóa các link Task từ PWA, Work Graph, Work Product, orchestration và chia sẻ nội bộ về namespace `/m/*`.
- Giữ desktop `/tasks` và `/tasks/:id` nguyên trạng.
- Tái sử dụng command có idempotency, RLS và Work Graph projection hiện có; không thêm writer thứ hai, không sửa schema nếu không cần.
- Không dùng dữ liệu mẫu; mọi nhãn giao diện mới dùng i18n tiếng Việt/Anh.

## Chi tiết kỹ thuật
- Ưu tiên API danh sách đã phân trang theo tenant/workspace thay vì tải toàn bộ rồi lọc ở trình duyệt; chỉ mở rộng DTO đọc nếu thiếu tiến độ/người phụ trách.
- Mutation quan trọng tiếp tục qua trusted server function/RPC; cache Task, Task Ops và Work Graph được invalidate đồng bộ sau thao tác.
- Giữ offline queue cho thao tác đã được hỗ trợ; không đưa tải tệp vào hàng đợi ngoại tuyến.
- Sửa metadata riêng của hai route mobile đủ title, description, Open Graph và Twitter card.

## Kiểm thử hoàn tất
- Tài khoản thật: mở danh sách, tìm/lọc/phân trang, tạo Task, mở chi tiết, đổi trạng thái/deadline/người phụ trách, tạo việc con, gửi bình luận, tải tệp và mở Work Graph.
- Kiểm tra quyền nhân viên/quản lý ở các thao tác nhạy cảm.
- Kiểm tra 390px, 440px và 820px: không tràn ngang, tab cuộn đúng, nội dung dài mở/thu gọn, vùng chạm tối thiểu 44px.
- Typecheck, Prettier và các kiểm thử kiến trúc liên quan phải đạt; cập nhật roadmap khi hoàn tất.
