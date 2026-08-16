# AI ACTION GOVERNANCE V1

## Phân loại rủi ro
- LOW: CREATE_TASK, CREATE_EMAIL_DRAFT
- MEDIUM: UPDATE_TASK_FIELDS, CREATE_MEETING
- HIGH (hoãn): SEND_EMAIL, APPROVE_*, BULK_UPDATE, tích hợp ngoài
- PROHIBITED: mọi DELETE, thay đổi vai trò/bảo mật/tenant

## Tách registry đọc và ghi
- `UNI_COPILOT_READ_TOOLS` (đọc, 0 mutation) — `src/domain/ai-copilot/contracts.ts`
- `AI_ACTION_TOOLS` (ghi, 4 mục, đều `requiresUserConfirmation = true`) — `src/domain/ai-actions/contracts.ts`

Model **không thể** ghi đè `requiresUserConfirmation`; chính sách server thắng. Tool name không nạp động từ database.

## Cổng ý định
Chỉ đề xuất ghi khi câu lệnh có động từ hành động tường minh (tạo/cập nhật/giao/lên lịch/soạn/dời hạn). Câu hỏi tư vấn ("nên làm gì?") chỉ trả lời. "Gửi email" và "xoá" bị chặn kèm giải thích giới hạn V1.

## Phòng vệ prompt injection
Nội dung email/chat/tài liệu là dữ liệu, không phải mệnh lệnh. Prompt trích xuất nêu rõ điều này; và dù model có đề xuất gì, server vẫn:
- chỉ chấp nhận 4 action type trong allowlist,
- luôn yêu cầu xác nhận,
- revalidate quyền theo actor.

## Kiểm thử chính sách
`tests/runtime/ai-actions/{action-policy,security,idempotency,concurrency}.mjs` + `src/domain/ai-actions/contracts.test.ts`.

## Lộ trình
Approval theo vai trò (`requiresApproval = MANAGER`), bulk action, send email có cổng mạnh, workflow agent — đều thuộc V2+, không nằm trong V1.
