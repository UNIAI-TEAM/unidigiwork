# Tối ưu danh sách Work Graph

## Mục tiêu
- Task và Work Product tải theo đúng trang cần hiển thị, không nạp trước hàng trăm mục.
- Lọc theo người phụ trách và hạn hoàn thành ngay trên máy chủ.
- Giữ nguyên phân quyền theo tổ chức và quyền xem từng thực thể.

## Thay đổi
1. Tạo truy vấn đọc Work Graph có phân trang tại nguồn, tìm kiếm, tab, người phụ trách và trạng thái hạn; trả tổng số và số liệu tab riêng.
2. Bổ sung danh sách người phụ trách thuộc tổ chức để dùng trong bộ lọc; hỗ trợ “Chưa giao”.
3. Thêm bộ lọc hạn: tất cả, quá hạn, sắp đến hạn, còn hạn và chưa đặt hạn.
4. Trả tên người phụ trách trong từng Task/Work Product và hiển thị gọn trên danh sách.
5. Bổ sung chỉ mục phù hợp cho thứ tự cập nhật và lọc người phụ trách/hạn.
6. Giữ phân trang 25 mục, debounce tìm kiếm, dữ liệu trang trước trong lúc tải trang mới và vùng bấm 44px trên điện thoại.

## Kiểm tra
- Kiểm tra kiểu dữ liệu, định dạng mã và quy tắc kiến trúc.
- Chạy truy vấn với nhiều tab/bộ lọc và xác nhận tổng số chính xác.
- Kiểm tra trên điện thoại 390–440px: bộ lọc, chuyển trang, không tràn ngang.
