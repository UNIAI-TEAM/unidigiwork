# ADR-1E-001 — Tích hợp hội nghị trực tuyến bằng LiveKit

- Trạng thái: **Accepted** (chốt thiết kế, chưa triển khai code)
- Ngày: 2026-07-31
- Liên quan Blueprint: §17 (Conferencing), §10–12 (Entitlement/Quota), §15 (Storage), §25.7, §25.8, §25.13, §25.14, §25.15, §25.16
- Thay thế: không

## 1. Bối cảnh

Domain `meetings` đã có schema (`meetings`, `meeting_participants`), RPC lifecycle
(`schedule_meeting`, `update_meeting`, `cancel_meeting`, `set_meeting_rsvp`) và contract
`JoinMeetingTokenRequest` / `JoinMeetingTokenResponse`. Phần còn thiếu là provider media
thực tế. Provider được chọn: **LiveKit**.

## 2. Quyết định

### 2.1 Nguyên tắc bất biến

1. **Token chỉ do server cấp.** Client không bao giờ giữ `LIVEKIT_API_SECRET` và không
   tự ký JWT. Client chỉ nhận `JoinMeetingTokenResponse`.
2. **Provider là dữ liệu, không phải hằng số UI.** `meetings.conference_provider` quyết
   định adapter được dùng; UI không hard-code `"livekit"`.
3. **Secrets backend:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
   `LIVEKIT_WEBHOOK_SECRET`. Đọc bên trong `.handler()`, không đọc ở module scope,
   không commit, không prefix `VITE_`.
4. **Không lưu URL public cố định.** Bản ghi hình lưu qua `StorageObjectRef`
   (`storage_provider`, `bucket`, `object_key`); không lưu binary trong PostgreSQL.
5. **Không dual-write.** Bounded context `meetings` chỉ có một writer: server function
   Lovable Cloud. Webhook LiveKit là input, không phải writer thứ hai — nó đi qua cùng
   một tập RPC.

### 2.2 Schema (Batch LK-DB)

Không tạo bảng "room" riêng. Tái sử dụng `meetings` + `meeting_participants`.

- `meetings.conference_ref jsonb` (đã tồn tại) chứa
  `{ "provider": "livekit", "roomName": "mtg_<meeting_id>", "region": null }`.
- Bảng mới `meeting_join_tokens` — audit-only, tenant-scoped:
  `id, tenant_id, meeting_id, user_id, role, token_fingerprint, issued_at, expires_at,
  correlation_id, idempotency_key, created_at`.
  **Không lưu chuỗi token**, chỉ lưu `token_fingerprint` (sha256 prefix) để truy vết.
- Bảng mới `meeting_recordings` (giai đoạn sau, chỉ tạo khi bật recording):
  `id, tenant_id, meeting_id, storage_provider, bucket, object_key, duration_s,
  size_bytes, status, row_version, created_at, updated_at, created_by, updated_by`.
- Mọi bảng mới: `tenant_id` NOT NULL, RLS bật, GRANT tường minh cho `authenticated`
  và `service_role`; policy giới hạn theo participant của meeting trong tenant.

### 2.3 Entitlement & Quota

- Feature key: `meetings.conference` (bật/tắt hội nghị), `meetings.recording`.
- Meter: **`meeting_participant_minutes`** là meter tính phí chính (số phút × số người
  tham gia). `meeting_minutes` giữ vai trò meter phụ, phục vụ báo cáo.
- Kiểm tra bằng `check_quota` trước khi cấp token; vượt hạn mức trả `QUOTA_EXCEEDED`
  với metadata chuẩn (`meter_key`, `quota_limit`, `current_usage`).
- Không hard-code tên plan ở bất kỳ đâu.

### 2.4 Contract

Giữ nguyên `JoinMeetingTokenRequest` / `JoinMeetingTokenResponse` trong
`src/contracts/meetings/meeting.ts`. Không đổi contract ⇒ không cần version mới.

Bổ sung stable error codes (đã thêm vào `STABLE_ERROR_CODES`):

| Code | Ý nghĩa | HTTP tương đương |
| --- | --- | --- |
| `MEETING_ACCESS_DENIED` | Caller không phải participant / khác tenant | 403 |
| `MEETING_NOT_JOINABLE` | Trạng thái meeting là `ended` hoặc `canceled` | 409 |
| `MEETING_TOKEN_ISSUE_FAILED` | Ký token thất bại (cấu hình sai, key hỏng) | 500 |
| `CONFERENCE_PROVIDER_UNAVAILABLE` | Provider chưa cấu hình hoặc down | 503 |
| `ENTITLEMENT_DENIED` | Plan không bật `meetings.conference` | 402/403 |
| `QUOTA_EXCEEDED` | Vượt `meeting_participant_minutes` | 429 |

### 2.5 Trusted boundary (Batch LK-API)

`src/lib/api/meetings.functions.ts` bổ sung:

