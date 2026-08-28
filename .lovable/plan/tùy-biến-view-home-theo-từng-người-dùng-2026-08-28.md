# Tùy biến View Home theo từng người dùng

Hiện tại `/home` là bố cục cố định (Focus, Việc của tôi, Sắp tới, Hộp việc, AI Brief). Trang `/dashboard` đã có sẵn cơ chế lưu tuỳ chỉnh theo user (`user_dashboard_prefs`: bật/tắt khối + thứ tự khối). Giải pháp là tái sử dụng đúng cơ chế đó cho Home, không tạo bảng mới.

## Giải pháp đề xuất

### 1. Bật/tắt và sắp xếp khối
- Mỗi khối trên Home có một khoá cố định: `focus`, `mywork`, `upcoming`, `inbox`, `aibrief`, `quickactions`, `stats`.
- Người dùng bật/tắt từng khối và kéo–thả để đổi thứ tự.
- Lưu vào `user_dashboard_prefs` với `sections` (bật/tắt) và `section_order` (thứ tự), phân biệt Home và Dashboard bằng tiền tố khoá (`home.focus`, …) để hai màn hình không ghi đè nhau.

### 2. Chế độ bố cục (layout density)
- 3 lựa chọn: **Gọn** (1 cột, ưu tiên việc cần làm), **Cân bằng** (mặc định 2 cột), **Rộng** (3 cột trên màn hình lớn).
- Lưu chung trong `sections` dưới khoá `home.layout`.

### 3. Chế độ khởi động (default view)
- Cho phép chọn màn hình mở đầu sau khi đăng nhập: Home, Việc của tôi, Lịch, hoặc Hộp việc.
- Người thích làm việc theo lịch sẽ vào thẳng Calendar, không phải click thêm.

### 4. Bộ lọc cá nhân cho "Việc của tôi"
- Ghi nhớ lựa chọn mặc định: chỉ việc của tôi / cả nhóm, sắp xếp theo hạn hoặc độ ưu tiên, số dòng hiển thị (5/10/20).

### 5. Preset nhanh
- 3 preset một chạm: **Điều hành** (stats + AI brief + hộp việc), **Người thực thi** (focus + việc của tôi + sắp tới), **Tối giản** (chỉ focus + việc của tôi).
- Mỗi preset chỉ là một bộ giá trị `sections` + `order` được ghi đè, người dùng vẫn chỉnh tay sau đó được.

### 6. Trải nghiệm chỉnh sửa
- Nút "Tuỳ chỉnh" ở góc phải header Home mở chế độ chỉnh: khối hiện handle kéo, công tắc bật/tắt, nút "Đặt lại mặc định".
- Lưu tự động khi thay đổi (debounce), có toast xác nhận; trạng thái đồng bộ đa thiết bị vì lưu ở server.
- Trên mobile bỏ kéo–thả, thay bằng nút Lên/Xuống cho dễ thao tác.

## Kỹ thuật
- Dùng lại `getDashboardPrefs` / `saveDashboardPrefs` / `resetDashboardPrefs` trong `src/lib/api/dashboard-prefs.functions.ts`; chỉ thêm namespace khoá `home.*`. Không cần migration.
- Tách các khối Home hiện tại trong `src/routes/_authenticated/home.tsx` thành registry `HOME_SECTIONS` (key → title → component) trong `src/components/home/`, render theo thứ tự từ prefs.
- Mặc định khi chưa có prefs: giữ nguyên bố cục hiện tại, nên người dùng cũ không thấy thay đổi.

## Phạm vi triển khai đề xuất
- Giai đoạn 1: bật/tắt + sắp xếp + đặt lại mặc định (giá trị lớn nhất, rủi ro thấp).
- Giai đoạn 2: layout density + preset.
- Giai đoạn 3: default view sau đăng nhập + bộ lọc cá nhân cho "Việc của tôi".
