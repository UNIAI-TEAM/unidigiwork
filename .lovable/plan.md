## Thiết kế tích hợp LiveKit (chốt trước khi triển khai)

Tuân theo Blueprint: §17 (token do server cấp), §25.15, §25.14 (không lưu URL cố định), §25.13 (entitlement, không hard-code plan), §25.7/§25.8 (tenant-scoped + command qua trusted boundary).

### 1. Nguyên tắc bất biến
- Client **không bao giờ** sinh token. Chỉ nhận `{ serverUrl, token, roomName, expiresAt }` từ server function.
- `meetings.conference_provider = 'livekit'`; UI không hard-code provider, chọn adapter theo giá trị này.
- API key/secret lưu bằng secret backend (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`), không commit.
- Ghi hình (nếu có) lưu qua `StorageObjectRef` (provider/bucket/object_key), không lưu URL public, không lưu binary trong Postgres.

### 2. Schema (Batch LK-DB)
Không tạo bảng mới cho room; tái dùng `meetings` + `meeting_participants`.
- `meetings.conference_ref jsonb` (đã có) chứa `{ provider: 'livekit', roomName, region? }`.
- Bảng mới `meeting_join_tokens` (audit-only, tenant-scoped): `id, tenant_id, meeting_id, user_id, role, issued_at, expires_at, correlation_id, idempotency_key`. Không lưu chuỗi token, chỉ lưu hash prefix để truy vết.
- Bảng mới `meeting_recordings` (tuỳ chọn, giai đoạn sau): `tenant_id, meeting_id, storage_provider, bucket, object_key, duration_s, size_bytes, status`.
- Đủ cột chuẩn: `tenant_id, row_version, created_at, updated_at, created_by, updated_by` + RLS theo tenant/participant.

### 3. Contract
Đã có sẵn trong `src/contracts/meetings/meeting.ts`:
`JoinMeetingTokenRequest` / `JoinMeetingTokenResponse` — giữ nguyên, không đổi contract.
Bổ sung stable error codes:
- `MEETING_NOT_JOINABLE` (status ≠ scheduled/live)
- `MEETING_ACCESS_DENIED` (không phải participant)
- `CONFERENCE_PROVIDER_UNAVAILABLE`
- dùng lại `QUOTA_EXCEEDED`, `FEATURE_NOT_ENTITLED`

### 4. Trusted boundary
`src/lib/api/meetings.functions.ts` thêm:
- `requestJoinToken` (POST, `requireSupabaseAuth`): thứ tự kiểm tra
  1. meeting tồn tại, chưa xoá, thuộc tenant hiện hành
  2. caller là participant (hoặc host) → map role LiveKit
  3. `entitlements.can('meetings.livekit')`
  4. `check_quota('meeting_minutes' / 'meeting_participants')`
  5. ký JWT LiveKit trong handler (đọc `process.env` trong handler), TTL ≤ 15 phút, `roomJoin` + grants theo role
  6. ghi `meeting_join_tokens` + audit + outbox `meeting.join_token.issued`
- `startMeeting` / `endMeeting`: chuyển `meetings.status` scheduled → live → ended, ghi usage `meeting_minutes`.
- Webhook LiveKit: `src/routes/api/public/hooks/livekit.ts`, verify HMAC signature, cập nhật status/usage, idempotent theo `event id`.

Map role: host/moderator → `canPublish + canPublishData + roomAdmin`; participant → `canPublish`; viewer → subscribe-only.

### 5. SDK & UI
- `src/sdk/meetings/index.ts`: thay `notImplemented` bằng adapter gọi server fn (provider `lovable`).
- `src/routes/meeting.$id.tsx`: phòng họp dùng `@livekit/components-react` + `livekit-client`, load động sau hydrate (`ClientOnly` + `React.lazy`) vì SDK là browser-only.
- Trạng thái UI: chờ vào phòng → lấy token → join; lỗi hiển thị theo stable error code, i18n, không hard-code chuỗi.

### 6. Kiểm thử / DoD
- Tenant isolation: user tenant B xin token cho meeting tenant A → `MEETING_ACCESS_DENIED`.
- Non-participant → denied. Meeting `canceled`/`ended` → `MEETING_NOT_JOINABLE`.
- Entitlement off → `FEATURE_NOT_ENTITLED`. Quota vượt → `QUOTA_EXCEEDED` với metadata.
- Architecture test hiện có (`route components do not fabricate LiveKit tokens`) phải vẫn PASS.
- Webhook replay 2 lần → chỉ 1 lần ghi usage.

### 7. Thứ tự batch đề xuất
1. **LK-0 (chốt)**: ADR-1E-001 + gỡ khoá dependency LiveKit trong rule Giai đoạn 0.
2. **LK-DB**: migration + RLS + entitlement key + quota meter.
3. **LK-API**: server fn cấp token, start/end, webhook.
4. **LK-UI**: phòng họp trong `/meeting/$id`.
5. **LK-TEST**: integration + isolation matrix.

### Cần anh xác nhận
- LiveKit Cloud hay self-host (ảnh hưởng `LIVEKIT_URL` và nhánh on-prem)?
- Có cần ghi hình (recording) ngay ở batch đầu không?
- Quota tính theo `meeting_minutes` hay `meeting_participant_minutes`?
