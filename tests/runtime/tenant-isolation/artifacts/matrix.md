# Batch 1A-R matrix results

Started: 2026-07-26T14:36:11.363Z
Total: 173. Passed: 152. Failed: 21.

| actor | action | table | tenant | expected | actual | http | pass | notes |
|---|---|---|---|---|---|---|---|---|
| anonymous | select | workspaces | A | deny | deny | 200 | ✅ |  |
| anonymous | select | workspaces | B | deny | deny | 200 | ✅ |  |
| anonymous | select | documents | A | deny | deny | 401 | ✅ |  |
| anonymous | select | documents | B | deny | deny | 401 | ✅ |  |
| anonymous | select | email_threads | A | deny | deny | 200 | ✅ |  |
| anonymous | select | email_threads | B | deny | deny | 200 | ✅ |  |
| anonymous | select | email_messages | A | deny | deny | 200 | ✅ |  |
| anonymous | select | email_messages | B | deny | deny | 200 | ✅ |  |
| anonymous | select | email_states | A | deny | deny | 400 | ✅ |  |
| anonymous | select | email_states | B | deny | deny | 400 | ✅ |  |
| anonymous | select | notifications | A | deny | deny | 200 | ✅ |  |
| anonymous | select | notifications | B | deny | deny | 200 | ✅ |  |
| anonymous | insert | audit_events |  | deny | deny | 400 | ✅ |  |
| anonymous | insert | outbox_events |  | deny | deny | 400 | ✅ |  |
| outsider | select | workspaces | A | deny | deny | 200 | ✅ |  |
| outsider | select | workspaces | B | deny | deny | 200 | ✅ |  |
| outsider | select | documents | A | deny | deny | 200 | ✅ |  |
| outsider | select | documents | B | deny | deny | 200 | ✅ |  |
| outsider | select | email_threads | A | deny | deny | 200 | ✅ |  |
| outsider | select | email_threads | B | deny | deny | 200 | ✅ |  |
| outsider | select | email_messages | A | deny | deny | 200 | ✅ |  |
| outsider | select | email_messages | B | deny | deny | 200 | ✅ |  |
| outsider | select | email_states | A | deny | deny | 400 | ✅ |  |
| outsider | select | email_states | B | deny | deny | 400 | ✅ |  |
| outsider | select | notifications | A | deny | deny | 200 | ✅ |  |
| outsider | select | notifications | B | deny | deny | 200 | ✅ |  |
| owner_a | select | workspaces | A | allow | allow | 200 | ✅ |  |
| owner_a | select | workspaces | B | deny | deny | 200 | ✅ |  |
| owner_a | select | documents | A | allow | allow | 200 | ✅ |  |
| owner_a | select | documents | B | deny | deny | 200 | ✅ |  |
| owner_a | select | email_threads | A | allow | allow | 200 | ✅ |  |
| owner_a | select | email_threads | B | deny | deny | 200 | ✅ |  |
| owner_a | select | email_messages | A | allow | allow | 200 | ✅ |  |
| owner_a | select | email_messages | B | deny | deny | 200 | ✅ |  |
| owner_a | select | email_states | A | allow | deny | 400 | ❌ |  |
| owner_a | select | email_states | B | deny | deny | 400 | ✅ |  |
| owner_a | select | notifications | A | allow | allow | 200 | ✅ |  |
| owner_a | select | notifications | B | deny | deny | 200 | ✅ |  |
| admin_a | select | workspaces | A | allow | allow | 200 | ✅ |  |
| admin_a | select | workspaces | B | deny | deny | 200 | ✅ |  |
| admin_a | select | documents | A | allow | allow | 200 | ✅ |  |
| admin_a | select | documents | B | deny | deny | 200 | ✅ |  |
| admin_a | select | email_threads | A | allow | allow | 200 | ✅ |  |
| admin_a | select | email_threads | B | deny | deny | 200 | ✅ |  |
| admin_a | select | email_messages | A | allow | allow | 200 | ✅ |  |
| admin_a | select | email_messages | B | deny | deny | 200 | ✅ |  |
| admin_a | select | email_states | A | allow | deny | 400 | ❌ |  |
| admin_a | select | email_states | B | deny | deny | 400 | ✅ |  |
| admin_a | select | notifications | A | allow | deny | 200 | ❌ |  |
| admin_a | select | notifications | B | deny | deny | 200 | ✅ |  |
| member_a | select | workspaces | A | allow | allow | 200 | ✅ |  |
| member_a | select | workspaces | B | deny | deny | 200 | ✅ |  |
| member_a | select | documents | A | allow | allow | 200 | ✅ |  |
| member_a | select | documents | B | deny | deny | 200 | ✅ |  |
| member_a | select | email_threads | A | allow | allow | 200 | ✅ |  |
| member_a | select | email_threads | B | deny | deny | 200 | ✅ |  |
| member_a | select | email_messages | A | allow | allow | 200 | ✅ |  |
| member_a | select | email_messages | B | deny | deny | 200 | ✅ |  |
| member_a | select | email_states | A | allow | deny | 400 | ❌ |  |
| member_a | select | email_states | B | deny | deny | 400 | ✅ |  |
| member_a | select | notifications | A | allow | deny | 200 | ❌ |  |
| member_a | select | notifications | B | deny | deny | 200 | ✅ |  |
| guest_a | select | workspaces | A | allow | allow | 200 | ✅ |  |
| guest_a | select | workspaces | B | deny | deny | 200 | ✅ |  |
| guest_a | select | documents | A | allow | allow | 200 | ✅ |  |
| guest_a | select | documents | B | deny | deny | 200 | ✅ |  |
| guest_a | select | email_threads | A | allow | allow | 200 | ✅ |  |
| guest_a | select | email_threads | B | deny | deny | 200 | ✅ |  |
| guest_a | select | email_messages | A | allow | allow | 200 | ✅ |  |
| guest_a | select | email_messages | B | deny | deny | 200 | ✅ |  |
| guest_a | select | email_states | A | allow | deny | 400 | ❌ |  |
| guest_a | select | email_states | B | deny | deny | 400 | ✅ |  |
| guest_a | select | notifications | A | allow | deny | 200 | ❌ |  |
| guest_a | select | notifications | B | deny | deny | 200 | ✅ |  |
| owner_b | select | workspaces | B | allow | allow | 200 | ✅ |  |
| owner_b | select | workspaces | A | deny | deny | 200 | ✅ |  |
| owner_b | select | documents | B | allow | allow | 200 | ✅ |  |
| owner_b | select | documents | A | deny | deny | 200 | ✅ |  |
| owner_b | select | email_threads | B | allow | allow | 200 | ✅ |  |
| owner_b | select | email_threads | A | deny | deny | 200 | ✅ |  |
| owner_b | select | email_messages | B | allow | allow | 200 | ✅ |  |
| owner_b | select | email_messages | A | deny | deny | 200 | ✅ |  |
| owner_b | select | email_states | B | allow | deny | 400 | ❌ |  |
| owner_b | select | email_states | A | deny | deny | 400 | ✅ |  |
| owner_b | select | notifications | B | allow | allow | 200 | ✅ |  |
| owner_b | select | notifications | A | deny | deny | 200 | ✅ |  |
| admin_b | select | workspaces | B | allow | allow | 200 | ✅ |  |
| admin_b | select | workspaces | A | deny | deny | 200 | ✅ |  |
| admin_b | select | documents | B | allow | allow | 200 | ✅ |  |
| admin_b | select | documents | A | deny | deny | 200 | ✅ |  |
| admin_b | select | email_threads | B | allow | allow | 200 | ✅ |  |
| admin_b | select | email_threads | A | deny | deny | 200 | ✅ |  |
| admin_b | select | email_messages | B | allow | allow | 200 | ✅ |  |
| admin_b | select | email_messages | A | deny | deny | 200 | ✅ |  |
| admin_b | select | email_states | B | allow | deny | 400 | ❌ |  |
| admin_b | select | email_states | A | deny | deny | 400 | ✅ |  |
| admin_b | select | notifications | B | allow | deny | 200 | ❌ |  |
| admin_b | select | notifications | A | deny | deny | 200 | ✅ |  |
| member_b | select | workspaces | B | allow | allow | 200 | ✅ |  |
| member_b | select | workspaces | A | deny | deny | 200 | ✅ |  |
| member_b | select | documents | B | allow | allow | 200 | ✅ |  |
| member_b | select | documents | A | deny | deny | 200 | ✅ |  |
| member_b | select | email_threads | B | allow | allow | 200 | ✅ |  |
| member_b | select | email_threads | A | deny | deny | 200 | ✅ |  |
| member_b | select | email_messages | B | allow | allow | 200 | ✅ |  |
| member_b | select | email_messages | A | deny | deny | 200 | ✅ |  |
| member_b | select | email_states | B | allow | deny | 400 | ❌ |  |
| member_b | select | email_states | A | deny | deny | 400 | ✅ |  |
| member_b | select | notifications | B | allow | deny | 200 | ❌ |  |
| member_b | select | notifications | A | deny | deny | 200 | ✅ |  |
| guest_b | select | workspaces | B | allow | allow | 200 | ✅ |  |
| guest_b | select | workspaces | A | deny | deny | 200 | ✅ |  |
| guest_b | select | documents | B | allow | allow | 200 | ✅ |  |
| guest_b | select | documents | A | deny | deny | 200 | ✅ |  |
| guest_b | select | email_threads | B | allow | allow | 200 | ✅ |  |
| guest_b | select | email_threads | A | deny | deny | 200 | ✅ |  |
| guest_b | select | email_messages | B | allow | allow | 200 | ✅ |  |
| guest_b | select | email_messages | A | deny | deny | 200 | ✅ |  |
| guest_b | select | email_states | B | allow | deny | 400 | ❌ |  |
| guest_b | select | email_states | A | deny | deny | 400 | ✅ |  |
| guest_b | select | notifications | B | allow | deny | 200 | ❌ |  |
| guest_b | select | notifications | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | workspaces | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | workspaces | B | deny | deny | 200 | ✅ |  |
| platform_admin | select | documents | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | documents | B | deny | deny | 200 | ✅ |  |
| platform_admin | select | email_threads | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | email_threads | B | deny | deny | 200 | ✅ |  |
| platform_admin | select | email_messages | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | email_messages | B | deny | deny | 200 | ✅ |  |
| platform_admin | select | email_states | A | deny | deny | 400 | ✅ |  |
| platform_admin | select | email_states | B | deny | deny | 400 | ✅ |  |
| platform_admin | select | notifications | A | deny | deny | 200 | ✅ |  |
| platform_admin | select | notifications | B | deny | deny | 200 | ✅ |  |
| inactive_a | select | workspaces | A | deny | deny | 200 | ✅ |  |
| inactive_a | select | workspaces | B | deny | deny | 200 | ✅ |  |
| inactive_a | select | documents | A | deny | deny | 200 | ✅ |  |
| inactive_a | select | documents | B | deny | deny | 200 | ✅ |  |
| inactive_a | select | email_threads | A | deny | deny | 200 | ✅ |  |
| inactive_a | select | email_threads | B | deny | deny | 200 | ✅ |  |
| inactive_a | select | email_messages | A | deny | deny | 200 | ✅ |  |
| inactive_a | select | email_messages | B | deny | deny | 200 | ✅ |  |
| inactive_a | select | email_states | A | deny | deny | 400 | ✅ |  |
| inactive_a | select | email_states | B | deny | deny | 400 | ✅ |  |
| inactive_a | select | notifications | A | deny | deny | 200 | ✅ |  |
| inactive_a | select | notifications | B | deny | deny | 200 | ✅ |  |
| multi | select | workspaces | A | allow | allow | 200 | ✅ |  |
| multi | select | workspaces | B | allow | allow | 200 | ✅ |  |
| multi | select | documents | A | allow | allow | 200 | ✅ |  |
| multi | select | documents | B | allow | allow | 200 | ✅ |  |
| multi | select | email_threads | A | allow | allow | 200 | ✅ |  |
| multi | select | email_threads | B | allow | allow | 200 | ✅ |  |
| multi | select | email_messages | A | allow | allow | 200 | ✅ |  |
| multi | select | email_messages | B | allow | allow | 200 | ✅ |  |
| multi | select | email_states | A | allow | deny | 400 | ❌ |  |
| multi | select | email_states | B | allow | deny | 400 | ❌ |  |
| multi | select | notifications | A | allow | deny | 200 | ❌ |  |
| multi | select | notifications | B | allow | deny | 200 | ❌ |  |
| member_a | insert | documents | B | deny | deny | 400 | ✅ |  |
| member_a | insert | documents | A | allow_persisted_A | deny | 403 | ❌ |  |
| member_a | update | documents | B | deny | deny | 200 | ✅ |  |
| member_a | delete | documents | B | deny | deny | 204 | ✅ |  |
| outsider | insert | audit_events |  | deny | deny | 403 | ✅ |  |
| outsider | insert | outbox_events |  | deny | deny | 403 | ✅ |  |
| member_a | insert | audit_events |  | deny | deny | 403 | ✅ |  |
| member_a | insert | outbox_events |  | deny | deny | 403 | ✅ |  |
| owner_a | insert | audit_events |  | deny | deny | 403 | ✅ |  |
| owner_a | insert | outbox_events |  | deny | deny | 403 | ✅ |  |
| platform_admin | insert | audit_events |  | deny | deny | 403 | ✅ |  |
| platform_admin | insert | outbox_events |  | deny | deny | 403 | ✅ |  |
| owner_a | update | audit_events |  | deny | allow | 200 | ❌ |  |
| owner_a | delete | audit_events |  | deny | allow | 204 | ❌ |  |
| server | rpc | claim_outbox_events |  | single-winner | single-winner |  | ✅ |  |