# AI ACTION LAYER V1 — Propose · Preview · Confirm · Execute

## Nguyên tắc
UNI không bao giờ tự ghi dữ liệu. Luồng bắt buộc:

```text
User intent → UNI hiểu ngữ cảnh → Proposed Action → Preview → User confirm
→ Trusted domain command (RPC) → Audit + Outbox → Result
```

`AI_AUTONOMOUS_EXECUTION = false` (hard-coded, `src/domain/ai-actions/contracts.ts`).

## Allowlist V1
| Action | Risk | Lệnh nghiệp vụ | Xác nhận |
|---|---|---|---|
| CREATE_TASK | LOW | `create_task` | Bắt buộc |
| UPDATE_TASK_FIELDS | MEDIUM | `update_task` (+ `assign_task`) | Bắt buộc |
| CREATE_MEETING | MEDIUM | `schedule_meeting` | Bắt buộc |
| CREATE_EMAIL_DRAFT | LOW | `createEmailDraftCommand` (dùng chung với Email Hub) | Bắt buộc |

Cấm tuyệt đối V1: SEND_EMAIL, mọi DELETE_*, APPROVE_*, REMOVE_MEMBER, CHANGE_ROLE, CHANGE_SECURITY, ARCHIVE_TENANT, BULK_UPDATE, ADMIN_*.

## Thành phần
- `src/domain/ai-actions/contracts.ts` — allowlist tĩnh, schema từng action, state machine, intent gate. Client-safe.
- `src/lib/api/ai-actions.server.ts` — resolve người/ngày/workspace, trích xuất tham số bằng model, executor bọc RPC.
- `src/lib/api/ai-actions.functions.ts` — `proposeAiAction`, `confirmAiAction`, `cancelAiAction`, `listAiActionProposals`.
- `public.ai_action_proposals` — lưu đề xuất phía server (RLS: chỉ chủ sở hữu).
- `src/components/ai/action-proposal-card.tsx` — preview, chỉnh sửa, xác nhận.

## State machine
`PROPOSED → PREVIEWED → CONFIRMED → EXECUTING → SUCCEEDED | FAILED | EXPIRED | CANCELLED`

Đề xuất không phải business state: không có dữ liệu nghiệp vụ nào thay đổi trước khi `CONFIRMED`.

## An toàn khi xác nhận
1. Server nạp lại đề xuất theo `actionId` + `user_id` (không tin payload client).
2. Ép `workspaceId`/`taskId` theo bản ghi đã lưu; edits chỉ áp cho field cho phép.
3. Revalidate tenant, thành viên workspace, tồn tại target, `row_version`.
4. Khoá trạng thái bằng update có điều kiện → chống double-confirm.
5. Truyền `idempotency_key` xuống RPC; replay trả kết quả cũ.
6. Hết hạn 30 phút → `ACTION_EXPIRED`.

## Không có write path riêng
Executor chỉ gọi RPC/lệnh nghiệp vụ hiện có. Không SQL ghi trực tiếp, không service role, không bypass RLS. Audit/outbox/Work Graph tiếp tục sinh ra từ chính các RPC đó, actor là người dùng đã xác nhận.
