# PWA UNIWORK theo đúng bộ giao diện mobile đã gửi

## Đánh giá hiện trạng

Đã có:

- Manifest đầy đủ (tên, icon 72→512, maskable, `display: standalone`, `start_url: /m/home`), apple-touch-icon, favicon.
- Vỏ mobile riêng `/m/*` với thanh tab dưới, nút AI nổi, vuốt ngang đổi tab.
- 13 màn mobile: Home, Chat, Tasks, Meet, Email, Compose, Search, More, AI Market, AI Workforce.

Chưa đúng so với thiết kế:

| Thiết kế | Hiện tại |
| --- | --- |
| 5 tab: Home · Chat · **W (giữa)** · **My Box** · More | Home · Chat · Work (giữa) · Meet · More |
| Màn **My AI** (Ask / Do / Brief Me / AI Team) | Chưa có màn hợp nhất, AI nằm rải rác |
| Màn **My Box** (Action / For review / FYI, vuốt để duyệt) | Chưa có hộp việc hợp nhất trên mobile |
| Màn **Work Products** + chi tiết bản mobile | Chỉ có bản desktop |
| Màn chào mừng có nhân vật + Get Started / Sign in | Chưa có |
| Song song sáng và tối | Mặc định tối, bản sáng chưa rà |
| Cài về máy + dùng khi mất mạng | Chỉ cài được, chưa có chế độ ngoại tuyến |

## Kế hoạch triển khai (5 đợt)

### Đợt 1 — Nền PWA
- Đổi `start_url` sang `/m/home` giữ nguyên, thêm `shortcuts` (Home, My Box, My AI) và `theme_color` theo chế độ sáng/tối.
- Thêm chế độ ngoại tuyến bằng `vite-plugin-pwa` (`generateSW`, `registerType: autoUpdate`), một module đăng ký duy nhất có chốt an toàn: không đăng ký khi đang xem thử, trong iframe, khi chạy dev, hoặc khi mở `?sw=off`.
- Điều hướng trang dùng mạng trước; chỉ nội dung tĩnh có băm tên mới lưu đệm; loại trừ `/~oauth`.
- Giữ nguyên `sw-push.js` (thông báo đẩy) — không gộp, không xoá.

### Đợt 2 — Thanh tab và vỏ đúng thiết kế
- Đổi 5 tab thành Home · Chat · W · My Box · More; nút W giữa là vòng tròn xanh nổi mở My AI.
- Thanh trên: ảnh đại diện, chuông thông báo có đếm, tiêu đề lớn + phụ đề, ô tìm kiếm bo tròn kèm nút quét.
- Vùng an toàn tai thỏ/thanh dưới, ô bấm ≥ 44px, giữ vuốt ngang đổi tab.

### Đợt 3 — Ba màn chính
- **Home**: lời chào theo giờ, ô tìm kiếm, thẻ "Your AI Team" (số agent đang chạy/đã sẵn/đang chờ), 4 ô số liệu (Việc · Họp · Email · Kết quả công việc), danh sách "Hôm nay".
- **My AI**: 4 tab Ask / Do / Brief Me / AI Team; hộp nhập câu hỏi có nút giọng nói và gửi; 3 gợi ý nhanh; lưới thẻ agent; "Recent Work Products".
- **My Box**: hộp việc hợp nhất Action / For review / FYI, mỗi dòng có biểu tượng loại theo màu, nguồn, giờ, nhãn ưu tiên; vuốt phải để duyệt, vuốt trái để hoãn.

### Đợt 4 — Kết quả công việc trên mobile
- Danh sách: lọc All / Mine / Team / AI-created, chọn loại, sắp xếp, chọn dự án; mỗi dòng có nhãn định dạng DOCX/PPTX/XLSX/PDF, phiên bản, người tạo, ngày.
- Chi tiết: nhãn trạng thái, tóm tắt, ảnh bìa, người tạo, dự án, người góp; ba nút Open · Share · thêm.
- Tái dùng đúng dữ liệu và quyền của module hiện có, không tạo luồng riêng.

### Đợt 5 — Chào mừng, sáng/tối, kiểm thử
- Màn chào mừng cho khách chưa đăng nhập: logo, khẩu hiệu, hai nút Get Started / Sign in.
- Rà toàn bộ màn mobile ở cả chế độ sáng và tối, kiểm tra độ tương phản.
- Kiểm thử thật trên khung 390×844 và 440×956: cài về máy, mở lại khi mất mạng, thông báo đẩy vẫn chạy, không tràn ngang.

## Ghi chú kỹ thuật

- Chỉ dùng token màu trong `src/styles.css`, không viết mã màu trực tiếp.
- Mọi chữ đi qua khoá i18n; mặc định tiếng Việt.
- Không đổi lược đồ dữ liệu, không thêm phụ thuộc ngoài `vite-plugin-pwa`.
- Chế độ ngoại tuyến chỉ hoạt động ở bản đã phát hành, không hoạt động trong khung xem thử.
