# WE-1 · PHASE 0 — Vết tín hiệu đo lường ĐANG CÓ (trước metering)

Nguồn khảo sát: `src/lib/api/work-execution.server.ts`, `ai-tasks.functions.ts`,
`work-quality.server.ts`, bảng `ai_task_executions`, `work_execution_steps`,
`ai_action_proposals`, `audit_events`.

| # | Tín hiệu | Nơi sống | Phân loại | Ghi chú |
|---|---|---|---|---|
| 1 | `started_at` / `completed_at` | `ai_task_executions` | REAL | Mốc thật của thời gian máy |
| 2 | `created_at` / `reviewed_at` | `ai_task_executions` | REAL | Đủ để tính thời gian thực tế (wall time) |
| 3 | `evidence.durationMs` | JSON | PARTIAL | Chỉ đo phần sinh bản bàn giao, không phải cả lượt |
| 4 | `evidence.inputTokens/outputTokens` | JSON | REAL (generator) | Không gồm evaluator |
| 5 | `quality_assessment.evaluator.modelCalls/tokens` | JSON | REAL (evaluator) | Có từ WEE-3 |
| 6 | `evidence.model` | JSON | REAL | Model sinh |
| 7 | `evidence.sourceCount`, `partialContext` | JSON | REAL | Chi phí ngữ cảnh |
| 8 | `work_execution_steps` | bảng | REAL | Đếm bước, bước lỗi, bước chờ xác nhận |
| 9 | `ai_action_proposals.status/confirmed_at` | bảng | REAL | Đo can thiệp của con người ở cổng hành động |
| 10 | `revision` | `ai_task_executions` | REAL | Số vòng làm lại |
| 11 | `quality_score/status/passed`, `outcome` | `ai_task_executions` | REAL | Từ WEE-3 |
| 12 | Số lần retry bước | — | MISSING | `record_work_execution_step` upsert theo `seq`, mất lịch sử retry |
| 13 | Chi phí tiền tệ | — | MISSING | Không có bảng giá token; **không ước lượng** |
| 14 | Đơn vị công việc bán được | — | MISSING | Chỉ có `template_code`, chưa có catalog |
| 15 | Bảng số đo tổng hợp | — | MISSING | Không có nơi truy vấn kinh tế công việc |

## Kết luận Phase 0

Tín hiệu thô đã đủ để đo **thời gian máy, thời gian thực tế, số lần gọi mô hình,
token, số bước, can thiệp của con người, chất lượng và kết quả**. Thiếu: catalog
đơn vị công việc, nơi lưu số đo, và tính lại tất định. WE-1 chỉ bổ sung ba thứ đó —
không thêm tín hiệu bịa, không quy đổi tiền tệ khi chưa có bảng giá thật.
