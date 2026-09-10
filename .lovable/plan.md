# Refactor UI/UX toàn hệ thống UNIWORK theo hướng ClickUp

## Mục tiêu
Chuẩn hóa toàn bộ giao diện UNIWORK theo hướng **UNIWORK ClickUp mobile** đã chọn: dày thông tin nhưng dễ quét, CTA đen quyết đoán, tím làm điểm nhấn, card module bo tròn, typography mạnh và mobile giống ứng dụng native.

Phạm vi chỉ gồm giao diện và trải nghiệm. Giữ nguyên route, dữ liệu, quyền truy cập, xử lý nghiệp vụ, API và backend.

## Đánh giá hiện trạng
- Hệ thống đã có semantic tokens, light/dark mode, shell desktop/mobile và nhiều primitive dùng chung; đây là nền tốt để refactor tập trung thay vì sửa từng màn rời rạc.
- Màu chính hiện nghiêng tím và nhiều màn dùng màu trực tiếp; chưa có hệ token đầy đủ cho CTA đen, AI accent, pastel surface, border mạnh và shadow chuẩn.
- Typography hiện dùng Space Grotesk + DM Sans, chưa khớp Plus Jakarta Sans + Inter + Sometype Mono.
- Button, Input, Card, Badge còn nhỏ và thiếu hierarchy; touch target mobile chưa đồng nhất 44px.
- Desktop sidebar/topbar khá đầy đủ nhưng active state, search, grouping và mật độ chưa cùng một ngôn ngữ thiết kế.
- Mobile shell hiện có dock nổi và gradient mạnh; hướng đã chọn cần chuyển sang topbar gọn, danh sách status-first và bottom navigation phẳng hơn.
- Home, My Box và Kết quả công việc đang dùng nhiều kiểu card/radius khác nhau; cần chuẩn hóa qua primitive thay vì thay logic từng màn.

## Thiết kế đã khóa
- **Màu:** CTA chính `#202020`; accent `#7612FA`; các màu logo tím/xanh/hồng/cam chỉ dùng làm dấu hiệu thương hiệu; nền trắng + `#F8F9FA` + `#F1F1F9`.
- **Chữ:** Plus Jakarta Sans cho heading; Inter cho nội dung/điều khiển; Sometype Mono cho taxonomy, mã, nhãn module.
- **Hình khối:** 6/8/12/14/20/32px; card ứng dụng chủ yếu 12–14px, panel lớn 20px; pill chỉ dùng cho status/chip.
- **Độ sâu:** border rõ, shadow rất nhẹ; không glassmorphism, không neon glow, không phủ gradient lên card thường.
- **Mật độ:** compact nhưng không chật; row 44px trở lên; metadata xếp lớp; status dễ quét.
- **Responsive:** desktop có sidebar + topbar; tablet giảm cột; mobile single-column, bottom navigation 5 mục và action trung tâm rõ ràng.

## Kế hoạch triển khai

### 1. Nền tảng design system
- Thay token màu light/dark trong `src/styles.css` bằng hệ semantic tương ứng với palette đã khóa.
- Bổ sung token cho CTA ink, link blue, AI pink/cyan, pastel surfaces, border strong, shadow card/panel và typography levels.
- Đổi font tải ở root sang Plus Jakarta Sans, Inter và Sometype Mono.
- Chuẩn hóa focus ring, scrollbar, reduced motion và contrast mode; giữ khả năng chọn tone hiện có nhưng CTA chính luôn có hierarchy đen rõ.

### 2. Primitive dùng chung
- Refactor Button: CTA đen, secondary tím nhạt, tertiary/ghost, AI variant; tất cả size quan trọng đạt 44px trên mobile.
- Refactor Input/Search, Card, Badge, Tabs, Select, Dialog và Dropdown theo radius/border/shadow mới.
- Thêm các pattern trình bày dùng lại: page header, section header, stat tile, dense list row, empty/loading/error state.
- Không đổi props công khai nếu không cần, để các màn hiện tại nhận giao diện mới mà không đổi logic.

### 3. Shell desktop
- Sidebar: nền sáng, nhóm điều hướng mono nhỏ, active state tím tiết chế, workspace switcher rõ hơn, collapsed state ổn định.
- Topbar: search là điểm neo chính, các icon action gọn, avatar/tenant/workspace rõ hierarchy.
- Chuẩn hóa page canvas, khoảng cách nội dung và breakpoint tablet; loại bỏ raw colors khỏi shell.

### 4. Shell mobile theo prototype đã chọn
- Topbar: logo/workspace bên trái, search + thông báo/avatar bên phải; đảm bảo safe area.
- Bottom navigation: phẳng, border nhẹ, 5 mục hiện có; nút My AI ở giữa vẫn nổi bật nhưng bỏ glow/gradient quá mạnh.
- Chuẩn hóa swipe feedback, FAB, list item và trạng thái chạm; giữ nguyên gesture và navigation hiện có.

### 5. Các màn ưu tiên cao
- **Home desktop/mobile:** greeting, quick summary, My Work/LineUp, Upcoming và Inbox theo hierarchy status-first; dùng dữ liệu và hành động hiện tại.
- **My Box:** tab compact, row có status strip, Open/Share dễ chạm, cover tài liệu gọn; giữ vuốt duyệt/hoãn.
- **Kết quả công việc:** danh sách, báo cáo tuần, filters, editor ba cột và panel AI dùng cùng token/mật độ; không đổi workflow/version/review/GenOffice.
- **Auth/Welcome/Onboarding:** đồng bộ form, tabs và CTA; đồng thời xử lý hydration mismatch hiện có ở trang đăng nhập mà không đổi hành vi đăng nhập.

### 6. Phủ toàn hệ thống
- Áp dụng primitive và page patterns cho Tasks, Meetings, Calendar, Documents, Chat, Email, Knowledge, Workflows, People, AI Workforce, Search, Notifications, Settings, Admin và Billing.
- Giữ cấu trúc thông tin của từng màn; chỉ chỉnh hierarchy, spacing, surface, typography, states và responsive.
- Landing dùng cùng brand tokens nhưng vẫn giữ vai trò marketing; không biến giao diện trong app thành landing page.

### 7. Kiểm thử và nghiệm thu
- Chạy typecheck, formatter và test liên quan; không sửa backend/schema.
- Kiểm tra bằng trình duyệt các luồng Home, My Box, Work Products, Auth và shell desktop/mobile.
- Kiểm tra 390×844, 440×956, 768px tablet, 1280px desktop; không overflow hoặc text/button bị cắt.
- Kiểm tra light/dark, keyboard focus, touch target, menu/sidebar, drag/drop và swipe vẫn hoạt động.
- So sánh ảnh trước/sau và rà console; chỉ kết luận hoàn thành khi không còn lỗi giao diện mới.

## Thứ tự bàn giao
1. Design tokens + primitives.
2. Desktop/mobile shell.
3. Home + My Box + Work Products + Auth.
4. Các module còn lại theo primitive chung.
5. Responsive/accessibility/runtime verification.

## Ngoài phạm vi
- Không đổi database, RLS, API, server function hoặc luồng nghiệp vụ.
- Không thêm tính năng mới.
- Không đổi kiến trúc route hoặc navigation information architecture.
- Không sao chép logo, tên hoặc tài sản thương hiệu ClickUp; chỉ áp dụng ngôn ngữ thiết kế đã mô tả.
