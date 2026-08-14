# UNIWORK Mobile PWA — Kế hoạch & Thiết kế

Mục tiêu: biến UNIWORK thành app cài được trên điện thoại (Add to Home Screen), giao diện mobile-first giống native app, dùng lại toàn bộ dữ liệu và quyền hiện có.

## 1. Phạm vi tính năng (ưu tiên theo giai đoạn)

**Giai đoạn 1 — Cài đặt được + khung mobile**
- Manifest + icon + splash, chạy chế độ standalone (ẩn thanh địa chỉ)
- Bottom Tab Bar 5 mục: Trang chủ · Chat · Công việc · Lịch · Thêm
- Mobile Topbar: workspace switcher, tìm kiếm, chuông thông báo (badge chưa đọc)
- Trang "Thêm": Email, Tài liệu, Knowledge, People, Workflows, Reports, AI, Cài đặt

**Giai đoạn 2 — Trải nghiệm native**
- Nút hành động nổi (FAB) tạo nhanh: task, tin nhắn, cuộc họp, email
- Bottom sheet thay cho dialog trên mobile; vuốt để đánh dấu đọc/lưu trữ
- Pull-to-refresh, skeleton loading, safe-area cho tai thỏ/thanh home
- Danh sách chuyển từ bảng sang thẻ (Tasks, Email, Notifications, Meetings)

**Giai đoạn 3 — Ngoại tuyến & thông báo (tùy chọn, cần anh duyệt riêng)**
- Cache app shell để mở được khi mất mạng, xem dữ liệu đã tải gần nhất
- Push notification (web push) cho mention, task deadline, lời mời họp

## 2. Thiết kế giao diện (duyệt trước khi code)

Ngôn ngữ thiết kế giữ nguyên theo skill UNICOM: nền trung tính, accent xanh đậm, bo góc mềm, đổ bóng nhẹ, lưới 8px, Inter.

Chuẩn mobile bổ sung:
- Vùng chạm tối thiểu 44px, khoảng cách nội dung 16px
- Tab bar cao 56px + safe-area, icon 22px, nhãn 11px, trạng thái active dùng màu primary
- Header dính (sticky) 52px, tiêu đề 17px semibold
- Thẻ danh sách: avatar/icon trái, tiêu đề 1 dòng, phụ đề 1 dòng, meta phải, thanh màu ưu tiên ở cạnh trái khi cần

Màn hình sẽ dựng mẫu để duyệt:
1. Trang chủ mobile (KPI cuộn ngang, việc hôm nay, cuộc họp sắp tới, thông báo)
2. Tasks (thẻ + lọc dạng chip + FAB)
3. Chat (danh sách hội thoại và khung chat toàn màn hình)
4. Lịch (tháng gọn + danh sách sự kiện theo ngày)
5. Trang "Thêm" + Cài đặt

## 3. Kỹ thuật

- Manifest tại `public/manifest.webmanifest` + bộ icon 192/512/maskable + apple-touch-icon
- Thẻ head PWA thêm trong `src/routes/__root.tsx`
- Component mới: `src/components/mobile/bottom-tab-bar.tsx`, `mobile-topbar.tsx`, `mobile-page.tsx`, `mobile-list-item.tsx`, `mobile-sheet.tsx`
- Hook `useIsMobile` để chọn layout; desktop giữ nguyên `AppSidebar`/`AppTopbar`, không đổi logic nghiệp vụ
- Route mới `/more` cho menu điều hướng phụ
- Giai đoạn 3 dùng service worker sinh tự động, chỉ đăng ký ở bản published (không chạy trong preview)

## 4. Không làm
- Không đổi schema database, không đổi server function hiện có
- Không đóng gói native (App Store/Play) ở giai đoạn này
- Không thêm màu/font mới ngoài design token hiện tại

## 5. Cần anh duyệt
- Bộ 5 tab chính ở trên có đúng thứ tự ưu tiên không
- Có làm giai đoạn 3 (offline + push) ngay không hay tách sau
