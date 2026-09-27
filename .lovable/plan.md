# Trang dịch vụ doanh nghiệp UniWork

## Mục tiêu
Tạo một khu vực dịch vụ công khai, thay nội dung mẫu bằng nội dung đang được quản trị trong CMS và dẫn khách hàng tới biểu mẫu tư vấn tạo Công việc thật.

## Phạm vi triển khai
- Tạo trang `/dich-vu` tổng hợp 5 mảng đã xuất bản: Thành lập doanh nghiệp, Tư vấn pháp lý, Kế toán – thuế, Chữ ký số, Hoá đơn điện tử.
- Tạo trang chi tiết `/dich-vu/{slug}` cho từng mảng, dùng tiêu đề, mô tả, quy trình và nội dung kết nối UniWork từ CMS.
- Mỗi trang chi tiết có điều hướng giữa các dịch vụ, nút yêu cầu tư vấn và biểu mẫu tư vấn hiện có.
- Nối các thẻ dịch vụ trên `/uniwork`, menu đầu trang và chân trang tới khu vực dịch vụ mới.
- Giữ tone xanh UniWork, KOL hiện có, bố cục rõ trên điện thoại, máy tính bảng và desktop.
- Không tự đặt giá. Khi bảng giá chính thức được cung cấp, giá sẽ được cập nhật trong CMS và tự hiển thị trên các trang.

## Kỹ thuật
- Tái sử dụng `cms_entries` và hàm đọc nội dung đã xuất bản; bổ sung truy vấn một dịch vụ theo slug thay vì tạo nguồn dữ liệu mới.
- Dùng route danh mục và route động của TanStack Router; mỗi trang có metadata SEO riêng.
- Trạng thái slug không hợp lệ hiển thị trang không tìm thấy an toàn.
- Không thay đổi schema, quyền truy cập hay luồng tạo yêu cầu tư vấn.

## Kiểm tra
- Kiểm tra đủ 5 đường dẫn từ dữ liệu thật.
- Kiểm tra điều hướng từ `/uniwork` và `/dich-vu`.
- Kiểm tra biểu mẫu tư vấn nhận đúng dịch vụ.
- Kiểm tra 390px, 820px và desktop; không tràn ngang, vùng bấm tối thiểu 44px.
