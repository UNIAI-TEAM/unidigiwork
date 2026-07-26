# Direct Database Access Manifest

Kết quả quét `supabase.from(...)` và realtime channels trên toàn `src/` tại Batch 0A. Không refactor caller trong batch này — chỉ liệt kê chính xác để lập kế hoạch bọc adapter / thay trusted command ở batch sau.

Nguồn quét: `grep -RIn "supabase.from(" src` và `grep -RIn "supabase.channel\|postgres_changes" src`.

## Callers `supabase.from(...)`

| File | Bảng | Đọc/Ghi | Lifecycle quan trọng? | RLS? | Kế hoạch |
|---|---|---|---|---|---|
| `src/lib/api/emails.functions.ts` | `email_threads`, `email_messages`, `email_states`, `profiles` | R/W | Có (send/draft/state) | Có | **Giữ** — đã ở `createServerFn` + `requireSupabaseAuth` (trusted boundary). Batch 0B thêm `tenant_id`; Batch 0C bọc stable errors + outbox. |
| `src/lib/api/notifications.functions.ts` | `notifications` | R/W | Có (markRead, delete, restore, create) | Có | **Giữ** — server function trusted boundary. Batch 0B thêm `tenant_id` + audit + outbox. |
| `src/routes/_authenticated/documents.tsx` | `documents` | R (list) và có thể W | Đọc: OK theo §9.1; Ghi: cần rà | Có (workspace member) | **Rà lại ở Batch 0C**: nếu chỉ read đơn giản → giữ; nếu có write → chuyển sang `documents.functions.ts`. |

## Callers realtime `supabase.channel` / `postgres_changes`

| File | Bảng subscribe | Ghi chú |
|---|---|---|
| `src/routes/_authenticated/notifications.tsx` | `notifications` (INSERT/UPDATE/DELETE) | Đang subscribe trực tiếp. **Kế hoạch**: bọc qua `RealtimeClient` (`src/platform/realtime.ts`) ở Batch 0C. Không refactor trong Batch 0A. |

## Kết luận Batch 0A

- Tổng caller `supabase.from`: **7 lượt gọi** trong **3 file**.
- Toàn bộ command đã nằm trong server function trusted boundary — **không có direct-write command từ component**.
- Direct read từ component: **1 chỗ** (`documents.tsx`) — cần rà.
- Direct realtime subscribe từ component: **1 chỗ** (`notifications.tsx`) — cần abstraction ở Batch 0C.
- **Không caller nào đang vi phạm §25.11 nghiêm trọng** — nền tảng tương đối sạch để bước vào Batch 0B.

## Ghi chú

Manifest phải cập nhật lại mỗi khi có refactor hoặc thêm module mới. Suggested CI check (Batch 0C): script fail nếu số caller `supabase.from` tăng ngoài whitelist.
