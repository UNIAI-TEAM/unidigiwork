# UNIWORK — STATIC PERFORMANCE HOT-SPOT FINDINGS

Phương pháp: ripgrep toàn bộ `src/` theo pattern §4 của master prompt.

## P0

| ID | Vị trí | Vấn đề | Fanout ước tính @5.000 users |
|---|---|---|---|
| SF-001 | `src/components/chat/chat-workspace.tsx:418` (cũ) `channel("chat-global")` | `postgres_changes` trên toàn bảng `chat_messages`, `chat_channels`, `chat_members` **không filter** → mọi client nhận mọi tin nhắn của mọi tenant-scope Realtime, mỗi event kéo theo `invalidateQueries(["chat","channels"])` | 1 tin nhắn → tối đa 5.000 event + 5.000 refetch | 
| SF-002 | `src/lib/use-unread-counts.ts:69` `channel("unread-counts-sync")` | Global subscribe `chat_messages` + `chat_members` + `email_states`, hook được mount ở app shell → **mọi user online** | 1 tin nhắn → 5.000 invalidate → 5.000 lần gọi `getUnreadCounts` |
| SF-003 | `src/lib/api/unread-counts.functions.ts` (cũ) | N+1: 1 query membership + tối đa **200 count query** mỗi lần gọi; poll 60s + refetchOnWindowFocus | 5.000 users × 200 = 1.000.000 query/phút ở worst case |

## P1

| ID | Vị trí | Vấn đề |
|---|---|---|
| SF-004 | `src/routes/pricing.tsx:139`, `src/components/workspace-switcher.tsx:29` | `invalidateQueries()` không key → refetch toàn bộ cache. Tần suất thấp (checkout / đổi workspace) nhưng gây burst fanout khi nhiều user cùng đổi ngữ cảnh |
| SF-005 | `workspace_members` | Không có index `(user_id)`; PK là `(workspace_id, user_id)` → mọi tra cứu "workspace của tôi" là seq scan (đã ghi nhận 382 seq_scan) |
| SF-006 | `src/lib/api/ai-chat.functions.ts:602` `.limit(5000)`, `:503/:727 .limit(1000)` | Payload lớn, không phân trang cursor |
| SF-007 | `.limit(500)` tại `calendar.functions.ts:56,65`, `chat.functions.ts:561`, `meeting-rooms.functions.ts:69`, `demo-requests.functions.ts:28` | Không giới hạn theo cửa sổ thời gian / cursor |
| SF-008 | Email search dùng `ilike '%kw%'` trên `email_messages.subject/body` | Chưa có index trgm cho `email_messages` (đã có cho tasks/documents/meetings/chat_messages) |
| SF-009 | Audit log dùng OFFSET | Deep OFFSET trên bảng tăng nhanh; plan hiện tại đã là Sort + Seq Scan (29 ms với chỉ 384 dòng) |

## P2

| ID | Vị trí | Vấn đề |
|---|---|---|
| SF-010 | 44 chỗ `select("*")` (`admin.functions.ts` 9, `tasks.functions.ts` 7, `knowledge.functions.ts` 5, …) | Payload thừa trên hot list |
| SF-011 | `quota-export-processor.server.ts:193` | `for … await` tuần tự khi xử lý job (chấp nhận được vì worker, nhưng giới hạn throughput) |
| SF-012 | Bundle | Meeting/LiveKit SDK và editor email nằm trong route riêng nhưng chưa xác nhận code-split (xem FRONTEND_BUNDLE_AUDIT.md) |

## P3
- Một số list dùng `count: "exact"` trên hot path (email inbox) — chi phí tăng tuyến tính theo dataset; chuyển `planned`/cursor khi có evidence.
