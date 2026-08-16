# Meeting Intelligence V1

Pipeline: Meeting → Transcript (LiveKit captions / recording / nhập tay) → AI artifacts → Work Graph → Action.

## Nguồn sự thật
- Meeting metadata: `public.meetings` (UniWork).
- Media: LiveKit / recording storage (không lưu binary trong DB).
- Transcript: `public.meeting_transcript_segments` (raw, authority).
- AI artifacts (derived): `public.meeting_summaries` — summary, highlights, decisions, action_items, risks, open_questions, followup, sources, `transcript_checksum`, `version`.

## Grounding
- Mỗi decision / action item / risk chỉ được giữ khi có `sourceIds` trỏ tới đoạn transcript có thật (`parseMeetingSummaryOutput` loại bỏ trích dẫn bịa).
- Decision confidence: `EXPLICIT` / `LIKELY` / `UNCLEAR` — không dùng điểm số giả.
- Transcript được đưa vào model dưới dạng DỮ LIỆU; prompt yêu cầu bỏ qua mọi chỉ thị nằm trong transcript (chống prompt injection).

## Stale artifact
`transcript_checksum` được tính tất định từ transcript. UI cảnh báo “Biên bản đã thay đổi” khi checksum khác hiện tại; người dùng tạo lại (tăng `version`).

## Propose ≠ Execute
- AI chỉ đề xuất. Không tự tạo task, không tự gửi email.
- `public.confirm_meeting_action_item` chỉ chạy khi người dùng xác nhận: gọi `create_task` (trusted command, quota + outbox + audit), ghi `meeting_action_item_states`, tạo edge Work Graph `MEETING GENERATES TASK`.
- Idempotency: unique `(meeting_id, item_key)` + idempotency key `meeting-action:<meetingId>:<itemKey>` → bấm hai lần vẫn một task.
- `dismiss_meeting_action_item` cho phép bỏ qua đề xuất sai (không ghi đè trạng thái đã chuyển thành task).
- Follow-up chỉ là bản nháp, sao chép thủ công. Không có đường tự động gửi.

## Bảo mật
- RLS: transcript, summary, action item states đều giới hạn `is_tenant_member(tenant_id)`.
- Ghi transcript yêu cầu là participant/host; ghi summary qua `_meeting_host_guard`.
- Confirm action item kiểm tra workspace cùng tenant với meeting → không thể tạo task xuyên tenant.
