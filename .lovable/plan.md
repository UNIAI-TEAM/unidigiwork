# Đợt 3 PWA — Tài liệu và Cuộc họp mobile-native

## Mục tiêu

Toàn bộ luồng Tài liệu và Cuộc họp hoạt động bên trong `/m/*`, dùng chung shell mobile-native và dữ liệu thật, không mở giao diện desktop.

## Phạm vi

### 1. Tài liệu
- Nâng cấp danh sách Tài liệu với tìm kiếm, lọc thư mục, trạng thái tải/lỗi/trống và tạo tài liệu thật.
- Nâng cấp chi tiết Tài liệu thành màn đọc/chỉnh sửa mobile-native với nội dung, thông tin, chia sẻ, phiên bản và nhật ký truy cập.
- Mọi thao tác ghi dùng server function/RPC hiện có, giữ idempotency, quyền tài liệu, RLS và tenant isolation.
- Chuyển mọi liên kết Tài liệu trong PWA về `/m/documents/*`.

### 2. Cuộc họp
- Hoàn thiện danh sách, quản lý và lịch sử Cuộc họp bằng dữ liệu thật, có tìm kiếm, lọc và phân trang phù hợp.
- Giữ chi tiết, tiền sảnh và phòng LiveKit trong `/m/meet/*`; tái sử dụng luồng token, kết nối, điểm danh, điều khiển chủ trì, transcript, AI và ghi hình hiện có.
- Không tạo cơ chế họp thứ hai; trạng thái ghi hình phản ánh đúng hạ tầng hiện tại.
- Chuyển mọi liên kết Cuộc họp trong PWA về `/m/meet/*`.

### 3. Trải nghiệm và kiểm tra
- Dùng semantic tokens, bản dịch Việt/Anh, sticky header, sheet/dialog chuẩn mobile và vùng chạm tối thiểu 44px.
- Giữ nguyên giao diện desktop và không sửa file route sinh tự động.
- Kiểm tra typecheck, lint liên quan, architecture tests và luồng thật tại 390px, 440px, 820px; xác nhận không tràn ngang hoặc thoát sang desktop.