# UNIWORK — PERFORMANCE SURFACE INVENTORY

Ngày: 2026-08-15 · Nguồn: quét repo (81 routes, 43 module server-function, 241 server functions).
Trạng thái benchmark: `NOT_RUN` = chưa có runtime evidence ở tải cao (xem §99 của master prompt).

| ID | Module | Route | Operation | Server function | RPC | Tables | Freq | R/W | Realtime | Cache | Crit | Benchmark |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PS-001 | Auth | /auth | login | Supabase GoTrue | – | auth.users | very high (burst) | R/W | no | none | P0 | NOT_RUN |
| PS-002 | Bootstrap | `_authenticated/route` | resolve tenant | `resolveTenantContext` | – | tenant_members, tenants | very high | R | no | query | P0 | NOT_RUN |
| PS-003 | Bootstrap | app shell | active workspace | `workspaces.functions` | – | workspace_members, workspaces | very high | R | no | query | P0 | NOT_RUN |
| PS-004 | Dashboard | /dashboard | KPI + lists | `dashboard.functions` | – | tasks, meetings, documents, notifications | very high | R | no | query 30s | P0 | NOT_RUN |
| PS-005 | Dashboard | /dashboard | user prefs | `dashboard-prefs.functions` | – | user_dashboard_prefs | high | R/W | no | query | P2 | NOT_RUN |
| PS-006 | Tasks | /tasks | list + filter | `tasks.functions` | – | tasks, task_assignees | very high | R | yes (ws-scoped) | query | P0 | NOT_RUN |
| PS-007 | Tasks | /tasks/$id | detail | `tasks.functions` | – | tasks, task_comments, task_assignees | high | R | no | query | P1 | NOT_RUN |
| PS-008 | Tasks | mutations | create/update/assign | `create_task`,`assign_task`,`update_task` | yes | tasks, audit_events, outbox_events | high | W | no | invalidate | P0 | NOT_RUN |
| PS-009 | Workspaces | /workspace/$id | overview | `workspace-overview.functions` | – | documents, tasks, workspace_members, audit_events | high | R | no | query | P1 | NOT_RUN |
| PS-010 | Calendar | /calendar | month/week | `calendar.functions` | – | meetings, tasks | medium | R | no | query | P1 | NOT_RUN |
| PS-011 | Chat | /chat | channel list | `chat.functions` | – | chat_channels, chat_members, chat_messages | very high | R | yes (channel-scoped) | query | P0 | NOT_RUN |
| PS-012 | Chat | /chat/$id | message page | `chat.functions` | – | chat_messages | very high | R | yes | query | P0 | NOT_RUN |
| PS-013 | Chat | send/edit/react | mutations | `send_chat_message` | yes | chat_messages, notifications, outbox_events | very high | W | fanout | invalidate | P0 | NOT_RUN |
| PS-014 | Unread badge | app shell | counters | `getUnreadCounts` | `get_unread_counts` | chat_messages, chat_members, email_states | very high (poll 60s) | R | yes (user-scoped) | localStorage + query | P0 | OPTIMIZED (PERF-002) |
| PS-015 | Notifications | /notifications | list + mark read | `notifications.functions` | – | notifications | high | R/W | yes (user-scoped cần) | query | P1 | NOT_RUN |
| PS-016 | Email Hub | /email | inbox list | `listEmailMessages` | – | email_states, email_messages, profiles | high | R | yes (user-scoped) | query | P1 | NOT_RUN |
| PS-017 | Email Hub | /email/$id | thread | `getEmailThread` | – | email_threads, email_messages | medium | R | no | query | P1 | NOT_RUN |
| PS-018 | Email Hub | search | ilike | `listEmailMessages` | – | email_messages | medium | R | no | none | P1 | NOT_RUN |
| PS-019 | Email Hub | send | mutation | `sendEmail` | – | email_messages, email_states, notifications | medium | W | fanout | invalidate | P1 | NOT_RUN |
| PS-020 | Documents | /documents | list/search | `documents.functions` | – | documents, document_permissions | medium | R | no | query | P2 | NOT_RUN |
| PS-021 | People | /people | member list | `people.functions` | – | tenant_member_profiles, workspace_members | medium | R | no | query | P2 | NOT_RUN |
| PS-022 | Tenant switch | shell | switch | `active-tenant.functions` | – | tenant_members | medium | R/W | no | full invalidate | P1 | NOT_RUN |
| PS-023 | Audit | /workspace/audit | paginated log | `audit.functions` | – | audit_events | low | R | no | query | P2 | NOT_RUN |
| PS-024 | Meetings | /meetings | list/create | `meetings.functions` | RPC lifecycle | meetings, meeting_participants | medium | R/W | yes (meeting-scoped) | query | P1 | NOT_RUN |
| PS-025 | Meetings | /meeting/$id | join + token | `meeting-rooms.functions` | – | meeting_join_tokens, meeting_attendance | medium | R/W | presence + broadcast | none | P0 | NOT_RUN |
| PS-026 | Search | /search | global search | `global_search` | yes | tasks, documents, meetings, chat_messages | medium | R | trgm | query | P1 | NOT_RUN |
| PS-027 | Billing | /billing, /pricing | plans + invoices | `billing.functions`, `pricing.functions` | – | plans, plan_features, invoices, subscriptions | low | R | no | query | P2 | NOT_RUN |
| PS-028 | Admin | /admin/* | quota, users, trace | `admin.functions` | – | quota_*, users, audit_events | low | R | yes (quota events) | query | P2 | NOT_RUN |
| PS-029 | Workflows | /workflows | list + runs | `workflows.functions` | RPC lifecycle | workflows, workflow_runs, workflow_steps | low | R/W | no | query | P2 | NOT_RUN |
| PS-030 | Outbox | worker | claim/complete | `claim_outbox_events` | yes | outbox_events | continuous | W | no | – | P0 | NOT_RUN |
| PS-031 | AI | /ai | chat completion | `ai-chat.functions` | – | ai_conversations, ai_messages, ai_usage_events | low | R/W | streaming | none | P2 | NOT_RUN |
| PS-032 | PWA | /m/* | 5 tabs | các function ở trên | – | – | high (mobile) | R | user-scoped | query + localStorage | P1 | NOT_RUN |

PERFORMANCE_INVENTORY_COMPLETE: YES
