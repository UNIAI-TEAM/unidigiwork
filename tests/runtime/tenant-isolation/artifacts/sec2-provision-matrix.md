# SEC.2 Provision Matrix (sec2_2026-07-27T03-51-25-598Z)

Total: 46 · Passed: 45 · Failed: 1

| ID | Actor | Action | Expected | Actual | Info | Result |
|---|---|---|---|---|---|---|
| S001 | actor_a | first_provision | allow | allow | 200 | PASS |
| S002 | actor_a | invariants | allow | allow |  | PASS |
| S003 | actor_a | owner_membership | allow | allow |  | PASS |
| S004 | actor_a | workspace_invariant | allow | allow |  | PASS |
| S005 | actor_a | workspace_owner_member | allow | allow |  | PASS |
| S006 | actor_a | audit_provisioned_row | allow | allow |  | PASS |
| S007 | actor_a | audit_no_secret | allow | allow |  | PASS |
| S008 | actor_a | outbox_catalog | allow | allow |  | PASS |
| S009 | actor_a | outbox_idem_key_set | allow | allow |  | PASS |
| S010 | actor_a | replay_same_payload | allow | allow | 200 | PASS |
| S011 | actor_a | replay_no_duplicate | allow | allow |  | PASS |
| S012 | actor_a | same_key_diff_payload | deny | deny | IDEMPOTENCY_CONFLICT | PASS |
| S013 | actor_a | conflict_no_side_effect | allow | allow |  | PASS |
| S014 | actor_a | concurrent_same_key | allow | allow |  | PASS |
| S015 | actor_a | concurrent_single_aggregate | allow | allow |  | PASS |
| S016 | actor_a | concurrent_audit_dedup | allow | allow |  | PASS |
| S017 | actor_a | concurrent_outbox_dedup | allow | allow |  | PASS |
| S018 | actor_a | concurrent_diff_payload | allow | allow |  | PASS |
| S019 | actor_a | dup_slug_first | allow | allow |  | PASS |
| S020 | actor_b | dup_slug_conflict | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S021 | actor_b | slug_normalized_collision | deny | allow |  | FAIL |
| S022 | actor_a | reserved_admin | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S023 | actor_a | reserved_api | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S024 | actor_a | reserved_app | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S025 | actor_a | reserved_auth | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S026 | actor_a | reserved_login | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S027 | actor_a | reserved_logout | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S028 | actor_a | reserved_platform | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S029 | actor_a | reserved_system | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S030 | actor_a | reserved_support | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S031 | actor_a | reserved_www | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S032 | actor_a | invalid_slug_empty | deny | deny | VALIDATION_FAILED | PASS |
| S033 | actor_a | invalid_slug_too_short | deny | deny | VALIDATION_FAILED | PASS |
| S034 | actor_a | invalid_slug_too_long | deny | deny | VALIDATION_FAILED | PASS |
| S035 | actor_a | owner_spoof_other | deny | deny | PERMISSION_DENIED | PASS |
| S036 | actor_a | owner_spoof_no_tenant | allow | allow |  | PASS |
| S037 | actor_a | owner_unknown | deny | deny | PERMISSION_DENIED | PASS |
| S038 | platform_admin | provision_for_other_owner | allow | allow | 200 | PASS |
| S039 | platform_admin | owner_is_target | allow | allow |  | PASS |
| S040 | platform_admin | audit_actor_is_admin | allow | allow |  | PASS |
| S041 | anonymous | provision_denied | deny | deny | AUTHENTICATION_REQUIRED | PASS |
| S042 | anonymous | no_tenant_created | allow | allow |  | PASS |
| S043 | actor_b | atomic_slug_conflict | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S044 | actor_b | atomic_no_orphan_member | allow | allow |  | PASS |
| S045 | actor_b | atomic_no_success_audit | allow | allow |  | PASS |
| S046 | actor_b | retry_after_failure | allow | allow |  | PASS |
