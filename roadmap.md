# UI/UX refactor roadmap

- [x] Design tokens, typography and shared primitives
- [x] Desktop sidebar and topbar
- [x] Mobile shell and shared mobile controls
- [x] Home, My Box, Work Products and Auth presentation
- [x] Cross-route responsive and runtime verification
- [x] Features, Pricing and Help Center presentation
- [x] Remaining primary screens presentation
- [x] Responsive and runtime verification for this batch

- [x] Optimize mobile Features, Pricing, Help Center, and Tasks
- [x] Verify 360–440px overflow and 44px CTA targets
- [x] Merge My Work and My Box navigation into My Space command center
- [x] Match desktop menu hierarchy and collapsible groups to supplied reference

## CEO Command Center (đang làm)

- [ ] Nút duyệt/từ chối đề xuất giao việc + gán vai trò AI ngay tại Command Center
- [ ] Nút giao việc thực tế: chọn đề xuất, gán nhân sự thật + tiến độ, cập nhật nhật ký/KPI
- [ ] Màn giao ban: CEO ghi nhận kết quả từng việc, Bộ não tính KPI và đề xuất giao việc mới
- [ ] Trang báo cáo theo bộ phận: so sánh KPI, giờ làm, đề xuất theo nhóm, xuất PDF/Excel
- [ ] Thêm tone gradient kiểu ClickUp vào bộ tone giao diện
- [x] CEO: duyệt/bỏ qua đề xuất + giao việc thật (người/AI) + tiến độ
- [x] CEO: báo cáo bộ phận (KPI, giờ, đề xuất) + xuất PDF/Excel
- [x] Tone gradient kiểu ClickUp

## Nhân sự, lịch họp & lịch tự động (mới)

- [x] Trang quản lý nhân sự: thêm/sửa/xóa hồ sơ, gán bộ phận + vai trò, đồng bộ Bộ não
- [x] Trang quản lý lịch họp: thêm/sửa/xóa, gán nhân sự + bộ phận, cập nhật KPI Command Center
- [x] Lịch chạy Bộ não hằng ngày (tự đào tạo lại + cập nhật đề xuất), hiển thị trong Command Center
- [ ] Import Excel thật trong Command Center: nhân sự, bộ phận, lịch họp, tiến độ công việc → KPI tự cập nhật

- [x] Tạo tài khoản demo có dữ liệu để anh Nam đăng nhập xem

## Tùy chỉnh Home / My Space

- [x] Sắp xếp và chỉnh kích thước card Trang chủ, lưu theo người dùng
- [x] Hoàn thiện kéo thả và kích thước card My Space trên desktop/tablet/mobile
- [x] Xác minh hai cấu hình độc lập và giữ nguyên sau khi tải lại

## PWA Native AI

- [ ] Hợp nhất Home và My AI thành conversation/execution surface
- [ ] Chuẩn hóa URL canon: `/m` và `/m/c/:id`; redirect `/m/home`, `/m/ai` vào root surface
- [ ] Thay bottom navigation bằng header tối giản, drawer và composer cố định
- [ ] Chuẩn hóa Add Context sheet: Photos & Files, Camera, From UniWork, People & AI, Connect apps
- [ ] Chuyển My Box thành Inbox theo Needs attention / Working / In review
- [ ] Hiển thị AI Team như execution layer theo tiến độ, không phải destination chính
- [ ] Hoàn thiện luồng Intent → Context → Execution → Review → Work Product → Work Graph
- [ ] Giữ interaction canon: Open → Ask → Add Context → Execute → Observe → Approve → Receive Work Product → Remember

## Vòng học từ góp ý & giao việc cho người thật

- [ ] Chạy E2E thật: Home → Kết quả công việc → gửi góp ý → soạn lại xem AI có cải thiện
- [ ] Tạo tài khoản nhân viên thật, chạy giao việc admin → inbox nhân viên, kiểm tra email nhận được

## Current task

- [ ] Đợt 3 tiếp: làm mới toàn bộ luồng Tài liệu và Cuộc họp theo giao diện mobile-native, không mở bố cục web.
- [ ] Hoàn thiện Tài liệu PWA: danh sách, tìm kiếm/lọc, tạo mới, chi tiết, chỉnh sửa, chia sẻ, phiên bản và nhật ký truy cập bằng dữ liệu thật.
- [ ] Hoàn thiện Cuộc họp PWA: danh sách, quản lý, lịch sử, chi tiết, tiền sảnh và phòng LiveKit trong `/m/*`.
- [ ] Xác minh hai luồng tại 390px, 440px và 820px, không tràn ngang và vùng chạm tối thiểu 44px.
- [x] Làm mới toàn bộ PWA: mọi điểm vào và trang chi tiết dùng giao diện mobile-native, không rơi về bố cục web.
- [x] Chuẩn hóa điều hướng PWA về `/m/*`, bao gồm Settings, Task, Work Product, Work Graph và các module còn lại.
- [ ] Xác minh toàn bộ luồng ở 390px, 440px và 820px: không tràn ngang, vùng chạm tối thiểu 44px.
- [x] Đợt 2: làm mới Cài đặt và danh sách/chi tiết Work Product theo giao diện mobile-native.

- [x] Add a task-centric chat summary tab with chat history, feedback, related work, and Work Graph deep links.
- [x] Optimize mobile Work Graph with compact tasks, scrollable history, and expandable long content.
- [x] Add real task deadlines, automatic overdue projection/alerts, and step-based Work Graph progress.
- [x] Optimize Task and Work Product loading with source pagination and assignee/deadline filters.
- [x] Replace task chat samples with persisted messages and enable employee messaging to the task team or UNI AI.
- [x] Show task interaction counts/latest activity and enable direct team messaging from Work Graph.
- [x] Let senders choose a real task assignee and notify that person directly.
- [x] Notify task assignees of new messages and show per-user unread badges in Work Graph.

