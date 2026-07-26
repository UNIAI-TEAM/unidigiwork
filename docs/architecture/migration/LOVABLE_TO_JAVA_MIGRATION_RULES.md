# Lovable → Java Migration Rules

Nguồn: Blueprint §21 (Strangler pattern) và §25.27–§25.30.

## Nguyên tắc bất di

1. Một writer duy nhất mỗi domain. Không dual-write.
2. Contract-first. Chuẩn hóa Lovable domain trước khi Java chạm domain.
3. Shadow-read trước cutover.
4. Cutover command trước, cutover read sau.
5. Khóa đường ghi cũ sau cutover.
6. Xóa compatibility layer sau thời gian ổn định.

## 6 bước bắt buộc

### Bước 1 — Chuẩn hóa Lovable domain
- Chốt schema với tenant_id, row_version, idempotency_key (khi cần).
- Chốt API contract trong src/contracts/.
- Chốt permission + stable errors + events.
- Runtime tests: tenant isolation, RLS, idempotent replay, version conflict, audit, outbox.

### Bước 2 — Java shadow-read
- Java repository đọc cùng bảng qua kết nối read-only.
- So sánh kết quả API Java vs Lovable.
- Java KHÔNG ghi.

### Bước 3 — Cutover command
- Client SDK factory chuyển trỏ command sang JavaXxxApi.
- Java trở thành writer duy nhất.
- Read có thể tạm giữ Lovable.

### Bước 4 — Cutover read
- Read chuyển sang Java.

### Bước 5 — Khóa đường ghi cũ
- Revoke GRANT ghi trên bảng cho role của Lovable server-fn cũ.
- Xóa hoặc disable server-fn cũ.
- CI scanner fail nếu còn caller trực tiếp.
- Audit cutover event.

### Bước 6 — Xóa compatibility layer
- Sau ít nhất 1 sprint ổn định (metric, không rollback).
- Xóa adapter Lovable trong Client SDK.

## Điều kiện dùng chung PostgreSQL trong quá trình chuyển đổi

Chỉ được dùng chung DB nếu:
- Mỗi domain có owner rõ.
- Java không sửa bảng domain chưa cutover.
- Lovable không sửa bảng domain đã cutover.
- Không có hai writer đồng thời.
- Migration có governance (Flyway phía Java, Supabase migrations phía Lovable, không đè lên nhau).

## Cấm

- Không thay backend toàn bộ trong một lần (§25.28).
- Không cutover domain nếu runtime verification chưa PASS (§25.30).
- Không xây Java song song với hai writer (§25.27).
- Không tạo microservice khi chưa có nhu cầu vận hành thật (§25.16).

## Rollback

Mỗi module cutover phải có ADR ghi rõ:
- Cách feature-flag SDK factory quay về LovableXxxApi.
- Revert grant DB nếu đã revoke.
- Điều kiện dữ liệu để rollback không mất mát.
