# ADR-1D-001 — Business Domain Foundation (Tasks · Documents · Meetings · Workflow)

- **Batch**: 1D — Business Domain Foundation
- **Status**: PROPOSED
- **Date**: 2026-07-28
- **Blueprint references**: §5 (Domain Model), §7 (Command Lifecycle), §8 (Event Catalogue), §10–12 (Entitlement/Quota), §25 (Rules), §27 (DoD)
- **Supersedes**: none
- **Related**: ADR Batch 0 (Tenant Foundation), ADR Batch 1B (Tenant Admin), ADR Batch 1C (Billing)

---

## 1. Context

Sau Batch 1C, nền tảng tenant + subscription + entitlement đã sẵn sàng. 4 bounded context nghiệp vụ (**Tasks · Documents · Meetings · Workflow**) hiện vẫn ở mức UI mock hoặc bảng `documents` cũ không đạt chuẩn Blueprint §5.3 (chưa có `tenant_id`, `row_version`, audit, outbox, quota gate).

ADR này chốt:
1. Schema tenant-scoped cho 4 domain.
2. Event catalogue (outbox event types) do 4 domain phát.
3. Stable error code mapping trong `src/contracts/errors.ts`.
4. Command surface (RPC/server function) và ownership.

Ngoài phạm vi: LiveKit SFU, file preview, AI summarization, Java portability (Giai đoạn 2 — Blueprint §21).

---

## 2. Decision

### 2.1 Domain ownership (khớp `DOMAIN_OWNERSHIP_MANIFEST.md`)

| Context | Owner tables | Owner commands | Owner events prefix |
|---|---|---|---|
| Tasks | `tasks`, `task_assignees`, `task_comments` | `create_task`, `update_task`, `transition_task`, `assign_task`, `comment_task` | `task.*` |
| Documents | `documents` (extend), `document_versions`, `document_permissions` | `create_document`, `update_document`, `share_document`, `archive_document` | `document.*` |
| Meetings | `meetings`, `meeting_participants`, `meeting_recordings` (metadata only) | `schedule_meeting`, `update_meeting`, `cancel_meeting`, `rsvp_meeting` | `meeting.*` |
| Workflow | `workflows`, `workflow_runs`, `workflow_steps` | `create_workflow`, `publish_workflow`, `start_workflow_run`, `advance_workflow_step` | `workflow.*` |

**Rule §25.5 (Single Writer)**: mỗi bảng chỉ có 1 domain ghi. Cross-domain đọc qua projection/read model, ghi qua event.

### 2.2 Schema baseline — mọi bảng nghiệp vụ MUST có

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id     uuid NOT NULL              -- filled by trigger tg_<table>_fill_tenant
workspace_id  uuid                       -- NOT NULL với Tasks/Docs/Meetings
row_version   bigint NOT NULL DEFAULT 1  -- bump_row_version trigger
created_by    uuid
updated_by    uuid
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
deleted_at    timestamptz                -- soft delete
```

**RLS pattern** (áp cho mọi bảng nghiệp vụ):
```sql
USING (is_tenant_member(tenant_id) AND deleted_at IS NULL)
WITH CHECK (is_tenant_member(tenant_id))
```
GRANT: `SELECT, INSERT, UPDATE, DELETE TO authenticated; ALL TO service_role`. Không GRANT `anon`.

### 2.3 Domain-specific columns

**Tasks**
```
tasks(status task_status, priority task_priority, title, description,
      due_at, completed_at, parent_task_id, project_id)
task_assignees(task_id, user_id, role, assigned_at)   -- composite PK
task_comments(task_id, author_id, body, edited_at)
```
- ENUM `task_status`: `todo | in_progress | blocked | done | canceled`
- ENUM `task_priority`: `low | normal | high | urgent`
- Transition matrix enforced trong RPC `transition_task`, raise `TASK_INVALID_TRANSITION`.

**Documents** (extend bảng hiện có)
```
documents(+ storage_ref jsonb, + mime_type text, + size_bytes bigint,
          + current_version bigint, + tags text[])   -- giữ content_legacy
document_versions(document_id, version bigint, storage_ref jsonb,
                  author_id, comment, created_at)   -- append-only
document_permissions(document_id, principal_type, principal_id, level)
```
- `storage_ref` = `{ bucket, path, etag }` — adapter `StorageObjectRef` (Blueprint §17).
- `principal_type`: `user | workspace | tenant`; `level`: `view | comment | edit | manage`.

**Meetings**
```
meetings(title, agenda, start_at, end_at, timezone, rrule text,
         location text, conference_provider text, conference_ref jsonb,
         status meeting_status)
meeting_participants(meeting_id, user_id, role, rsvp meeting_rsvp, rsvp_at)
```
- ENUM `meeting_status`: `scheduled | live | ended | canceled`
- ENUM `meeting_rsvp`: `pending | accepted | declined | tentative`
- `rrule` theo RFC 5545. Client-side expansion cho view; DB lưu master + exceptions (giai đoạn sau).
- LiveKit chờ Giai đoạn 2 — Batch 1D giữ `conference_provider` null.

**Workflow**
```
workflows(name, description, definition jsonb, version int,
          status workflow_status, published_at)
