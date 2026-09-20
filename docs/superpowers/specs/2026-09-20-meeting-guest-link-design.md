# Khách ngoài vào họp bằng link chia sẻ

Ngày: 2026-09-20 · Trạng thái: đã duyệt thiết kế, đang triển khai

## Vấn đề

Link mời họp hiện tại chỉ dùng được trong nội bộ. `redeem_meeting_invite_link`
mở đầu bằng `IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'`,
và `EXECUTE` chỉ cấp cho role `authenticated`. Người ngoài tổ chức — đối tác,
khách hàng, ứng viên — không vào họp được nếu không lập tài khoản nền tảng.

## Quyết định

Ba lựa chọn đã chốt khi thiết kế:

1. **Khách chỉ được A/V + chia sẻ màn hình.** Không chat, không giơ tay, không
   agenda/tài liệu/biên bản, không thấy danh sách nội bộ. Đổi lại, khách **không
   có phiên Supabase** nào cả — không bao giờ chạm vào RLS hay dữ liệu tenant.
2. **Link là đủ, vào thẳng.** Không có phòng chờ duyệt. Kiểm soát bằng thứ đã có
   sẵn trên link: hạn giờ, số lượt dùng, nút thu hồi, và mời ra khỏi phòng.
3. **Cờ `allow_guests` trên từng link, mặc định tắt.** Mọi link đã phát đi trước
   đây giữ nguyên ngữ nghĩa nội bộ; không link nào đột nhiên mở cho người lạ.

Phương án bị loại: cấp cho khách một phiên Supabase ẩn danh
(`signInAnonymously`). Nó làm phòng họp đầy đủ chạy được gần như không cần sửa,
nhưng đẩy một principal ẩn danh vào role `authenticated`, buộc phải rà lại RLS
của **mọi** module chứ không riêng module họp. Không đáng với phạm vi cần.

## Kiến trúc

### Danh tính khách

Mỗi lần đổi link thành công sinh một bản ghi `meeting_guests` có `id uuid`.
LiveKit identity là `guest:<id>`, role `participant` (publish được, không
`roomAdmin`). Trình duyệt khách giữ `session_token` mờ trong `sessionStorage`.

Hai bước tách rời có chủ đích:

- **Đổi link** (`redeem_meeting_guest_link`) — tốn một lượt `used_count`.
- **Xin vé** (`issue_meeting_guest_token`) — không tốn lượt.

Nếu gộp làm một, khách rớt mạng ba lần là link hết lượt. Vé LiveKit sống tối đa
15 phút nên một cuộc họp dài luôn phải xin lại vé nhiều lần.

### Lược đồ

```sql
ALTER TABLE meeting_invite_links ADD COLUMN allow_guests boolean NOT NULL DEFAULT false;
ALTER TABLE meeting_join_tokens  ADD COLUMN is_guest     boolean NOT NULL DEFAULT false;

CREATE TABLE meeting_guests (
  id, tenant_id, meeting_id, invite_link_id,
  display_name, session_token_hash (unique),
  expires_at, revoked_at, first_joined_at, last_seen_at,
  created_at, updated_at, row_version
);
```

`meeting_join_tokens.user_id` là `uuid NOT NULL` **không có FK**, nên `guest_id`
ghi thẳng vào đó, dùng lại nguyên vết audit và rate limit 10 vé/phút sẵn có; cờ
`is_guest` để người đọc vết phân biệt được.

`meeting_guests` tenant-scoped. RLS SELECT cho host/cohost của cuộc họp và
tenant_admin/tenant_owner. **Không cấp quyền bảng nào cho role `anon`.**

### Hai RPC mở cho `anon`

Đây là hai RPC đầu tiên của hệ thống cấp `EXECUTE` cho `anon`. Toàn bộ thẩm
quyền nằm trong thân hàm, `SECURITY DEFINER`.

`redeem_meeting_guest_link(_token, _display_name)` kiểm theo thứ tự: token hash
tồn tại → chưa thu hồi → còn hạn → **`allow_guests = true`** → còn lượt → cuộc
họp `status IN ('scheduled','live')` → rate limit theo link → entitlement
`meetings.conference` và quota `meeting_participant_minutes`. Đạt hết thì tạo
guest, tăng `used_count`, ghi outbox `meeting.guest.joined`.

`issue_meeting_guest_token(_session_token)` kiểm guest còn hạn, chưa bị mời ra,
cuộc họp còn joinable, rate limit theo guest; trả `room_name` để server ký vé.

Server fn gọi hai RPC này bằng client **anon-key, không phải service-role** —
giữ đúng luật Blueprint "không service-role trên bảng domain".

### Tầng ứng dụng

- `src/lib/api/supabase-anon.server.ts` — client anon-key phía server (thư mục
  `integrations/supabase/` là file sinh tự động nên không đặt ở đó).
- `src/lib/api/meeting-guest.functions.ts` — `createServerFn` **không có**
  `requireSupabaseAuth`: `joinMeetingAsGuest`, `refreshGuestJoinToken`. Vé
  LiveKit vẫn ký ở server, TTL ≤ 15 phút.
- `src/lib/meeting-guest.ts` — hàm thuần phân loại trạng thái link và kiểm tên
  hiển thị, dùng chung client/server, có test.
- `src/routes/meeting_.$id.guest.tsx` — route riêng. Không nhét nhánh khách vào
  file phòng họp 2.300 dòng hiện tại.

### Chủ toạ nhìn thấy gì

Tile video hiện khách tự động vì khách là participant thật của LiveKit. Nhưng
panel danh sách đọc từ DB qua `listMeetingParticipants`, nên hàm đó phải union
thêm `meeting_guests` đang hoạt động và gắn nhãn "khách". Mời ra = set
`revoked_at` rồi gọi LiveKit `RemoveParticipant`.

Hộp thoại tạo link thêm checkbox "Cho phép người ngoài vào bằng link này", mặc
định tắt, kèm cảnh báo ai cầm được URL đều vào được.

## Rủi ro

**Bề mặt internet mới.** Hôm nay không RPC nào cấp `EXECUTE` cho `anon`. Thiết
kế này mở hai. Lớp bọc: `allow_guests` mặc định tắt, rate limit trong RPC, hạn
giờ và số lượt trên link, vé LiveKit không có `roomAdmin`, TTL 15 phút.

**Đoán token.** Token link dài 64 hex ký tự (hai UUID nối lại), lưu dưới dạng
sha256. Rate limit theo link chặn dò vét.

**Hạn mức.** Khách tiêu `meeting_participant_minutes` như người nội bộ; kiểm
entitlement trước khi tạo guest.

## Kiểm thử

- Unit cho hàm thuần: phân loại link (hợp lệ / hết hạn / hết lượt / thu hồi /
  `allow_guests=false` / không tồn tại), kiểm tên hiển thị.
- Integration SQL `tests/integration/NN_meeting_guest_link.sql` theo mẫu
  `BEGIN/ROLLBACK`, in `=== PASS`.
- Chạy lại `test:tenant`, `test:rls`, `gate:domain-sdk`, `typecheck`, `build`.
