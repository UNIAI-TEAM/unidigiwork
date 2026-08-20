# UNIWORK — Feature Inventory (Phase A)

Ngày: 2026-08-20 · Runtime: Lovable Cloud (Supabase + TanStack Start)
Nguồn: route tree (94 route files), 77 module `src/lib/api/*`, 104 bảng public, artifacts runtime trong `tests/runtime/`.

Trạng thái dùng đúng taxonomy: NOT_IMPLEMENTED / UI_ONLY / MOCKED / PARTIAL / IMPLEMENTED_NOT_VERIFIED / BLOCKED / BROKEN / WORKING / PRODUCTION_READY.

| ID | Domain | Feature | Route | Backend | DB | Runtime evidence | Status |
|---|---|---|---|---|---|---|---|
| F01 | Identity | Sign in/out, session | /auth | supabase auth | auth.users (184) | probe AUTH-01 PASS, UI login → /tasks | WORKING |
| F02 | Tenant | Provision tenant + ws | /onboarding | `provision_tenant` | tenants 81 | probe TEN-01 PASS, SEC.2 46/47 | PRODUCTION_READY |
| F03 | Tenant | Switcher, active tenant | shell | active-tenant.functions | tenant_members 107 | SEC.5 47/47 PASS | PRODUCTION_READY |
| F04 | Tenant | Suspend/archive/roles | /admin/tenant | RPCs | — | SEC.5 C22–C35 PASS | PRODUCTION_READY |
| F05 | Tenant | Invitations | /workspace/invite, /invite/$token | RPC | tenant_invitations **0 rows** | SEC.3 matrix PASS | WORKING |
| F06 | Workspace | CRUD + tags + members | /workspace/* | workspaces.functions | workspaces 70 | CRUD suite WS-* 11/11 PASS_REAL | PRODUCTION_READY |
| F07 | Tasks | CRUD, assign, complete, idempotency, row_version | /tasks, /tasks/$id | tasks.functions + RPC | tasks 53 | CRUD suite TASK-* 17/17 PASS_REAL | PRODUCTION_READY |
| F08 | Tasks | Comments / attachments | /tasks/$id | có bảng | task_comments 0, task_attachments 0 | chưa có runtime proof | IMPLEMENTED_NOT_VERIFIED |
| F09 | Documents | CRUD, share, archive, versions, access log | /documents | documents.functions | documents 38, versions 62, access_logs 0 | CRUD DOC-* 9/9 PASS_REAL; RLS test 10_document 9/9 | WORKING |
| F10 | Meetings | Quản lý (tạo/sửa/hủy/participants/realtime) | /meeting, /meeting/$id | meetings.functions | meetings 23, participants 24 | UI render OK; RPC lifecycle có audit/outbox | WORKING |
| F11 | Meetings | Runtime LiveKit (join/A-V/egress) | /meeting/$id | livekit.server | join_tokens 38, recordings 0 | token server-side OK; **không có bản ghi nào** | IMPLEMENTED_NOT_VERIFIED |
| F12 | Meetings | Intelligence (summary/decisions/actions) | /meeting/$id | meeting-intelligence | transcript_segments 0, summaries 0, artifacts 0 | **chưa từng chạy thật** | IMPLEMENTED_NOT_VERIFIED |
| F13 | Chat | Channel/DM/mention/realtime | /chat | chat.functions | channels 2, messages 4 | UI render OK, dữ liệu rất mỏng | PARTIAL |
| F14 | Email Hub | Inbox/thread/compose/send nội bộ | /email | emails.functions | threads 16, messages 16, states 17 | Đây là **LOCAL DATABASE EMAIL**, không có SMTP/IMAP | PARTIAL |
| F15 | Search | Universal Search V2 | /search | `search_universal` | work_nodes 149 | RPC tồn tại, UI render; latency chưa đo lại | IMPLEMENTED_NOT_VERIFIED |
| F16 | Work Graph | nodes/edges depth-1 | — | work-graph.functions | nodes 149 / edges 159 | quan hệ thật đã có dữ liệu | WORKING |
| F17 | Knowledge | Bài viết + tra cứu | /knowledge | knowledge.functions | knowledge_articles 18 | render thật | WORKING |
| F18 | Decision Hub | — | — | — | không có bảng decision | NOT_IMPLEMENTED |
| F19 | Copilot | Ask UNI (⌘J) grounded | shell | ai-copilot.functions | ai_context_metrics 0 | **Chạy thật qua Playwright**: trả lời grounded "Chưa đủ dữ liệu…" | WORKING |
| F20 | AI Workspace | Chat + usage + export | /ai | ai-chat.functions | ai_conversations 0, ai_messages 0, ai_usage_events 0 | chưa ai dùng thật | IMPLEMENTED_NOT_VERIFIED |
| F21 | AI Action Layer | propose/confirm/execute | /admin/ai-actions | ai-actions.functions | ai_action_proposals 4 | có dữ liệu thật nhưng chưa test lại | PARTIAL |
| F22 | AI Workforce | catalog/hire/KPI | /ai-workforce, /ai-market | ai-tasks, ai-market | ai_workers 3, employments 4, performance 5 | UI + dữ liệu thật | PARTIAL |
| F23 | AI Task Execution | AI nhận & hoàn thành task | /tasks/$id | ai-tasks.functions | **ai_task_executions 0** | chưa từng có lượt chạy | IMPLEMENTED_NOT_VERIFIED |
| F24 | Workflow | builder/trigger/run | /workflows/* | workflows.functions | workflows 3, runs 12, steps 25 | có run thật trong DB | PARTIAL |
| F25 | Notifications | list/read/realtime | /notifications | notifications.functions | notifications 8 | SEC.5 C42–C44 PASS (isolation + cleanup) | WORKING |
| F26 | People | directory, CSV | /people | people.functions | profiles 38 | render thật, còn 6 `notifyComingSoon` | PARTIAL |
| F27 | Admin | tenant/users/plans/quota/backup | /admin/* | admin*.functions | plans 3, entitlements 1377 | RBAC server-side có | WORKING |
| F28 | Billing | plan/subscription/invoice | /billing | billing.functions | subscriptions 81, invoices 231 | **STRIPE_SECRET_KEY MISSING** → không thanh toán thật | PARTIAL |
| F29 | Outbox/Audit | worker + audit | api/public/hooks | outbox-processor | outbox 593, audit 437 | SEC.6 stress 7×25/25 PASS | PRODUCTION_READY |
| F30 | Quota | check/alert/export | /admin/quota | quota* | check_events 159, export_jobs 0 | export job chưa chạy | PARTIAL |
| F31 | PWA | manifest/SW/mobile /m | /m/* | sw-push.js | push_subscriptions 0 | manifest+SW có; offline & push chưa chứng minh | IMPLEMENTED_NOT_VERIFIED |
| F32 | Executive Intelligence | Home brief / reports | /home, /reports | home-brief.server | — | brief thật nhưng trả "không có dữ liệu"; /reports còn 8 `notifyComingSoon` | PARTIAL |
