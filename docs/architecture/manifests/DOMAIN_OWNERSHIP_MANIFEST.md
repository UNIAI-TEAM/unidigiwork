# Domain Ownership Manifest

16 bounded context theo Blueprint §6. Mỗi domain có owner tables, owner routes, trusted commands dự kiến, events dự kiến, permission namespace, Java readiness.

Trạng thái Batch 0A: liệt kê **hiện trạng**. Trusted commands và events là **dự kiến** — sẽ được chốt qua ADR ở Batch 0C và các batch sau.

## 1. Identity & Access
- Owner tables: `profiles`, `user_roles`, (Batch 0B: `users`, `external_identities`)
- Owner routes: `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx`
- Trusted commands (dự kiến): `identity.signIn`, `identity.linkExternalIdentity`, `identity.grantPlatformRole`
- Events (dự kiến): `identity.user.created.v1`, `identity.role.granted.v1`
- Permission namespace: `identity.*`, `platform.*`
- Java readiness: HIGH — Keycloak mapping đã chuẩn bị (external_identities)

## 2. Tenant & Subscription
- Owner tables: (chưa) — Batch 0B tạo `tenants`, `tenant_members`; Giai đoạn 1 tạo `plans`, `subscriptions`, `entitlements`, `usage_counters`
- Owner routes: `/admin/tenants` (Giai đoạn 1)
- Trusted commands: `tenant.create`, `tenant.invite`, `subscription.change`, `entitlement.grant`
- Events: `tenant.created.v1`, `subscription.changed.v1`
- Permission namespace: `tenant.*`, `subscription.*`
- Java readiness: HIGH

## 3. Organization & People
- Owner tables: `profiles` (share với Identity), dự kiến `departments`, `teams`
- Owner routes: `src/routes/people.tsx`, `src/routes/people.$id.tsx`
- Trusted commands: `person.updateProfile`, `department.assign`
- Events: `person.updated.v1`
- Permission namespace: `person.*`, `department.*`
- Java readiness: HIGH

## 4. Workspace
- Owner tables: `workspaces`, `workspace_members`
- Owner routes: `src/routes/_authenticated/workspace.$id.tsx`, `workspace.$id.stos.tsx`, `_authenticated/dashboard.tsx`
- Trusted commands: `workspace.create`, `workspace.addMember`, `workspace.transferOwnership`
- Events: `workspace.created.v1`, `workspace.member.added.v1`
- Permission namespace: `workspace.*`
- Java readiness: HIGH

## 5. Project & Task
- Owner tables: (chưa persistent — chỉ mock UI) → Giai đoạn 2
- Owner routes: `src/routes/tasks.tsx`, `src/routes/tasks.$id.tsx`
- Trusted commands: `task.create`, `task.assign`, `task.complete`, `task.reopen`
- Events: `task.created.v1`, `task.completed.v1`, `task.assigned.v1`
- Permission namespace: `task.*`, `project.*`
- Java readiness: HIGH — ứng viên cutover sớm

## 6. Chat & Collaboration
- Owner tables: (chưa persistent)
- Owner routes: `src/routes/chat.tsx`, `src/routes/chat.$channelId.tsx`
- Trusted commands: `chat.postMessage`, `chat.reactMessage`
- Events: `chat.message.posted.v1`
- Permission namespace: `chat.*`
- Java readiness: MEDIUM — realtime cần adapter

## 7. Calendar
- Owner tables: (chưa persistent)
- Owner routes: `src/routes/_authenticated/calendar.tsx`
- Trusted commands: `calendar.event.create`, `calendar.event.reschedule`
- Events: `calendar.event.created.v1`
- Permission namespace: `calendar.*`
- Java readiness: HIGH

## 8. Meeting
- Owner tables: (chưa persistent)
- Owner routes: `src/routes/meeting.tsx`, `src/routes/meeting.$id.tsx`
- Trusted commands: `meeting.create`, `meeting.joinToken`, `meeting.startRecording`
- Events: `meeting.created.v1`, `meeting.recording.completed.v1`
- Permission namespace: `meeting.*`
- Java readiness: MEDIUM — LiveKit token server sẽ nằm ở Java

## 9. Document
- Owner tables: `documents`
- Owner routes: `src/routes/_authenticated/documents.tsx`, `documents.$id.tsx`
- Trusted commands: `document.create`, `document.newVersion`, `document.share`
- Events: `document.created.v1`, `document.version.created.v1`
- Permission namespace: `document.*`
- Java readiness: HIGH — ứng viên cutover (§22)

## 10. Knowledge
- Owner tables: (chưa persistent)
- Owner routes: `src/routes/knowledge.tsx`, `knowledge.$slug.tsx`
- Trusted commands: `knowledge.article.publish`
- Events: `knowledge.article.published.v1`
- Permission namespace: `knowledge.*`
- Java readiness: HIGH

## 11. Workflow
- Owner tables: (chưa persistent)
- Owner routes: `src/routes/workflows.tsx`, `workflows.$id.tsx`
- Trusted commands: `workflow.run`, `workflow.approve`, `workflow.reject`
- Events: `workflow.run.started.v1`, `workflow.run.completed.v1`
- Permission namespace: `workflow.*`
- Java readiness: MEDIUM

## 12. Notification
- Owner tables: `notifications`, `notification_preferences`
- Owner routes: `src/routes/_authenticated/notifications.tsx`, `notifications.$id.tsx`
- Trusted commands: `notification.markRead`, `notification.dismiss`, `notification.emit`
- Events: `notification.emitted.v1`
- Permission namespace: `notification.*`
- Java readiness: HIGH — ứng viên microservice #1 (§22)

## 13. Search
- Owner tables: (index; chưa persistent)
- Owner routes: `src/routes/_authenticated/search.tsx`
- Trusted commands: `search.query` (read-only)
- Events: —
- Permission namespace: `search.*`
- Java readiness: MEDIUM

## 14. Reporting
- Owner tables: (materialized views; chưa persistent)
- Owner routes: `src/routes/reports.tsx`, `reports.$type.tsx`, `reports.index.tsx`
- Trusted commands: `report.export`
- Events: —
- Permission namespace: `report.*`
- Java readiness: HIGH

## 15. AI
- Owner tables: (chưa persistent — sẽ có prompt registry, usage_events)
- Owner routes: `src/routes/ai.tsx`
- Trusted commands: `ai.chat`, `ai.executeAction`
- Events: `ai.action.executed.v1`
- Permission namespace: `ai.*`
- Java readiness: MEDIUM — AI Gateway độc lập (§19)

## 16. Audit & Compliance
- Owner tables: `admin_rules`, (Batch 0B: `audit_events`, `outbox_events`)
- Owner routes: `src/routes/_authenticated/admin.rules.tsx`
- Trusted commands: `audit.record` (chỉ backend), `rule.create`, `rule.update`, `rule.delete`
- Events: `audit.recorded.v1`
- Permission namespace: `audit.*`, `compliance.*`
- Java readiness: HIGH

## Cross-cutting nguyên tắc

- Không domain nào truy cập trực tiếp bảng của domain khác — phải qua contract/server-fn (§6, §25.14).
- Mỗi bảng chỉ có **một** owner domain — writer duy nhất.
