# Tự tạo Work Product, deadline và task con từ yêu cầu mới

## Mục tiêu
Khi nhân viên gửi một yêu cầu mới trong Tổng hợp chat của task, hệ thống xử lý ngay trong lần gửi đó, không phụ thuộc việc mở lại màn hình.

## Luồng thực hiện
1. Mở rộng bộ phân loại để nhận diện yêu cầu mới và đề xuất tiêu đề, loại Work Product, cùng deadline rõ ràng; nếu người dùng không nêu hạn, dùng hạn mặc định theo chính sách hiện có.
2. Trong một lệnh máy chủ có kiểm tra tổ chức và chống trùng, lưu kết quả phân loại, tạo task con, kế thừa người phụ trách phù hợp, đặt deadline và tạo Work Product DRAFT.
3. Liên kết Work Product với task con và task gốc trong Work Graph bằng quan hệ có nguồn thật từ tin nhắn; phát sự kiện outbox trong cùng giao dịch.
4. Trả ngay ID của task con và Work Product về giao diện; làm mới Tổng hợp chat và Work Graph để kết quả xuất hiện mà không cần tải hoặc mở lại.
5. Hiển thị trạng thái tạo thành công/thất bại trên tin nhắn; lỗi một phần không để giao diện kẹt và lần thử lại không tạo bản trùng.

## Quyền và an toàn
- Chỉ áp dụng cho tin nhắn `TASK_CHAT` được phân loại là yêu cầu mới.
- Tenant, người gửi, task gốc và người nhận đều được kiểm tra ở máy chủ.
- Work Product vẫn là đối tượng độc lập, không biến thành Document.
- Mỗi tin nhắn chỉ tạo tối đa một task con và một Work Product.

## Kiểm tra
- Gửi yêu cầu thật từ tài khoản nhân viên.
- Xác nhận task con có deadline, Work Product xuất hiện trong Work Graph và liên kết đúng nguồn.
- Gửi lại cùng mã chống trùng không tạo thêm dữ liệu.
- Kiểm tra giao diện điện thoại và quyền giữa các tổ chức.