workflow_runs(workflow_id, workflow_version int, status run_status,
              context jsonb, started_at, ended_at, correlation_id)
workflow_steps(run_id, step_key, status step_status,
               input jsonb, output jsonb, started_at, ended_at, error)
```
- ENUM `workflow_status`: `draft | published | archived`
- ENUM `run_status`: `pending | running | succeeded | failed | canceled`
- ENUM `step_status`: `pending | running | succeeded | failed | skipped`
- Runtime state machine chạy trong RPC `advance_workflow_step` + outbox events.

### 2.4 Event catalogue (outbox `event_type`)

Format: `<context>.<aggregate>.<verb>`, tense quá khứ. Version qua `outbox_events.event_version`.

| event_type | aggregate | payload keys (v1) |
|---|---|---|
| `task.task.created` | task | task_id, workspace_id, title, priority, created_by |
| `task.task.transitioned` | task | task_id, from_status, to_status, actor_id |
| `task.task.assigned` | task | task_id, assignee_id, role, actor_id |
| `task.task.commented` | task | task_id, comment_id, author_id |
| `task.task.deleted` | task | task_id, actor_id |
| `document.document.created` | document | document_id, workspace_id, folder, mime_type, size_bytes |
| `document.document.updated` | document | document_id, version, actor_id |
| `document.document.shared` | document | document_id, principal_type, principal_id, level |
| `document.document.archived` | document | document_id, actor_id |
| `meeting.meeting.scheduled` | meeting | meeting_id, start_at, end_at, timezone, participants[] |
| `meeting.meeting.updated` | meeting | meeting_id, changed_fields[] |
| `meeting.meeting.canceled` | meeting | meeting_id, reason |
| `meeting.participant.rsvp_changed` | meeting_participant | meeting_id, user_id, rsvp |
| `workflow.workflow.published` | workflow | workflow_id, version, actor_id |
| `workflow.run.started` | workflow_run | run_id, workflow_id, version, correlation_id |
| `workflow.run.completed` | workflow_run | run_id, status, ended_at |
| `workflow.step.advanced` | workflow_step | run_id, step_key, from_status, to_status |

**Rule §25.9**: mọi command mutating MUST enqueue outbox trong cùng transaction. Không phát event ngoài transaction.

**Downstream consumers**: `notifications` (đã có), `usage_events` (quota), `audit_events` (auto). Cross-domain projection tính sau.

### 2.5 Stable error code mapping (bổ sung `src/contracts/errors.ts`)

| Code | HTTP-ish | Khi nào raise |
|---|---|---|
| `TASK_NOT_FOUND` | 404 | Task không tồn tại hoặc không thuộc tenant caller |
| `TASK_INVALID_TRANSITION` | 409 | State machine từ chối |
| `TASK_ASSIGNEE_INVALID` | 400 | User không thuộc workspace |
| `DOCUMENT_NOT_FOUND` | 404 | — |
| `DOCUMENT_VERSION_CONFLICT` | 409 | `expected_row_version` mismatch |
| `DOCUMENT_STORAGE_FAILED` | 502 | Adapter storage lỗi |
| `DOCUMENT_PERMISSION_DENIED` | 403 | Không đủ `level` |
| `MEETING_NOT_FOUND` | 404 | — |
| `MEETING_TIME_INVALID` | 400 | `end_at <= start_at`, timezone/RRULE lỗi |
| `MEETING_RSVP_FORBIDDEN` | 403 | User không nằm trong participants |
| `WORKFLOW_NOT_FOUND` | 404 | — |
| `WORKFLOW_DEFINITION_INVALID` | 400 | DAG chu trình / node thiếu |
| `WORKFLOW_NOT_PUBLISHED` | 409 | Start run trên workflow chưa publish |
| `WORKFLOW_RUN_NOT_FOUND` | 404 | — |
| `WORKFLOW_STEP_INVALID_TRANSITION` | 409 | Step state machine từ chối |
| `QUOTA_EXCEEDED` (đã có) | 402 | Reused across 4 domain |
| `ENTITLEMENT_DENIED` (đã có) | 403 | Feature không có trong plan |
| `VERSION_CONFLICT` (mới, dùng chung) | 409 | Optimistic concurrency mismatch |
| `IDEMPOTENCY_CONFLICT` (mới, dùng chung) | 409 | Cùng `idempotency_key`, payload khác |

Mã lỗi dùng chung giữ nguyên tên; không tạo alias per-domain.

### 2.6 Command surface (server functions Batch 1D-API)

Mỗi command đi qua:
1. `createServerFn` + `.middleware([requireSupabaseAuth])`
2. Zod validate input + `CommandMetadata` (`idempotency_key`, `correlation_id`, `expected_row_version` nếu update)
3. Gọi RPC `SECURITY DEFINER` (owner: service_role)
4. RPC: check tenant membership → check entitlement/quota → validate transition → mutate + bump `row_version` + insert outbox
5. Trả DTO chuẩn từ `src/contracts/<domain>/`

**RPC list (18)**: `create_task`, `update_task`, `transition_task`, `assign_task`, `comment_task`, `create_document`, `update_document_content`, `share_document`, `archive_document`, `schedule_meeting`, `update_meeting`, `cancel_meeting`, `set_meeting_rsvp`, `create_workflow`, `publish_workflow`, `start_workflow_run`, `advance_workflow_step`, `cancel_workflow_run`.

### 2.7 Quota meters mới (bổ sung `features` + `plan_features`)

| meter_key | Đơn vị | Ghi khi |
|---|---|---|
| `tasks.active` | count (gauge) | Tăng khi create, giảm khi delete/complete |
| `documents.storage_bytes` | bytes | Cộng khi upload version, trừ khi archive |
| `meetings.scheduled_per_month` | count/period | Tăng khi `schedule_meeting` |
| `workflows.runs_per_month` | count/period | Tăng khi `start_workflow_run` |

---

## 3. Consequences

**Positive**
- 4 domain lên đúng chuẩn §5.3 → sẵn sàng realtime, audit, portability.
- Event catalogue thống nhất → notifications/usage/audit chỉ cần subscribe.
- Error code stable → UI i18n 1 lần, không phụ thuộc backend impl.

**Negative / Trade-offs**
- Extend bảng `documents` cần data-copy + backfill `storage_ref`.
- 4 domain × ~5 RPC = ~20 server function → chia sub-batch (Tasks, Docs, Meeting, Workflow).
- Workflow engine v1 chỉ DAG tuyến tính; branching phức tạp để Giai đoạn 2.

**Risks & mitigations**
| Risk | Mitigation |
|---|---|
| Dual-write khi UI mock còn tồn tại | Batch 1D-UI xoá mock ngay khi wire SDK, CI gate grep mock |
| Outbox tăng đột biến | `claim_outbox_events` batching + retry; monitor `status='failed'` |
| Quota gauge (`tasks.active`) khó đảo ngược | `usage_counters` recompute nightly từ `count(*)` |
| Extend `documents` mất preview dữ liệu cũ | Giữ `content_legacy`, rollback bằng cách bỏ cột mới |

---

## 4. Rollout plan

```text
Batch 1D-DB       -> 4 migrations (Tasks, Docs extend, Meeting, Workflow)
       |             + ENUM, RLS, triggers fill_tenant, outbox trigger
       v
