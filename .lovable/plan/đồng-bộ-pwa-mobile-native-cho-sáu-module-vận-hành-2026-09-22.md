# Đồng bộ PWA mobile-native cho sáu module vận hành

## Mục tiêu
Thay toàn bộ điểm đến Dự án, Lịch, Nhân sự, Knowledge, Quy trình và AI Brain còn là màn rút gọn hoặc mở bố cục web bằng trải nghiệm mobile-native thống nhất trong `/m/*`, dùng dữ liệu và quyền thật.

## Phạm vi

### Khung dùng chung
- Chuẩn hóa header quay lại, tiêu đề, tìm kiếm, bộ lọc, phân trang, loading/error/empty, vùng chạm tối thiểu 44px và safe-area.
- Dùng một hệ thống trạng thái, badge, ngày giờ và bản dịch VI/EN; không hardcode chuỗi mới.
- Mọi liên kết nội bộ đi qua `toMobileHref` và ở lại `/m/*`; không bọc hoặc nhúng trang desktop.

### Dự án và Lịch
- Dự án: danh sách, tìm kiếm/lọc trạng thái, chỉ số tiến độ, chi tiết, thành viên và Task liên quan; mở Task bằng màn mobile-native.
- Lịch: nhóm sự kiện theo ngày, lọc loại/trạng thái, hiển thị deadline và cuộc họp; mở đúng Task hoặc Cuộc họp mobile-native.

### Nhân sự
- Danh bạ và hồ sơ thành viên mobile-native với vai trò, phòng ban, kỹ năng, liên hệ và khối lượng công việc.
- Trung tâm Nhân sự dẫn tới thành viên và Human Agent; thao tác quản lý chỉ hiện khi API/quyền máy chủ cho phép.

### Knowledge
- Danh sách tìm kiếm/lọc và màn chi tiết bài viết riêng trong `/m/knowledge/:id`.
- Giữ nội dung, trạng thái, phân loại và quyền hiện có; không dùng dữ liệu mẫu.

### Quy trình
- Danh sách tìm kiếm/lọc và màn chi tiết riêng trong `/m/workflows/:id`.
- Hiển thị bước, trigger, trạng thái chạy gần nhất và AI Agent liên quan từ API thật; thao tác chỉ qua command/RPC hiện có.

### AI Brain
- Tổng quan mobile-native có KPI, đề xuất và nhật ký thật.
- Tách các điểm đến theo dõi, đề xuất và Skills trong `/m/ai-brain/*`; giữ quyền duyệt/chạy hiện hành và không mở desktop.

## An toàn và kiến trúc
- Giữ tenant isolation, RLS, entitlement và kiểm tra quyền phía máy chủ.
- Không direct-write bảng domain từ component; mutation dùng server function/RPC hiện có.
- Không sửa thủ công `routeTree.gen.ts`, không đổi schema ngoài phần thật sự thiếu cho màn hình.

## Kiểm tra
- Typecheck, format, architecture/domain/tenant/RLS tests liên quan.
- Playwright cho danh sách và chi tiết của cả sáu module tại 390px, 440px và 820px; không tràn ngang, không liên kết thoát `/m/*`.
