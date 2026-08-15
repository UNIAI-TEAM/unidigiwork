# UNIWORK — REALTIME SUBSCRIPTION MAP

Tổng số subscription trong repo: **9** (7 `postgres_changes`, 1 presence, 1 broadcast adapter).

| # | Component | Channel | Table | Filter | Scope | Subscriber ước tính | Fanout risk | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| 1 | `chat-workspace.tsx` | `chat-${channelId}` | chat_messages | `channel_id=eq` | channel | thành viên kênh | LOW | OK |
| 2 | `chat-workspace.tsx` | `chat:list:*` | chat_messages / chat_channels / chat_members | `channel_id=eq` cho từng kênh của user (tối đa 40) | user | 1 user | LOW | **REMEDIATED** (trước là `chat-global`, không filter) |
| 3 | `use-unread-counts.ts` | `unread:user:${uid}` | chat_members, email_states | `user_id=eq` | user | 1 user | LOW | **REMEDIATED** (trước là global 3 bảng) |
| 4 | `tasks.tsx` | `tasks-board-${workspaceId}` | tasks | workspace | workspace | thành viên ws | MEDIUM | OK (theo dõi ws lớn 5.000 members) |
| 5 | `meeting_.$id.tsx` | `meeting-participants-${id}` | meeting_participants | meeting | meeting | ≤ participants | LOW | OK |
| 6 | `meeting_.$id.tsx` | `meeting-status-${id}` | meetings | meeting | meeting | ≤ participants | LOW | OK |
| 7 | `meeting_.$id.tsx` | `meeting-hands-${id}` | – | presence + broadcast | meeting | ≤ participants | LOW | OK |
| 8 | `notifications.tsx` | `notifications-realtime` | notifications | **chưa filter theo user_id** | global-ish | mọi user mở trang | HIGH | **TODO P1** — thêm `filter: user_id=eq.${uid}` |
| 9 | `admin.quota.tsx` | `quota-alert-events` | quota_alert_events | không filter | admin-only | ít | LOW | chấp nhận (admin) |

## Nguyên tắc đặt tên chuẩn (§62)
```
chat:channel:{channelId}
chat:list:{userScopeKey}
unread:user:{userId}
notifications:user:{userId}
email:user:{userId}
workspace:{workspaceId}
meeting:{meetingId}
```
Không subscribe firehose rồi lọc ở browser.

REALTIME_AUDIT_COMPLETE: YES
