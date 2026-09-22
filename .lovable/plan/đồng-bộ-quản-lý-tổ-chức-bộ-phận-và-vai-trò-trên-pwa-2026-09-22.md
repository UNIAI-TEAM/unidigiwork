# Đồng bộ quản lý tổ chức, bộ phận và vai trò trên PWA

## Mục tiêu
Tạo một luồng quản trị mobile-native thống nhất trong `/m/admin`, dùng dữ liệu thành viên thật và phân quyền theo tổ chức đang hoạt động; không mở lại giao diện web.

## Phạm vi triển khai
- Nâng cấp trung tâm Quản trị với ba điểm đến rõ ràng: Tổ chức, Bộ phận, Vai trò & quyền.
- Màn Tổ chức: hiển thị tổ chức hiện tại, danh sách thành viên, tìm kiếm/lọc trạng thái, mời thành viên, tạm dừng/kích hoạt và chuyển chủ sở hữu theo đúng quyền hiện có.
- Màn Bộ phận: tổng hợp bộ phận từ hồ sơ nhân sự thật, xem thành viên từng bộ phận, tạo/đổi tên bộ phận bằng cập nhật hồ sơ có kiểm soát và gán/chuyển thành viên.
- Màn Vai trò & quyền: hiển thị rõ vai trò `Chủ sở hữu / Quản trị / Quản lý / Thành viên / Khách`, mô tả quyền hiệu lực và cho phép đổi vai trò của thành viên được phép quản lý.
- Bổ sung màn chi tiết thành viên để quản trị vai trò tổ chức, trạng thái và bộ phận tại một nơi.
- Chuẩn hóa tiếng Việt/Anh, trạng thái tải/lỗi/rỗng, vùng chạm tối thiểu 44px, không tràn ngang tại 390/440/820px.
- Sửa menu và deep link để mọi điểm vào quản trị tổ chức luôn ở `/m/*`.

## Quyền và an toàn dữ liệu
- Tổ chức đang hoạt động do máy chủ xác định; giao diện không tự chọn `tenant_id` hoặc tự quyết quyền.
- Chủ sở hữu và quản trị tổ chức mới được đổi vai trò/trạng thái; chỉ chủ sở hữu được chuyển quyền sở hữu.
- Thay đổi vai trò/trạng thái tiếp tục qua RPC hiện có, có RLS và bảo vệ chủ sở hữu cuối cùng.
- Thao tác bộ phận dùng API hồ sơ nhân sự thật và quyền quản lý hiện có; không tạo nguồn dữ liệu bộ phận thứ hai.
- Không thay đổi quyền hệ thống `admin/moderator/user`; quyền hệ thống và vai trò tổ chức tiếp tục tách biệt.

## Kỹ thuật
- Mở rộng API đọc thành viên để trả hồ sơ bộ phận cần thiết, hoặc dùng API People hiện có khi đủ dữ liệu.
- Tái sử dụng các lệnh đổi vai trò, đổi trạng thái, chuyển chủ sở hữu, mời thành viên và cập nhật hồ sơ nhân sự.
- Tạo các route mobile-native riêng cho tổ chức, bộ phận, vai trò và chi tiết thành viên; không sửa thủ công cây route sinh tự động.
- Giữ nguyên kiến trúc one-writer, tenant isolation và các kiểm tra quyền phía máy chủ.

## Kiểm thử
- Typecheck, format và diff-check.
- Kiểm tra architecture, tenant isolation và RLS.
- Chạy luồng thật trên 390/440/820px: mở ba màn, lọc, xem chi tiết, đổi bộ phận/vai trò trong phạm vi quyền và xác minh không thoát khỏi PWA.