- [x] Restrict Work Graph messaging to superiors and show those messages in a separate task-chat summary tab.
- [x] Automatically classify task-team messages as task, feedback, or related work; create task immediately when classified as task.
- [x] Persist every new UNI chat Executive Brief as a Work Product and project it into Work Graph without reopening the conversation.
- [x] Enforce task messaging roles: employees message assignees; superiors use UNI AI or private superior messages.
- [x] Label Work Graph responses by UNI AI or task team, including each source's latest time.
- [x] Add an assignee picker for direct task messages from Work Graph.
- [x] Auto-create a deadline-bound child task and Work Product from each newly classified employee request.
- [x] Turn every persisted Executive Brief into a directly readable report within its Work Product.
- [x] Expand every Executive Brief Work Product into a full report with goals, KPIs, deadlines, assignments, and Work Graph progress.

- [x] Đợt 3: tách Cài đặt PWA thành màn mobile-native độc lập, chỉ hiển thị dữ liệu và thao tác thật.
- [x] Đợt 3: làm mới danh sách/chi tiết Task mobile-native với dữ liệu thật, hội thoại, tệp và Work Graph.
- [x] Đợt 3: thêm màn mobile-native cho Dự án, Lịch, Nhân sự, Knowledge, Quy trình, AI Brain, phê duyệt, quyết định, báo cáo, điều hành, quản trị và thanh toán.
- [x] Đợt 3: chuyển menu và deep link PWA sang namespace `/m`, không còn mở bố cục web từ các điểm vào chính.

## Đợt PWA — Quản trị mobile-native

- [x] Rà soát màn quản trị, đổi mật khẩu và cấp quyền hiện có.
- [x] Lập kế hoạch giao diện quản trị PWA dùng dữ liệu và quyền thật, không mở trang web.
- [x] Làm mới trung tâm Quản trị, danh sách và chi tiết tài khoản mobile-native.
- [x] Tách rõ quyền hệ thống và vai trò tổ chức, giữ kiểm tra quyền phía máy chủ.
- [x] Thêm đặt lại mật khẩu và giới hạn tài khoản theo tổ chức trên PWA.
- [x] Kiểm tra 390/440/820px, typecheck và các cổng kiến trúc liên quan.

- [x] Báo cáo tự động từ biên bản họp thành Work Product REPORT, liên kết Task/Person và Work Graph.
- [x] Hiển thị trạng thái và lối mở báo cáo trên Cuộc họp mobile và bảng AI họp.

## Đợt PWA — Đồng bộ module vận hành mobile-native

- [x] Chuẩn hóa shell, tìm kiếm, lọc, loading/error/empty và i18n cho Dự án, Lịch, Nhân sự, Knowledge, Quy trình, AI Brain.
- [x] Hoàn thiện danh sách/chi tiết Dự án và liên kết Task hoàn toàn trong `/m/*`.
- [x] Hoàn thiện Lịch theo ngày và điều hướng sự kiện tới Task/Cuộc họp mobile-native.
- [x] Hoàn thiện Nhân sự, hồ sơ thành viên, Human Agent và các thao tác được phân quyền.
- [x] Hoàn thiện Knowledge danh sách/chi tiết và các thao tác nội dung bằng API thật.
- [x] Hoàn thiện Quy trình danh sách/chi tiết, trạng thái chạy và AI Agent bằng API thật.
- [x] Hoàn thiện AI Brain tổng quan, theo dõi, đề xuất và Skill bằng API thật.
- [x] Xóa mọi liên kết nội bộ của sáu nhóm còn thoát khỏi `/m/*`; kiểm tra 390/440/820px và các cổng kiến trúc.

## Đợt PWA — Tổ chức, bộ phận và vai trò

- [ ] Hoàn thiện quản lý tổ chức và lời mời thành viên bằng dữ liệu thật.
- [ ] Thêm quản lý bộ phận từ hồ sơ nhân sự thật, không tạo nguồn dữ liệu thứ hai.
- [ ] Thêm màn vai trò và quyền theo tổ chức, cùng chi tiết thành viên mobile-native.
- [ ] Kiểm tra điều hướng `/m/*`, quyền máy chủ và giao diện 390/440/820px.

## PWA — Menu kiểu ChatGPT

- [x] Bỏ nút đóng menu và hỗ trợ vuốt sang trái để đóng.
- [x] Tối giản danh sách Gần đây, bỏ dòng mô tả phụ dưới tiêu đề.
- [x] Làm mới Tìm kiếm thành màn tìm hội thoại theo kiểu ChatGPT.
- [x] Kiểm tra menu và tìm kiếm ở 390/440/820px.

## PWA — Đăng ký theo dõi công việc

- [x] Thêm trang mobile-native riêng để xem việc đang theo dõi và khám phá công việc.
- [x] Thêm tìm kiếm, lọc trạng thái, phân trang và đăng ký/bỏ theo dõi trực tiếp.
- [x] Thêm lối mở trong menu PWA và kiểm tra dữ liệu thật ở 390/440/820px.

- [ ] Trang quản lý người dùng theo vai trò: đồng nghiệp đăng ký vào tổ chức, xem công việc mình theo dõi
- [ ] Kết nối hộp thư ngoài Outlook/Gmail vào Email Hub (đang làm)
- [ ] Thiết kế lại Email Hub kiểu Outlook: ribbon soạn thư, lịch/lịch sử, nút mở hộp thư ngoài
