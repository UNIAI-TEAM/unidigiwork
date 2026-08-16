# AI ACTION LAYER V1 — IMPLEMENTATION REPORT

## 1. Verdict
PASS (V1 scope) — với 1 hạn chế P1 đã nêu ở mục 9.

## 2–4. Branch / SHA
Nhánh làm việc hiện tại của repo Lovable; SHA do nền tảng quản lý (không có git thao tác trong batch này).

## 5. Files created
- `src/domain/ai-actions/contracts.ts`, `src/domain/ai-actions/contracts.test.ts`
- `src/lib/api/ai-actions.server.ts`, `src/lib/api/ai-actions.functions.ts`
- `src/lib/api/email-draft.server.ts`
- `src/components/ai/action-proposal-card.tsx`
- `tests/runtime/ai-actions/{action-policy,security,idempotency,concurrency}.mjs`
- `docs/ai/AI_ACTION_LAYER_V1.md`, `docs/ai/AI_ACTION_GOVERNANCE_V1.md`, `docs/product/UNI_ACTION_UX_V1.md`, `docs/architecture/ADR_AI_ACTION_PROPOSE_CONFIRM_EXECUTE.md`
- DB: bảng `public.ai_action_proposals`, hàm `public.get_task_snapshot`

## 6. Files modified
- `src/components/ai/uni-copilot.tsx` (cổng ý định + render thẻ đề xuất)
- `src/lib/api/emails.functions.ts` (dùng chung lệnh tạo nháp)

## 7–15. Kiến trúc & chính sách
Propose → Preview → Confirm → Execute; đề xuất lưu server-side (`ai_action_proposals`, RLS theo chủ sở hữu); state machine 8 trạng thái; allowlist tĩnh 4 action, `requiresUserConfirmation = true` không thể ghi đè; registry đọc và ghi tách biệt; actor = người xác nhận, không dùng service role.

## 16–21. Action đã mở
CREATE_TASK (`create_task`), UPDATE_TASK_FIELDS (`update_task`, kèm `assign_task` khi đổi người phụ trách), CREATE_MEETING (`schedule_meeting`), CREATE_EMAIL_DRAFT (lệnh nháp dùng chung Email Hub). Đổi trạng thái task chưa mở trong V1 (sẽ dùng `transition_task`, không raw update).

## 22–27. Giải nghĩa & stale
Người: khớp theo thành viên workspace, trùng tên → hỏi lại, không tự chọn. Ngày: bộ giải nghĩa xác định (thứ trong tuần, mai/hôm nay, dd/mm), không nhận diện được → để trống. Workspace: lấy theo ngữ cảnh actor, cross-tenant bị chặn. Row version chụp lúc propose, so lại lúc confirm → `ACTION_STALE`.

## 28–32. UX
Preview theo trường, chỉnh sửa trước xác nhận, nguồn đề xuất dạng chip, chặn xác nhận khi còn mơ hồ; mobile full-width trong sheet UNI với nút ≥44px; label đầy đủ, Enter trong ô nhập không xác nhận.

## 33–40. Executor & idempotency
4 executor bọc RPC hiện có, không SQL ghi trực tiếp; đọc task qua RPC `get_task_snapshot`. Idempotency key gắn với đề xuất và truyền xuống RPC; replay trả kết quả cũ; khoá trạng thái chống double-confirm.

## 41–49. Bảo mật
Đề xuất bị ràng buộc `user_id`; tenant so khớp; workspace/target ép theo bản ghi server; assignee/participant phải là thành viên; phiên hết hạn → middleware 401; quyền bị thu hồi → `resolveActorWorkspace` chặn; prompt injection không tạo được ghi tự động; action type ngoài allowlist bị từ chối.

## 50–56. Audit / Outbox / Graph / Search / Context
Không tạo hệ sự kiện thứ hai: audit, outbox và projector Work Graph vẫn do RPC nghiệp vụ sinh ra, actor là người xác nhận, provenance đề xuất lưu trong `source_refs`. Đối tượng mới xuất hiện trong Universal Search theo SLO hiện tại.

## 57–60. Tích hợp
UNI Copilot: đã tích hợp đầy đủ. Email Hub: nháp mở được từ kết quả. Project/Meeting context: dùng `rootEntity` để grounding nguồn.

## 61–70. Kết quả kiểm chứng
Kiểm chứng bằng unit + kiểm tra tĩnh (12 test action + 129 test toàn hệ, 4 script runtime PASS). Không confirm → không có bản ghi nghiệp vụ nào được tạo (mọi executor chỉ chạy trong `confirmAiAction`).

## 71–75. Hiệu năng / chi phí
Chi phí LLM chỉ phát sinh ở bước propose (một lần trích xuất tham số, ≤700 token đầu ra). Bước confirm là lệnh nghiệp vụ xác định, không gọi model.

## 76–87. Regression
`bunx vitest run`: 20/20 file, 129/129 test PASS (gồm tenant, RLS gate, architecture gate, Work Graph, AI Context, Copilot, Meeting Intelligence). Typecheck sạch.

## 88–90. Defects & hạn chế
- P0: không có.
- P1: Meeting Intelligence vẫn dùng `confirm_meeting_action_item` (đã có preview + xác nhận tường minh và idempotency ở tầng DB) thay vì đi qua Action Layer — hợp nhất ở batch kế tiếp.
- Hạn chế: chưa kiểm tra trùng lịch khi tạo họp (không giả lập), chưa mở đổi trạng thái task, chưa hỗ trợ bundle nhiều hành động.

## Flags
AI_ACTION_ALLOWED_TOOL_COUNT: 4
AI_ACTION_PROHIBITED_TOOL_COUNT: 13
AI_ACTION_AUTONOMOUS_EXECUTION_ENABLED: NO
AI_ACTION_CONFIRMATION_REQUIRED_FOR_ALL_WRITES: YES
AI_ACTION_PROPOSAL_READY: YES
AI_ACTION_CONFIRMATION_READY: YES
AI_ACTION_EXECUTION_READY: YES
AI_ACTION_PERMISSION_SAFE: YES
AI_ACTION_CROSS_TENANT_SAFE: YES
AI_ACTION_IDEMPOTENCY_GREEN: YES
AI_ACTION_STALE_STATE_SAFE: YES
AI_ACTION_AUDIT_READY: YES
AI_ACTION_OUTBOX_READY: YES
AI_ACTION_WORK_GRAPH_READY: YES
AI_ACTION_MOBILE_READY: YES
AI_ACTION_SEND_EMAIL_ENABLED: NO
AI_ACTION_DELETE_ENABLED: NO
SECURITY_REGRESSION_GREEN: YES
AI_ACTION_LAYER_V1_READY: YES
