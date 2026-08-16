# ADR — AI không bao giờ tự thực thi thay đổi nghiệp vụ

Trạng thái: Accepted (AI Action Layer V1)

## Bối cảnh
UNI đã có ngữ cảnh đủ để đề xuất hành động. Rủi ro lớn nhất là để model ghi dữ liệu trực tiếp.

## Quyết định
1. AI chỉ **đề xuất**. Mọi mutation phải qua xác nhận tường minh của người dùng.
2. Một pipeline hành động duy nhất cho mọi write path có AI hỗ trợ (Copilot, Meeting, Email, Project).
3. Executor chỉ bọc lệnh nghiệp vụ tin cậy hiện có (RPC SECURITY DEFINER); cấm SQL ghi riêng cho AI.
4. Actor audit là người xác nhận; AI chỉ là provenance (`origin = UNI_AI`).
5. Allowlist tĩnh 4 action; SEND_EMAIL và mọi DELETE không được đăng ký.
6. Đề xuất lưu server-side; client chỉ gửi `actionId` + các field được phép chỉnh.

## Hệ quả
- Thêm một bước xác nhận cho người dùng (chấp nhận đánh đổi).
- Mọi năng lực ghi mới phải qua registry + test chính sách.
- Không có agent tự trị trong V1.
