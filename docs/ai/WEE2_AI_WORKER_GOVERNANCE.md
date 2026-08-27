# WEE-2 — AI WORKER RUNTIME GOVERNANCE

Nâng nhân sự AI thành **actor có quản trị ở runtime**: Allowed Tools, Permission Scope,
Risk Policy và Autonomy Level được **thực thi bởi server**, không phải nhãn hiển thị.

## Nguồn chính sách (không nhận từ model)
| Trục | Nguồn |
|---|---|
| Allowed tools | `ai_workers.allowed_tools` (chỉ giữ tool có trong AI Action Layer) |
| Phạm vi | `ai_workers.scope_workspace_ids / scope_project_ids / scope_object_types` + `tenant_id` |
| Tự chủ | `ai_workers.autonomy_policy` (JSONB theo mức rủi ro) |
| Quyền con người | `tenant_members` + `workspace_members` của chính người khởi tạo |
| Phạm vi lượt chạy | execution: tenant, workspace, task gốc, project |

Phạm vi hiệu lực = **GIAO** của ba phạm vi (worker ∩ người dùng ∩ lượt chạy). Không có nhánh hợp.

## Rủi ro do server quyết định
`resolveRiskLevel()` — `src/domain/ai-governance/contracts.ts`:
- `CREATE_EMAIL_DRAFT` → LOW; `CREATE_TASK`/`UPDATE_TASK_FIELDS`/`CREATE_MEETING` → MEDIUM.
- Nâng HIGH khi đổi người phụ trách/hạn của việc `high|urgent`, hoặc họp > 15 người.
- Payload do model sinh **không** được khai báo rủi ro.

## Mức tự chủ
`SUGGEST → PREPARE → EXECUTE_WITH_APPROVAL → AUTO_EXECUTE`.
`AUTO_EXECUTE_ENABLED = false`: mọi thay đổi nghiệp vụ vẫn hạ xuống `REQUIRE_APPROVAL`.
`DENY` cho CRITICAL theo chính sách mặc định.

## Hai cổng kiểm soát ở runtime
1. **Lúc đề xuất** — bước `ACTION` của WEE-1 (`work-execution.server.ts`): đề xuất bị `DENY`
   **không được ghi** vào `ai_action_proposals`; bước ghi `SKIPPED` kèm lý do an toàn.
2. **Lúc xác nhận** — `confirmAiAction`: nạp lại policy hiện tại từ DB và đánh giá lại. Quyền
   bị thu hồi giữa chừng → `ACTION_FORBIDDEN`, đề xuất chuyển `FAILED`.

## Bằng chứng
- `ai_action_proposals.governance` (jsonb): decision, risk, reason code, effective scope, phiên bản policy.
- `ai_action_proposals.ai_worker_id`, `execution_id`.
- `audit_events` với `event_type = ai_worker.policy_evaluated` (phase PROPOSAL/CONFIRMATION).

## Fail-closed
Không có worker, worker tạm dừng, tool lạ, sai tenant, người khởi tạo khác người của lượt chạy,
đối tượng ngoài phạm vi → **DENY**. Thông điệp cho người dùng là `safeReason`, không lộ chi tiết nội bộ.

Kiểm thử: `src/domain/ai-governance/contracts.test.ts` (11 case).
