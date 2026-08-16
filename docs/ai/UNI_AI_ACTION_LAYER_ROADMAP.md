# UNI AI ACTION LAYER — ROADMAP (chưa triển khai)

V1 là read-only. Lớp hành động tương lai phải theo hợp đồng:

```
UNI recommendation
 → proposed action (typed command payload, chưa thực thi)
 → preview (diff/impact, nguồn dữ liệu)
 → user confirmation (explicit, per action)
 → trusted command (server, domain writer duy nhất)
 → audit + outbox event
```

Nguyên tắc bắt buộc khi mở action:
1. Model không bao giờ gọi trực tiếp command; model chỉ đề xuất payload.
2. Mọi command đi qua domain writer hiện có (không dual-write) và ghi `audit_events`.
3. Preview phải hiển thị đối tượng thật + nguồn dẫn tới đề xuất.
4. Idempotency key cho mọi hành động đã xác nhận.
5. Tool registry tách đôi: read tools (V1) và action tools (gated bằng feature flag + entitlement).
6. Denial-by-default: thiếu quyền → không hiển thị đề xuất.

Thứ tự sản phẩm khuyến nghị: MEETING INTELLIGENCE V1 → AI ACTION LAYER V1.
