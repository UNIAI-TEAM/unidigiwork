# UNIWORK — LIVEKIT / MEETING CAPACITY PLAN

## Kiến trúc hiện tại
- Token **chỉ** cấp từ server (`meeting-rooms.functions.ts`), không sinh ở client — đúng Blueprint.
- Trạng thái phòng đồng bộ qua Realtime: `meeting-participants-{id}`, `meeting-status-{id}`,
  presence `meeting-hands-{id}`.
- Attendance ghi qua RPC (`close_meeting_attendance`, `finalize_meeting_from_provider`).
- Webhook LiveKit: `/api/public/hooks/livekit`, reconcile: `/api/public/hooks/livekit-reconcile`.

## Giới hạn media (không phụ thuộc UniWork)
| Kịch bản | Khuyến nghị | Ghi chú |
|---|---|---|
| ≤ 12 người, camera đủ | OK | SFU simulcast |
| 13–49 người | OK với active-speaker layout + tắt video mặc định | UI hiện tại đã có active speaker |
| 50–200 người | Cần chuyển sang chế độ “webinar”: chỉ host publish, còn lại subscribe | **chưa triển khai** |
| > 200 | Cần LiveKit Cloud / cluster + ingress-egress riêng | ngoài phạm vi hiện tại |

## Điểm nghẽn phía UniWork (không phải media)
1. **Token issuance burst** — 500 người vào phòng trong 60s = 500 lệnh gọi server function + insert
   `meeting_join_tokens`. Cần rate limit + cache token theo (meeting, user).
2. **Presence fanout** — presence `meeting-hands` gửi tới mọi participant; ở 200+ người, mỗi lần
   giơ tay = 200 message. Cần throttle client-side (hiện chưa có).
3. **Attendance polling** — mỗi client poll; ở phòng lớn nên chuyển sang webhook-only reconcile.
4. **Recording** — `meeting_recordings` ghi qua webhook; chưa đo chi phí egress.

## Ngưỡng an toàn đề xuất (chưa benchmark runtime)
- Phòng: ≤ 25 người có video, ≤ 100 người audio-only.
- Đồng thời: ≤ 20 phòng / tenant, ≤ 200 phòng toàn hệ thống — cần verify với LiveKit plan thực tế.

Trạng thái: **NOT_BENCHMARKED** — cần chạy `tests/performance/k6/*` mục join-storm với LiveKit staging.
