# Làm mới toàn bộ giao diện PWA UniWork

## Kết quả rà soát

- Hiện có **18 màn hình PWA riêng** trong nhánh `/m`.
- Có **18 điểm vào chính** vẫn mở giao diện web: 17 mục chức năng từ menu và trang Cài đặt.
- Có **13 liên kết bên trong PWA** đang thoát sang Task, Work Product, Work Graph, Tài liệu, Cuộc họp hoặc Cài đặt bản web.
- Toàn bộ khu vực đăng nhập hiện có **74 trang nội dung dạng web** thuộc **31 nhóm chức năng**. Không phải tất cả xuất hiện với mọi người dùng; trang quản trị chỉ hiện đúng vai trò.

**Phạm vi đã chọn:** toàn bộ PWA. Mọi màn hình người dùng mở từ PWA phải giữ trải nghiệm mobile-native; không hiển thị sidebar, topbar, bảng rộng hoặc bố cục desktop thu nhỏ.

## Hướng triển khai

### 1. Nền tảng giao diện PWA dùng chung

- Chuẩn hóa header, nút quay lại, menu hành động, danh sách, bộ lọc, trạng thái tải/rỗng/lỗi và vùng an toàn đáy màn hình.
- Tạo bộ mẫu riêng cho: danh sách, chi tiết, biểu mẫu, tài liệu, timeline/chat, báo cáo và quản trị.
- Mọi vùng chạm tối thiểu 44px; không tràn ngang ở 390–820px; hỗ trợ sáng/tối và tiếng Việt/Anh.
- Giữ nguyên dữ liệu, quyền, nghiệp vụ và các luồng đang hoạt động; chỉ thay lớp hiển thị và điều hướng PWA.

### 2. Luồng cốt lõi

- Cài đặt PWA riêng: hồ sơ, tài khoản, mật khẩu, thông báo, giao diện, ngôn ngữ, tích hợp, nhóm, bảo mật, thanh toán và dữ liệu.
- Task: danh sách, tạo mới, chi tiết, tiến độ, deadline, người phụ trách, chat và công việc con.
- Work Product: danh sách, nội dung, góp ý, phiên bản, so sánh, duyệt, tải/chia sẻ và liên kết Work Graph.
- Work Graph: danh sách thu gọn, bộ lọc, tiến độ, deadline, trao đổi và mở đúng trang chi tiết PWA.
- Sửa toàn bộ liên kết trong chat/orchestration/search để luôn ưu tiên `/m/*`.

### 3. Công việc và cộng tác

- Dự án, Không gian làm việc, Lịch, Tài liệu, Họp, Email, Chat, Thông báo và Tìm kiếm.
- Mỗi module có danh sách và trang chi tiết PWA; thao tác tạo/sửa dùng sheet hoặc màn hình toàn trang phù hợp điện thoại.
- Các liên kết chéo giữa Task, Work Product, Document, Meeting và People không được quay về giao diện web.

### 4. AI và điều hành

- AI Brain, Skill Hub, AI Workforce, AI Market, Workflow, Work Catalog, Quyết định và lịch sử quyết định.
- CEO, KPI, giao ban, theo dõi đề xuất/công việc và Báo cáo dùng mẫu mobile-native cho số liệu và phê duyệt.
- Giữ Home `/m` là conversation control surface; không thêm bottom tabs, dashboard cards hoặc agent picker vào Home.

### 5. Tổ chức và quản trị

- People, HR, Human Agent, quản lý cuộc họp, Billing và các trang Workspace.
- Khu vực Admin/Platform dùng giao diện quản trị mobile gọn, phân cấp theo nhóm thay vì bảng desktop; chỉ hiện cho đúng vai trò.
- Các trang ít dùng vẫn có trải nghiệm PWA đầy đủ, không dùng iframe hay bọc nguyên trang web.

### 6. Điều hướng tương thích

- Mỗi điểm đến PWA có URL `/m/*` ổn định.
- Link cũ tiếp tục hoạt động trên web; khi được mở từ PWA sẽ chuyển sang màn hình PWA tương ứng.
- Back navigation giữ đúng ngữ cảnh từ chat, task, Work Graph hoặc thông báo.
- Không thay đổi URL chia sẻ công khai, quyền truy cập hoặc hợp đồng dữ liệu.

### 7. Kiểm tra hoàn tất

- Lập ma trận toàn bộ route theo vai trò: nhân viên, quản lý và admin.
- Kiểm tra các luồng chính ở 390px, 440px và 820px; không overflow, không chữ/nút chồng nhau.
- Kiểm tra mọi nút quay lại, deep link, tìm kiếm, thông báo và liên kết chéo không rơi về giao diện web.
- Kiểm tra trạng thái online/offline hiện có, sáng/tối, tiếng Việt/Anh và quyền truy cập.
- Chạy typecheck, định dạng và kiểm tra kiến trúc liên quan sau từng đợt.

## Thứ tự bàn giao

1. **Đợt 1:** nền tảng chung + Settings + Task + Work Product + Work Graph.
2. **Đợt 2:** Projects + Workspace + Documents + Meetings + Calendar + Notifications.
3. **Đợt 3:** AI Brain + Skills + Workforce + Market + Workflows + Decisions.
4. **Đợt 4:** People + HR + Human Agents + CEO + Reports + Billing.
5. **Đợt 5:** Admin/Platform và rà soát toàn bộ liên kết/thiết bị.

Mỗi đợt phải hoàn chỉnh cả danh sách, chi tiết và thao tác chính trước khi chuyển sang đợt tiếp theo.
