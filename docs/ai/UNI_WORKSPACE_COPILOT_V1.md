# UNI WORKSPACE COPILOT V1

Read-only enterprise work copilot của UniWork. Không phải chatbot chung: mỗi câu hỏi luôn đi kèm ngữ cảnh workspace và trả lời có nguồn.

## Kiến trúc
```
UI (UniCopilot panel / AskUniPanel entry)
   → askUniCopilot (server function, requireSupabaseAuth)
      → rate limit (20 req/phút/user)
      → AI Context Engine (buildAiContextPack: Universal Search + Work Graph + entity adapters, RLS-invoker)
      → Lovable AI Gateway (openai/gpt-5.6-sol, streaming, temperature 0.2)
      → parse structured JSON → citation validation → UniCopilotResponse
```
Không có đường đi nào khác tới dữ liệu workspace: Copilot không tự query DB, không dùng service role, không mở rộng ngoài quyền của actor.

## Read-only boundary
- Tool allowlist: `search_workspace`, `get_work_context`, `get_project_context`, `get_task_context`, `get_meeting_context`, `get_email_context`, `get_document_context`, `get_chat_context`, `get_people_context`.
- `countExposedMutationTools() === 0` được kiểm chứng bằng unit test + architecture gate `src/lib/architecture/uni-copilot-readonly.test.ts`.
- Copilot layer không import command/mutation module; write duy nhất được phép là telemetry `ai_context_metrics`.
- Yêu cầu mutation ("giao task", "đánh dấu hoàn thành") → UNI nói rõ V1 chưa được phép thay đổi dữ liệu, không giả vờ đã làm.

## Sáu năng lực
ASK · SUMMARIZE · EXPLAIN · COMPARE · PRIORITIZE · RECOMMEND — nhận diện deterministic ở `detectCopilotIntent()`, mỗi intent có hướng dẫn định dạng riêng trong system prompt.

## Conversation model
- Một hội thoại đang hoạt động, state theo phiên (không tạo bảng mới).
- Budget: 6 lượt gần nhất, 700 ký tự/lượt. Lịch sử chỉ để hiểu ý câu hỏi, **không** là nguồn dữ kiện; mỗi lượt đều rebuild context mới.
- Đổi root entity hoặc đổi tenant → reset hội thoại + hiển thị thông báo chuyển ngữ cảnh.

## Citations
Tái dùng `validateAnswerCitations()`: ID không có trong Context Pack bị gỡ, href phải là đường dẫn nội bộ an toàn. UI render mỗi `[S…]` thành deep link tới `ContextSource.href`; danh sách Nguồn thu gọn/mở rộng.

## Bảo mật
- RLS-invoker toàn bộ; tenant boundary từ cookie tenant đang hoạt động.
- Nội dung nguồn là dữ liệu không đáng tin cậy — system prompt cấm tuân theo mệnh lệnh trong Email/Document/Chat/Meeting.
- Không log nội dung nguồn/prompt; telemetry chỉ số liệu.
- Không render HTML thô; answer render dạng text + segment trích dẫn.

## Chi phí & hiệu năng
Telemetry ghi vào `ai_context_metrics` (operation `COPILOT`): estimated tokens, source count, truncated/partial, latency tổng, `contextMs`, `providerMs`. Xem tại `/admin/ai-context`.
Không có AI call nào khi load trang — chỉ khi người dùng gửi câu hỏi.

## Giới hạn V1
Không action layer, không agent, không multi-entity context, không lưu hội thoại vào DB, không cho user chọn model.
