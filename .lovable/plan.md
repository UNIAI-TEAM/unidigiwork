# UNIWORK Mobile PWA — Kế hoạch & Thiết kế

Mục tiêu: biến UNIWORK thành app cài được trên điện thoại (Add to Home Screen), giao diện mobile-first giống native app, dùng lại toàn bộ dữ liệu và quyền hiện có.

## 1. Phạm vi tính năng (ưu tiên theo giai đoạn)

**Giai đoạn 1 — Cài đặt được + khung mobile**
- Manifest + icon + splash, chạy chế độ standalone (ẩn thanh địa chỉ)
- Bottom Tab Bar 5 mục: **Home · Chat · Task · Meet · Email**
- Mobile Topbar: workspace switcher, tìm kiếm, chuông thông báo (badge chưa đọc)
- Trang "Thêm" (từ avatar/menu topbar): Lịch, Tài liệu, Knowledge, People, Workflows, Reports, AI, Thông báo, Cài đặt

**Home (mobile)**
- Màn hình đầu tiên sau mở app: KPI cuộn ngang (việc hôm nay, họp sắp tới, chưa đọc), "Có thể bạn cần làm" dạng thẻ, thông báo gần đây, FAB tạo nhanh

**Chat (mobile)**
- Danh sách hội thoại (channel + DM) với tin nhắn cuối, badge chưa đọc, trạng thái online
- Khung chat toàn màn hình: tin nhắn, thread, mention, đính kèm, gửi nhanh emoji

**Task (mobile)**
- Danh sách task dạng thẻ: trạng thái, ưu tiên, deadline, assignee
- Lọc nhanh: Tất cả · Của tôi · Đến hạn · Hoàn thành
- FAB tạo task: tiêu đề, mô tả, assignee, deadline, ưu tiên

**Meet (mobile)**
- Danh sách họp dạng thẻ: Hôm nay / Sắp tới / Đã kết thúc, hiển thị thời gian, người chủ trì, số người tham dự
- Nút "Tham gia" nổi bật khi cuộc họp sắp/đang diễn ra; RSVP (Tham gia · Có thể · Từ chối) ngay trên thẻ
- Phòng họp LiveKit toàn màn hình tối ưu điện thoại: camera trước/sau, tắt/bật mic, chia sẻ màn hình (nếu thiết bị hỗ trợ), danh sách người tham dự dạng bottom sheet, chat trong phòng
- Tạo cuộc họp nhanh từ FAB: tiêu đề, thời gian, khách mời, tạo link phòng

**Email Hub (mobile)**
- Hộp thư dạng danh sách thẻ (người gửi, tiêu đề, trích đoạn, nhãn, dấu chưa đọc), cuộn vô hạn thay cho phân trang
- Chuyển mailbox/nhãn bằng bottom sheet (Hộp đến, Quan trọng, Đã gửi, Nháp, Lưu trữ, Thùng rác)
- Tìm kiếm và lọc chưa đọc/có đính kèm bằng chip
- Đọc email toàn màn hình: nội dung co giãn theo màn hình, đính kèm dạng thẻ, thanh hành động dưới cùng (Trả lời · Trả lời tất cả · Chuyển tiếp · Lưu trữ · Xóa)
- Soạn email dạng full-screen sheet, tự lưu nháp
- Vuốt trái/phải trên thẻ để lưu trữ hoặc đánh dấu đã đọc (giai đoạn 2)

**Giai đoạn 2 — Trải nghiệm native**
- Nút hành động nổi (FAB) tạo nhanh: task, tin nhắn, cuộc họp, email
- Bottom sheet thay cho dialog trên mobile; vuốt để đánh dấu đọc/lưu trữ
- Pull-to-refresh, skeleton loading, safe-area cho tai thỏ/thanh home
- Danh sách chuyển từ bảng sang thẻ (Tasks, Email, Notifications, Meetings)

**Giai đoạn 3 — Ngoại tuyến & thông báo (tùy chọn, cần anh duyệt riêng)**
- Cache app shell để mở được khi mất mạng, xem dữ liệu đã tải gần nhất
- Push notification (web push) cho mention, task deadline, lời mời họp, email mới

## 2. Thiết kế giao diện (duyệt trước khi code)

Ngôn ngữ thiết kế giữ nguyên theo skill UNICOM: nền trung tính, accent xanh đậm, bo góc mềm, đổ bóng nhẹ, lưới 8px, Inter.

Chuẩn mobile bổ sung:
- Vùng chạm tối thiểu 44px, khoảng cách nội dung 16px
- Tab bar cao 56px + safe-area, icon 22px, nhãn 11px, trạng thái active dùng màu primary
- Header dính (sticky) 52px, tiêu đề 17px semibold
- Thẻ danh sách: avatar/icon trái, tiêu đề 1 dòng, phụ đề 1 dòng, meta phải, thanh màu ưu tiên ở cạnh trái khi cần

Màn hình sẽ dựng mẫu để duyệt:
1. Home mobile (KPI cuộn ngang, việc hôm nay, họp sắp tới, thông báo)
2. Chat (danh sách hội thoại + khung chat toàn màn hình)
3. Task (danh sách thẻ + lọc chip + FAB)
4. Meet (danh sách thẻ + RSVP + phòng họp toàn màn hình)
5. Email Hub (hộp thư + đọc email + soạn email)
6. Menu "Thêm" + Cài đặt

## 3. Kỹ thuật

- Manifest tại `public/manifest.webmanifest` + bộ icon 192/512/maskable + apple-touch-icon
- Thẻ head PWA thêm trong `src/routes/__root.tsx`
- Component mới: `src/components/mobile/bottom-tab-bar.tsx`, `mobile-topbar.tsx`, `mobile-page.tsx`, `mobile-list-item.tsx`, `mobile-sheet.tsx`, `mobile-fab.tsx`
- Hook `useIsMobile` để chọn layout; desktop giữ nguyên `AppSidebar`/`AppTopbar`, không đổi logic nghiệp vụ
- Route mobile: `/m` làm layout, các con `/m/home`, `/m/chat`, `/m/chat/$channelId`, `/m/tasks`, `/m/meet`, `/m/meet/$id`, `/m/email`, `/m/email/$id`, `/m/compose`, `/m/more`
- Meeting và Email dùng lại server function/API hiện có (`meetings`, `emails.functions`), chỉ thay lớp trình bày mobile
- Phòng họp mobile dùng lại LiveKit hiện tại, token vẫn cấp từ server
- Giai đoạn 3 dùng service worker sinh tự động, chỉ đăng ký ở bản published (không chạy trong preview)

## 4. Không làm
- Không đổi schema database, không đổi server function hiện có
- Không đóng gói native (App Store/Play) ở giai đoạn này
- Không thêm màu/font mới ngoài design token hiện tại

## 5. Cần anh duyệt
- Bộ 5 tab chính (Home · Chat · Task · Meet · Email) có đúng thứ tự ưu tiên không
- Có làm giai đoạn 3 (offline + push) ngay không hay tách sau
