# UNIWORK — OPTIMIZATION FIX LEDGER

| ID | Sev | Vấn đề | Thay đổi | File / migration | Trước | Sau | Verify |
|---|---|---|---|---|---|---|---|
| PERF-001 | P0 | `chat-global` subscribe toàn bảng `chat_messages`/`chat_channels`/`chat_members` | Subscribe theo từng `channel_id` mà user là thành viên (tối đa 40 kênh), channel name `chat:list:{id}` | `src/components/chat/chat-workspace.tsx` | 1 tin nhắn → tối đa N event tới mọi client | chỉ thành viên kênh nhận event | typecheck OK; preview chat vẫn nhận tin realtime |
| PERF-002 | P0 | `getUnreadCounts` N+1 (1 + tối đa 200 count query mỗi lần gọi, poll 60s) | Gộp thành RPC `get_unread_counts()` (SQL, STABLE, SECURITY INVOKER, RLS giữ nguyên) | `src/lib/api/unread-counts.functions.ts` + migration | ≤ 201 round-trip DB / user / phút | 1 round-trip | `rpc('get_unread_counts')` trả `{chat:0,email:2}` trên preview |
| PERF-003 | P0 | `unread-counts-sync` subscribe global 3 bảng, mount ở app shell cho **mọi** user online | Channel `unread:user:{uid}` + filter `user_id=eq` trên `chat_members`, `email_states`; giữ poll 60s + refresh khi focus tab để không mất độ tươi | `src/lib/use-unread-counts.ts` | fanout N² (mọi event × mọi user) | fanout tuyến tính theo user | typecheck OK; badge vẫn cập nhật |
| PERF-004 | P1 | `notifications-realtime` không filter `user_id` | Channel `notifications:user:{uid}` + filter `user_id=eq` | `src/routes/_authenticated/notifications.tsx` | mọi user mở /notifications nhận mọi row | chỉ nhận thông báo của mình | typecheck OK |
| PERF-005 | P1 | `invalidateQueries()` không key (xoá toàn cache) | Invalidate theo danh sách key phụ thuộc ngữ cảnh | `src/routes/pricing.tsx`, `src/components/workspace-switcher.tsx` | refetch toàn bộ cache | refetch 5–8 nhóm query | typecheck OK |
| PERF-006 | P1 | `workspace_members` thiếu index `user_id` (382 seq scan) | `workspace_members_user_idx (user_id)` | migration | Seq Scan | Index Scan | migration applied |
| PERF-007 | P1 | Email search `ilike '%kw%'` không index | `email_messages_subject_trgm_idx` (GIN trgm) | migration | Seq Scan | Bitmap Index Scan khi dataset đủ lớn | migration applied |
| PERF-008 | P1 | Đếm inbox chưa đọc / list inbox | `email_states_user_inbox_unread_idx (user_id, folder, is_read)` | migration | Bitmap + filter | index-only phù hợp | migration applied |
| PERF-009 | P2 | Sắp xếp meetings/audit/chat theo thời gian | `meetings_workspace_updated_idx`, `audit_events_tenant_occurred_idx`, `chat_messages_channel_created_idx` | migration | Sort + Seq Scan (audit 29 ms @384 dòng) | index-ordered scan | migration applied |

## Chưa xử lý (cần evidence hoặc thuộc phase sau)
- SF-006/SF-007: `.limit(1000..5000)` trong `ai-chat.functions.ts` và các list 500 → cần chuyển cursor pagination.
- SF-009: audit log dùng OFFSET → chuyển keyset (`occurred_at, id`).
- SF-010: 44 chỗ `select("*")`.
- Rate limiting / backpressure ở tầng server function (chưa có).
