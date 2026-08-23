# UNIWORK — STABILITY FEATURE INVENTORY

Kiểm kê từ repository thật: 34 route gốc + 48 route `_authenticated`, 78 module `src/lib/api/*.functions.ts|server.ts`, 100+ bảng Supabase có RLS, 4 public API route (`livekit`, `livekit-reconcile`, `process-outbox`, `process-quota-exports`).

| ID | Domain | Route | Backend | Trạng thái runtime | Ưu tiên |
|---|---|---|---|---|---|
| F-01 | Auth | /auth | supabase.auth | PASS_REAL | – |
| F-02 | Tenant | /onboarding | rpc provision_tenant | PASS_REAL | – |
| F-03 | Tenant guard | _authenticated | useActiveTenant | PASS_REAL | – |
| F-04 | Tasks | /tasks | tasks.functions.ts, rpc create_task | RPC PASS_REAL / UI DEAD_CONTROL | P1 |
| F-05 | Documents | /documents | documents.functions.ts | NO_OP khi tạo, 1 query BROKEN | P1 |
| F-06 | Meetings | /meeting | meetings/meeting-rooms.functions.ts | PARTIAL (KPI mock) | P1 |
| F-07 | Email Hub | /email | emails.functions.ts | PARTIAL — chỉ email nội bộ trong DB, KHÔNG gửi ra ngoài; nhãn/tài khoản là mock | P1 |
| F-08 | Search | /search | search_universal RPC | PASS_UI (dữ liệu rỗng) | P2 |
| F-09 | Copilot | ⌘J | ai-copilot.functions.ts | PASS_UI | P2 |
| F-10 | Notifications | /notifications | notifications.functions.ts | PASS_UI | P2 |
| F-11 | Workspaces | /workspace | workspaces.functions.ts | PASS_UI | P2 |
| F-12 | People | /people | people.functions.ts | PASS_REAL (1 thành viên thật) | – |
| F-13 | Billing | /billing | billing.functions.ts | PARTIAL (không Stripe live) | P2 |
| F-14 | Admin | /admin | admin-access.server.ts | FAIL_CLOSED_SAFE | P2 |
| F-15 | Workflows | /workflows | workflows.functions.ts | PASS_UI, trigger chưa verify | P2 |
| F-16 | AI Workforce / Market | /ai-workforce, /ai-market | ai-tasks, ai-market | PASS_UI, `ai_workers=0`, `ai_task_executions=0` | P2 |
| F-17 | LiveKit runtime | /meeting/$id | livekit.server.ts | BLOCKED (không test được trong sandbox) | – |
| F-18 | Transcript / Summary | meeting intelligence | meeting-*.server.ts | UNVERIFIED (0 rows) | P2 |
| F-19 | PWA | /m | manifest + sw-push | PASS_UI, offline UNVERIFIED | P2 |
| F-20 | Outbox worker | /api/public/hooks/process-outbox | outbox-processor.server.ts | 13 event tồn tại, chưa đo tuổi hàng đợi | P2 |