Batch 1D-CONTRACTS -> src/contracts/{tasks,documents,meetings,workflow}/*
                      + errors.ts bổ sung
       v
Batch 1D-API      -> 18 RPC + server function per domain
       v
Batch 1D-SDK      -> src/sdk/{tasks,documents,meetings,workflow}/*
                     kill mock, mọi caller đi qua SDK
       v
Batch 1D-UI       -> refactor routes hiện có + hook TanStack Query
       v
Batch 1D-GATE     -> checklist: tenant isolation × 4, quota enforcement,
                     outbox event emitted, error code mapping, RLS matrix
```

Rollback: mỗi sub-batch giữ migration `down.sql`; bảng/cột cũ giữ đến sau Batch 1D-GATE PASS.

---

## 5. Definition of Done (Blueprint §27)

- [ ] Migration 4 domain applied, RLS bật, GRANT đủ, không lint warning
- [ ] 100% RPC `SECURITY DEFINER`, EXECUTE giới hạn cho mutation nhạy cảm
- [ ] Contract DTO + Zod schema commit vào `src/contracts/`, error code append vào `errors.ts`
- [ ] SDK layer bao phủ 100% caller — không còn `supabase.from('tasks'|'meetings'|'workflows')` ngoài server function
- [ ] Test matrix: cross-tenant isolation PASS cho 4 domain; quota gate PASS 4 meter
- [ ] Outbox event emitted cho 100% command mutating (assert qua test)
- [ ] Docs cập nhật: `DOMAIN_OWNERSHIP_MANIFEST.md`, `TABLE_CLASSIFICATION_MANIFEST.md`, `EVENT_CATALOGUE.md`

---

## 6. Open questions

1. Workflow trigger runtime: cron `pg_net` hay outbox-consumer worker? → Chốt ở Batch 1D-API dựa trên perf test.
2. `meetings.rrule` expansion: DB view materialized hay client compute? → Client compute cho ≤ 12 tháng; DB view nếu report cần.
3. `documents.storage_bytes` — dùng Supabase Storage bucket policy hay lưu ETag ngoài? → Đề xuất bucket `documents` private + RLS mirror `document_permissions`.

---

## 7. Approvals

- [ ] Architecture Owner
- [ ] Security Owner (RLS + SECURITY DEFINER review)
- [ ] Product Owner (event catalogue phù hợp roadmap)
