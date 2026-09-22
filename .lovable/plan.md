# Đợt 4 PWA — Cuộc họp mobile-native đầy đủ

## Mục tiêu

Toàn bộ luồng Cuộc họp trên PWA nằm trong `/m/*`, từ danh sách đến phòng video trực tiếp, không mở giao diện web desktop.

## Phạm vi

### 1. Danh sách và quản lý cuộc họp
- Nâng cấp `/m/meet` thành danh sách mobile-native dùng dữ liệu thật, tìm kiếm, lọc trạng thái, phân trang và trạng thái tải/lỗi/trống.
- Tạo, sửa, hủy và quản lý lịch họp bằng các lệnh hiện có; giữ idempotency, quyền workspace và tenant isolation.
- Bổ sung màn lịch sử mobile-native cho cuộc họp đã kết thúc/hủy.
- Bổ sung màn quản lý lịch họp mobile-native theo đúng quyền hiện có; không bọc lại trang desktop.

### 2. Chi tiết và tiền sảnh
- Nâng cấp `/m/meet/:id` thành chi tiết mobile-native với thông tin, agenda, RSVP, người tham gia, nội dung, AI/biên bản, ghi hình và lịch sử trạng thái.
- Tiền sảnh có xem trước camera, chọn mic/camera, bật/tắt thiết bị, phản hồi tham dự và lỗi quyền thiết bị rõ ràng.
- Mọi nút quay lại, thông báo, lịch sử và liên kết liên quan tiếp tục ở `/m/*`.

### 3. Phòng video LiveKit mobile-native
- Tái sử dụng kết nối LiveKit và vé tham gia do máy chủ cấp; không tạo cơ chế họp thứ hai.
- Tạo bố cục phòng họp phù hợp 390–820px: video toàn vùng, thanh điều khiển cố định, sheet cho người tham gia/chat/nội dung/AI/biên bản/ghi hình.
- Giữ mic, camera, chia sẻ màn hình, giơ tay, phụ đề, tự kết nối lại, điểm danh, chủ trì, chuyển chủ trì, kết thúc họp và yêu cầu tham gia.
- Chỉ tải thư viện video sau khi chạy trên trình duyệt để giữ an toàn khi tải trang.

### 4. Điều hướng và tính nhất quán
- Sửa toàn bộ liên kết Cuộc họp trong PWA để không rơi về `/meeting/*` hoặc các trang desktop.
- Dùng chung shell, tiêu đề sticky, nút quay lại, sheet, loading/error/empty và semantic design tokens của PWA hiện tại.
- Bổ sung đầy đủ bản dịch Việt/Anh, không hard-code chuỗi giao diện mới.

## Kỹ thuật và an toàn

- Giữ nguyên các server function/RPC, RLS, phân quyền, outbox, idempotency và Work Graph hiện có.
- Không direct-write từ giao diện, không mock dữ liệu, không sửa schema ngoài phạm vi cần thiết, không sửa file route sinh tự động.
- Giao diện desktop vẫn giữ nguyên.
- Ghi hình vẫn phản ánh đúng trạng thái hạ tầng hiện tại; không giả lập thành công khi Egress/storage chưa sẵn sàng.

## Kiểm tra hoàn tất

- Typecheck, lint phần thay đổi và các cổng kiểm thử kiến trúc liên quan phải đạt.
- Kiểm tra thực tế tại 390px, 440px và 820px: không tràn ngang, vùng chạm tối thiểu 44px.
- Kiểm tra danh sách → chi tiết → tiền sảnh → vào/rời phòng; lỗi mạng/quyền thiết bị; lịch sử, người tham gia, biên bản và ghi hình.
- Xác nhận không còn liên kết Cuộc họp nào trong PWA mở giao diện desktop.
