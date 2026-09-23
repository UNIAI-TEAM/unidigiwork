# Trang đăng ký theo dõi công việc

## Mục tiêu
Tạo một trang mobile-native riêng để đồng nghiệp tự tìm và đăng ký theo dõi công việc, không cần mở phòng chat hoặc trang chi tiết công việc.

## Phạm vi thực hiện
- Thêm trang `/m/task-following` trong PWA, dùng giao diện thống nhất với các màn mobile-native hiện có.
- Hiển thị hai chế độ: **Đang theo dõi** và **Khám phá công việc**.
- Có tìm kiếm theo tên công việc, lọc trạng thái và phân trang để danh sách lớn vẫn tải nhanh.
- Mỗi dòng hiển thị tên, trạng thái, người phụ trách, hạn chót và số người theo dõi.
- Cho phép **Đăng ký theo dõi** hoặc **Bỏ theo dõi** trực tiếp trên danh sách; cập nhật số lượng ngay sau thao tác.
- Bấm vào công việc sẽ mở chi tiết công việc native; không chuyển sang giao diện web.
- Thêm mục **Theo dõi công việc** trong nhóm Công việc của menu PWA.
- Bổ sung đầy đủ nội dung tiếng Việt và tiếng Anh, trạng thái tải, rỗng và lỗi.

## Kỹ thuật
- Tái sử dụng bảng theo dõi và thao tác đăng ký hiện có, không tạo dữ liệu mẫu.
- Thêm một API đọc theo lô qua RPC tenant-scoped để tránh gọi trạng thái theo dõi riêng cho từng công việc.
- Giữ nguyên phân quyền: chỉ thành viên đang hoạt động của tổ chức và có quyền xem công việc mới thấy hoặc theo dõi công việc đó.
- Mọi thay đổi đăng ký là idempotent; không ảnh hưởng phòng chat, timeline hay người phụ trách.
- Không sửa cây tuyến tự sinh; tuyến mới được tạo bằng file route chuẩn TanStack.

## Kiểm tra hoàn tất
- Kiểm tra đăng ký và bỏ theo dõi bằng dữ liệu thật.
- Kiểm tra chuyển tổ chức chỉ hiện đúng công việc và lượt theo dõi của tổ chức đang chọn.
- Kiểm tra PWA ở 390px, 440px và 820px: không tràn ngang, nút chạm tối thiểu 44px.
- Chạy kiểm tra kiểu dữ liệu, định dạng và các cổng kiến trúc/tenant/RLS liên quan.
