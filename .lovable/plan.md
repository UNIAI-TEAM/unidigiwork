# Đợt 3 PWA — hoàn tất các màn mobile-native

## Phạm vi

- Giữ nguyên danh sách và chi tiết Task mobile-native đã hoàn tất; sửa các liên kết còn thoát sang giao diện web.
- Bổ sung các điểm đến `/m/*` cho các nhóm còn thiếu: Lịch, Dự án, Quy trình, Knowledge/AI Brain/Skills/Agents, Nhân sự/Human Agent, Quản trị họp, CEO/Báo cáo, Phê duyệt/Quyết định, Quản trị và Thanh toán.
- Chuyển menu PWA và mọi liên kết chéo trong PWA sang đường dẫn mobile tương ứng.

## Thiết kế trải nghiệm

- Dùng một Mobile Sheet Shell thống nhất: tiêu đề gọn, tìm kiếm/lọc dạng sheet, danh sách thu gọn, chi tiết theo tab hoặc sheet toàn màn hình.
- Tái sử dụng dữ liệu và thao tác thật hiện có; không sao chép nghiệp vụ, không tạo dữ liệu mẫu, không thay đổi quyền.
- Giữ giao diện đen/trắng Native AI đã khóa, vùng chạm tối thiểu 44px và không tràn ngang ở 390–820px.

## Kỹ thuật

- Tạo route mobile riêng cho từng điểm đến và adapter hiển thị mobile dùng API/RPC hiện có.
- Không nhúng hay bọc nguyên trang desktop; các trang quản trị chỉ xuất hiện khi backend xác nhận quyền.
- Deep link từ Task, Work Product, Inbox, Search và Work Graph luôn ở namespace `/m` khi đang trong PWA.
- Giữ desktop routes nguyên trạng và không sửa file route sinh tự động.

## Kiểm chứng

- Kiểm tra toàn bộ menu và deep link không còn rơi sang bố cục web.
- Chạy typecheck, định dạng, architecture/domain gates liên quan.
- Kiểm thử các luồng chính tại 390px, 440px và 820px: danh sách → chi tiết → thao tác → quay lại, không overflow.
