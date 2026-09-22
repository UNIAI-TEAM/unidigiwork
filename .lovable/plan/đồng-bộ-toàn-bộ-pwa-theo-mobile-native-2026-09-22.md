# Đồng bộ toàn bộ PWA theo mobile-native

## Mục tiêu
Chuyển PWA thành một trải nghiệm mobile-native thống nhất, không còn điểm điều hướng nào mở bố cục web. Thực hiện theo một hệ thống dùng chung và phát hành đồng bộ, không thiết kế từng trang rời rạc.

## Phạm vi

### 1. Chuẩn hóa khung mobile-native dùng chung
- Dùng một shell duy nhất cho toàn bộ `/m/*`: header sticky, back/menu/action, vùng nội dung, sheet bộ lọc/form, trạng thái loading/error/empty và safe-area.
- Chuẩn hóa các mẫu list, detail, form, tabs, search/filter, pagination, permission-denied và offline state để mọi module có cùng hành vi.
- Giữ drawer Native AI hiện tại làm điều hướng gốc; mọi destination và cross-link đều đi qua `/m/*`.

### 2. Phủ kín toàn bộ destination còn thiếu
- Workspace: danh sách/chi tiết, thành viên, mời người, nhãn, cài đặt, mẫu email và audit.
- Công việc: Work Catalog/chi tiết, thông báo/chi tiết, chat channel, Email Hub/soạn/chi tiết và các deep link liên quan.
- AI: AI Workforce/chi tiết, AI Market/tìm kiếm/chi tiết, AI Brain tracking và các màn quản trị AI.
- Điều hành: KPI history, proposal tracking, task tracking, standup và các drill-down báo cáo có dữ liệu thật.
- Quản trị: người dùng, tài khoản, tenant/platform, gói, cohort, lead, economics, quota, rules, backup, webhook, trace, proof, knowledge, document access và sell-work pilots.
- Giữ các màn mobile-native đã có cho Home, Task, Work Product, Work Graph, Dự án, Lịch, Nhân sự, Họp, Knowledge, Workflow, AI Brain, Skills, Agents, Phê duyệt, Quyết định, Báo cáo, CEO, Billing và Settings; chỉ chuẩn hóa chúng vào cùng hệ thống.

### 3. Điều hướng không rơi về web
- Mở rộng bộ ánh xạ mobile cho mọi route desktop hợp lệ, kể cả route chi tiết, tham số và query string.
- Thêm guard tại shell PWA: link nội bộ được chuyển về route mobile tương ứng trước khi điều hướng.
- Những route desktop không còn phù hợp trên PWA sẽ đi tới hub mobile đúng ngữ cảnh, không render hoặc nhúng nguyên trang desktop.
- Giữ nguyên desktop routes cho người dùng web.

### 4. Dữ liệu và quyền
- Tái sử dụng server functions/RPC hiện có; không tạo writer thứ hai, không direct-write từ giao diện và không nới tenant isolation/RLS.
- Không đưa dữ liệu mẫu từ các trang desktop sang PWA. Drill-down chỉ xuất hiện khi có nguồn dữ liệu thật; nếu chưa có API thật thì hiển thị trạng thái chưa có dữ liệu trong hub tương ứng.
- Giữ phân quyền theo vai trò/entitlement cho từng hành động; các màn admin chỉ hiển thị sau khi server xác nhận quyền.
- Dùng i18n Việt/Anh cho toàn bộ chuỗi mới.

## Cách triển khai đồng bộ
1. Hoàn thiện bộ primitive và registry route mobile dùng chung.
2. Chuyển các nhóm Workspace, Work, AI, Executive và Admin sang primitive đó trong cùng một thay đổi.
3. Sửa toàn bộ menu, card, notification, Work Graph, Work Product, Task và kết quả tìm kiếm để dùng registry mobile.
4. Chạy audit tự động để không còn link authenticated nào từ PWA thoát khỏi `/m/*`.

## Tiêu chí hoàn tất
- Mọi destination authenticated có thể mở từ PWA đều có màn mobile-native hoặc hub mobile đúng ngữ cảnh; không bọc trang desktop.
- Không còn link nội bộ PWA dẫn tới bố cục web.
- Kiểm tra 390px, 440px và 820px: không tràn ngang, vùng chạm tối thiểu 44px, tab/list/form hoạt động đúng.
- Kiểm tra quyền nhân viên/quản lý/admin, loading/error/empty/offline và các deep link chi tiết.
- Typecheck, format, architecture/domain SDK/tenant/UI guards và kiểm thử route mapping đều đạt.
