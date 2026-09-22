# Chọn người nhận khi nhắn trong công việc

## Kết quả
- Trong tab **Nhóm phụ trách** và khung nhắn nhanh tại **Work Graph**, người gửi chọn một người đang được giao công việc.
- Tin nhắn vẫn nằm trong lịch sử công việc, đồng thời người được chọn nhận thông báo đích danh và mở thẳng đúng công việc.
- Không cho chọn người ngoài nhóm phụ trách hoặc ngoài tổ chức hiện tại.

## Triển khai
1. Thêm lệnh dữ liệu nguyên tử để lưu bình luận, kiểm tra người nhận đang phụ trách task, tạo thông báo và sự kiện outbox trong cùng giao dịch.
2. Bổ sung API tenant-scoped trả danh sách người phụ trách có tên/email cho bộ chọn; toàn bộ kiểm tra quyền chạy phía máy chủ.
3. Thêm bộ chọn người nhận 44px, trạng thái chưa có người phụ trách, loading/error và nhãn Việt/Anh ở cả chat theo task lẫn Work Graph.
4. Sau khi gửi, làm mới lịch sử chat, số tương tác và hộp thông báo; giữ nguyên luồng hỏi UNI AI.
5. Kiểm tra định dạng, kiểu dữ liệu và luồng mobile: chọn người → gửi → tin lưu thật → đúng người nhận thấy thông báo.

## Chi tiết kỹ thuật
- Tạo migration mới, không sửa migration cũ; không ghi trực tiếp từ giao diện.
- RPC xác thực tenant membership, task access và quan hệ `task_assignees` trước khi tạo notification.
- Dùng `idempotency_key` để tránh gửi trùng; Work Graph tiếp tục là projection đọc-only.
