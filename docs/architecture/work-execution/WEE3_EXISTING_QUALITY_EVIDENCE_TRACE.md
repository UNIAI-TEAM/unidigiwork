# WEE-3 · PHASE 0 — Vết cơ chế chất lượng & bằng chứng ĐANG CÓ

Nguồn khảo sát: `src/lib/api/work-execution.server.ts`, `src/lib/api/ai-tasks.server.ts`,
`src/lib/api/ai-tasks.functions.ts`, `src/domain/ai-context/citations.ts`,
`src/lib/api/ai-governance.server.ts`, bảng `ai_task_executions`, `work_execution_steps`,
`ai_action_proposals`, `audit_events`, `outbox_events`.

| # | Cơ chế | Nơi sống | Phân loại | Ghi chú |
|---|---|---|---|---|
| 1 | `acceptance_criteria` | cột `tasks`, đưa vào prompt GENERATE + VALIDATE | REAL_BUT_INFORMATIONAL | Chỉ là văn bản prompt; không tách từng tiêu chí, không có trạng thái MET/NOT_MET |
| 2 | `source_refs` | `ai_task_executions.source_refs` | REAL_AND_ENFORCED | Sinh từ `validateAnswerCitations`, chỉ nhận source có trong Context Pack |
| 3 | `evidence` JSON | `ai_task_executions.evidence` | PARTIAL | Có model/token/assumptions/limitations/invalidCitations nhưng phẳng, không reconstruct được toàn bộ lượt chạy |
| 4 | Citation validator | `src/domain/ai-context/citations.ts` | REAL_AND_ENFORCED | Gỡ ID bịa khỏi văn bản, trả `invalidIds`; nhưng KHÔNG chặn nghiệm thu |
| 5 | Self-score `validationScore` | `validateDeliverable()` — cùng hạ tầng model, prompt tự chấm | REAL_BUT_INFORMATIONAL | Model tự trả `score`; server chỉ clamp 0..100 và `passed = score >= 70` → **model tự chấm đang là nguồn sự thật** |
| 6 | `assumptions` / `limitations` | model trả về trong JSON GENERATE | REAL_BUT_INFORMATIONAL | Hiển thị, không kiểm chứng |
| 7 | `partialContext` | `AiContextPack.partial` | REAL_BUT_INFORMATIONAL | Có ghi, không ảnh hưởng kết luận chất lượng |
| 8 | `invalidCitations` | evidence JSON | PARTIAL | Được ghi nhưng không có hard gate |
| 9 | Model / token metadata | evidence JSON (`model`, `inputTokens`, `outputTokens`, `durationMs`) | REAL_AND_ENFORCED | Chỉ cho generator; chưa có evaluator |
| 10 | Human review lifecycle | RPC `request_ai_execution_changes`, `accept_ai_task_execution` | REAL_AND_ENFORCED | Con người vẫn là quyền quyết định cuối |
| 11 | Revision | `ai_task_executions.revision` (mỗi lượt một dòng) | REAL_AND_ENFORCED | Dòng riêng ⇒ đã bất biến về cấu trúc, nhưng chưa có bản chất lượng gắn theo revision |
| 12 | Action proposal evidence | `ai_action_proposals.source_refs`, `execution_id` | PARTIAL | Có liên kết đề xuất ↔ lượt chạy; **không** kiểm chứng đối tượng nghiệp vụ đã tạo thật |
| 13 | Governance evidence (WEE-2) | `ai_action_proposals.governance`, `ai_governance_audit` | REAL_AND_ENFORCED | Fail-closed ở proposal-time và confirm-time |
| 14 | Audit | `audit_events` + `logAiTaskAudit` | REAL_AND_ENFORCED | Có run_requested/completed/failed/resumed/step_retried |
| 15 | Outbox | trigger trong các RPC vòng đời | REAL_AND_ENFORCED | Không cần thêm event cho từng chi tiết chấm điểm |
| 16 | Bước VALIDATE | `work_execution_steps` kind=VALIDATE | DUPLICATED | Trạng thái bước và “đạt/không đạt” đang trộn ý nghĩa trong `output.passed` |
| 17 | Evidence Pack | — | MISSING | Không có gói bằng chứng tái dựng được |
| 18 | Hard gates | — | MISSING | Không có cơ chế nào ghi đè điểm số |
| 19 | Outcome (khác Deliverable) | — | MISSING | Hệ thống chỉ biết deliverable |
| 20 | Action verification | — | MISSING | Lời khai của AI = bằng chứng (rủi ro) |
| 21 | Evaluator độc lập | — | MISSING | Cùng một lượt suy luận vừa tạo vừa chấm |
| 22 | Ngưỡng chất lượng | hằng số `70` nằm trong `validateDeliverable` | DEAD (không cấu hình được) | Cần một nơi cấu hình duy nhất, có version |

## Kết luận Phase 0

Đang có: bằng chứng **kỹ thuật** (model, token, nguồn, trích dẫn) và vòng đời con người.
Đang thiếu: bằng chứng **chất lượng có thẩm quyền** — server không tự tính điểm, không đánh giá
từng tiêu chí nghiệm thu, không có hard gate, không kiểm chứng hành động, không có Evidence Pack
tái dựng được, không phân biệt Deliverable với Outcome.

WEE-3 giữ nguyên toàn bộ mục REAL_AND_ENFORCED và **chuyển** mục 1, 5, 8, 12, 16, 22 từ
“thông tin tham khảo” sang “có thẩm quyền do server sở hữu”.