- `requestJoinToken` (POST, `requireSupabaseAuth`) — thứ tự kiểm tra bắt buộc:
  1. Meeting tồn tại, `deleted_at IS NULL`, thuộc tenant đang hoạt động.
  2. Caller là participant hoặc host ⇒ map sang role LiveKit.
  3. Status ∈ {`scheduled`, `live`} ⇒ ngược lại `MEETING_NOT_JOINABLE`.
  4. `entitlements.can('meetings.conference')`.
  5. `check_quota('meeting_participant_minutes', delta)`.
  6. Ký JWT LiveKit trong `.handler()`, TTL ≤ 15 phút.
  7. Ghi `meeting_join_tokens` + `audit_events` + `outbox_events`
     (`meeting.join_token.issued`) trong cùng transaction.
- `startMeeting` / `endMeeting`: chuyển `scheduled → live → ended`, kiểm tra
  `row_version`, ghi usage.
- Webhook `src/routes/api/public/hooks/livekit.ts`: verify HMAC bằng
  `LIVEKIT_WEBHOOK_SECRET` (so sánh timing-safe trên raw body) **trước** khi parse;
  idempotent theo `event.id` qua `idempotency_key` của outbox.

Ánh xạ quyền:

| Role ứng dụng | Grants LiveKit |
| --- | --- |
| `host` | `roomJoin`, `canPublish`, `canPublishData`, `canSubscribe`, `roomAdmin` |
| `moderator` | `roomJoin`, `canPublish`, `canPublishData`, `canSubscribe`, `roomAdmin` |
| `participant` | `roomJoin`, `canPublish`, `canPublishData`, `canSubscribe` |
| `viewer` | `roomJoin`, `canSubscribe` |

### 2.6 SDK & UI (Batch LK-UI)

- `src/sdk/meetings/index.ts`: adapter `lovable` gọi server function thay cho
  `notImplemented()`; adapter `java` vẫn `assertJavaConfigured()`.
- `src/routes/meeting.$id.tsx`: `@livekit/components-react` + `livekit-client` nạp động
  sau hydrate (`ClientOnly` + `React.lazy`) vì SDK là browser-only; import tĩnh sẽ vỡ SSR.
- Chuỗi UI đi qua i18n, lỗi hiển thị theo stable error code.
- Guard kiến trúc hiện có (`route components do not fabricate LiveKit tokens`) phải tiếp
  tục PASS: route chỉ được gọi SDK, không import `AccessToken` của server SDK.

### 2.7 Portability (Blueprint §21)

LiveKit là self-hostable ⇒ không tạo vendor lock-in mới. Nhánh Java tương lai chỉ cần
cài lại `requestJoinToken` với cùng contract; `LIVEKIT_URL` là biến môi trường nên
chuyển từ LiveKit Cloud sang self-host không cần đổi schema hay contract.

## 3. Phương án đã cân nhắc và loại

- **Ký token ở client bằng key rút gọn** — vi phạm §25.15, loại.
- **Bảng `meeting_rooms` riêng** — trùng vòng đời với `meetings`, tạo nguy cơ dual-write; loại,
  dùng `meetings.conference_ref`.
- **Lưu token đầy đủ để debug** — token là credential; chỉ lưu fingerprint.
- **Daily.co / Twilio Video** — không self-host được, xung đột yêu cầu portability on-prem.

## 4. Definition of Done cho chuỗi batch LK

- Tenant isolation: user tenant B xin token cho meeting tenant A ⇒ `MEETING_ACCESS_DENIED`.
- Non-participant ⇒ denied. Meeting `canceled`/`ended` ⇒ `MEETING_NOT_JOINABLE`.
- Entitlement tắt ⇒ `ENTITLEMENT_DENIED`. Vượt quota ⇒ `QUOTA_EXCEEDED` kèm metadata.
- Webhook replay 2 lần ⇒ chỉ ghi usage 1 lần.
- Token TTL ≤ 15 phút, `meeting_join_tokens` không chứa chuỗi token.
- Build, typecheck, architecture tests, isolation matrix PASS.
- Có tài liệu migration sang Java và kịch bản rollback (tắt entitlement
  `meetings.conference` để vô hiệu hóa toàn bộ tính năng).

## 5. Thứ tự triển khai

| Batch | Nội dung | Điều kiện tiên quyết |
| --- | --- | --- |
| LK-0 | ADR này + stable error codes + gỡ khóa dependency | Xong |
| LK-DB | Migration `meeting_join_tokens`, entitlement key, quota meter | LK-0 |
| LK-API | `requestJoinToken`, `startMeeting`/`endMeeting`, webhook | LK-DB + secrets |
| LK-UI | Phòng họp trong `/meeting/$id` | LK-API |
| LK-TEST | Integration + isolation matrix | LK-UI |

## 6. Điểm còn mở (không chặn LK-DB)

1. LiveKit Cloud hay self-host cho môi trường production đầu tiên.
2. Có bật recording ngay ở LK-API hay hoãn sang batch riêng.
3. Hạn mức mặc định của `meeting_participant_minutes` cho từng plan.