# Table Classification Manifest

Phân loại **scope** từng bảng public schema hiện có, để quyết định có thêm `tenant_id` hay không trước khi migration ở Batch 0B. Không sửa schema trước khi manifest này được review.

Nguồn: Blueprint §5.3, §5.4, §13.3.

Ký hiệu scope:

- **P** — Platform-scoped (cấu hình toàn platform, không cần `tenant_id`)
- **I** — Identity-scoped (users, external_identities — có thể trải nhiều tenant)
- **T** — Tenant-scoped (bắt buộc `tenant_id` + RLS scoped theo tenant)
- **M** — Membership-scoped (join tenant↔user hoặc workspace↔user, FK + unique)

## Ma trận phân loại (bảng đang có)

| Bảng | Scope | Cần `tenant_id`? | Nguồn backfill | Owner domain | RLS hiện tại | FK strategy | Rủi ro migration |
|---|---|---|---|---|---|---|---|
| `workspaces` | T (đại diện tenant giai đoạn hiện tại) | Có — 1 workspace = 1 tenant mặc định | Tạo `tenants.id` mới cho từng workspace, map 1-1 | Workspace | Owner + member policies | `tenant_id → tenants.id` | Cao — mọi bảng con backfill theo workspace |
| `workspace_members` | M | Không trực tiếp; derive qua `workspace_id` | — | Workspace | member/owner | Composite unique (workspace_id, user_id) | Thấp |
| `profiles` | I | **Không** — profile là identity, có thể xuất hiện ở nhiều tenant | — | Identity | user manages own | `id → auth.users.id` (giữ) | Thấp — không đổi ở Batch 0B |
| `user_roles` | I (role platform) hoặc T (role trong tenant) — cần tách | Cần bảng riêng `tenant_user_roles` sau này | Giữ `user_roles` cho role platform | Identity & Access | `has_role()` | `user_id → auth.users.id` | Trung — không đụng Batch 0B; ADR ở Batch 0C |
| `documents` | T | **Có** | Qua `workspace_id → workspaces.tenant_id` | Document | Workspace member read/write | Thêm `tenant_id → tenants.id` | Trung |
| `notifications` | T | **Có** | Qua `workspace_id`; nếu NULL → fallback `user_id → tenant_members` (fail-closed nếu ambiguous) | Notification | user manages own | Thêm `tenant_id` | Trung — có rows với `workspace_id` NULL |
| `notification_preferences` | I (per-user) — quyết định qua ADR nếu chuyển tenant-scoped | Chưa; giữ per-user ở Batch 0B | — | Notification | user manages own | Giữ | Thấp |
| `email_threads` | T | **Có** | Qua `workspace_id` | Email (Document/Chat con) | Workspace member | Thêm `tenant_id` | Trung |
| `email_messages` | T | **Có** | Qua `thread_id → email_threads.tenant_id` | Email | Workspace member | Thêm `tenant_id` (denorm để RLS nhanh) | Trung |
| `email_states` | T | **Có** (denorm) | Qua `message_id → email_messages.tenant_id` | Email | user manages own | Thêm `tenant_id` | Trung |
| `admin_rules` | T | **Có** — mỗi tenant có rules riêng | Nếu hiện tại platform-wide, cần ADR trước migrate | Audit & Compliance | admin only | Thêm `tenant_id` | Cao — xác định rules hiện tại thuộc tenant nào |

## Bảng mới sẽ tạo ở Batch 0B

| Bảng | Scope | Ghi chú |
|---|---|---|
| `tenants` | root | id, name, slug, plan_ref, created_at |
| `tenant_members` | M | (tenant_id, user_id, roles[]) |
| `users` (internal) | I | Mapping ổn định với `auth.users.id` qua `external_identities` |
| `external_identities` | I | provider (`supabase`/`keycloak`), provider_subject |
| `audit_events` | T | Blueprint §12.1 |
| `outbox_events` | T | Blueprint §12.2 |

## Quy tắc backfill (thi hành ở Batch 0B)

1. Fail-closed khi không xác định được `tenant_id`. Không suy đoán.
2. `row_version = 1` cho toàn bộ dòng hiện có.
3. `created_by` / `updated_by` = actor xác định được (owner workspace, sender email, sender notification). Không xác định → NULL, KHÔNG gán random.
4. Không loại trừ bảng nào mặc định; mọi loại trừ phải nêu lý do trong bảng trên và có ADR đi kèm.

## Trạng thái review

- Created: Batch 0A.
- Review status: APPROVED & APPLIED (Batch 0B).

## Trạng thái sau Batch 0B

Đã tạo: `users`, `external_identities`, `tenants`, `tenant_members`, `audit_events`, `outbox_events`.
Đã thêm `tenant_id` + `row_version` + `created_by`/`updated_by` + trigger cho:
`workspaces`, `documents`, `email_threads`, `email_messages`, `email_states`, `notifications` (kèm `scope_type`).
Compatibility trigger tự điền `tenant_id` từ `workspace_id` — tạm thời, sẽ gỡ ở Batch 0C.
RLS tenant-aware (policy `*_tenant_*`) đã bổ sung song song, chưa drop policy cũ.
