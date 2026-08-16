# ADR — Meeting AI đề xuất, không tự thực thi

Quyết định: mọi output AI của Meeting Intelligence là PROPOSED. Mutation nghiệp vụ (tạo task, gửi email) chỉ xảy ra sau xác nhận rõ ràng của người dùng và phải đi qua trusted command hiện có (`create_task`), giữ nguyên quota, audit, outbox và provenance Work Graph.

Hệ quả:
- `MEETING_ACTION_AUTO_EXECUTION_ENABLED = NO`, `MEETING_AUTO_SEND_ENABLED = NO`.
- Trạng thái action item: PROPOSED → CONVERTED_TO_TASK | DISMISSED, lưu người xác nhận.
