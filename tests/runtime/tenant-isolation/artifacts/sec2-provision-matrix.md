# SEC.2 Provision Matrix (sec2_2026-07-27T03-49-04-675Z)

Total: 33 · Passed: 27 · Failed: 6

| ID | Actor | Action | Expected | Actual | Info | Result |
|---|---|---|---|---|---|---|
| S001 | actor_a | first_provision | allow | deny | 404 | FAIL |
| S002 | actor_a | concurrent_same_key | allow | deny |  | FAIL |
| S003 | actor_a | concurrent_diff_payload | allow | deny |  | FAIL |
| S004 | actor_a | dup_slug_first | allow | deny |  | FAIL |
| S005 | actor_b | dup_slug_conflict | deny | deny |  | PASS |
| S006 | actor_b | slug_normalized_collision | deny | deny |  | PASS |
| S007 | actor_a | reserved_admin | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S008 | actor_a | reserved_api | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S009 | actor_a | reserved_app | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S010 | actor_a | reserved_auth | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S011 | actor_a | reserved_login | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S012 | actor_a | reserved_logout | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S013 | actor_a | reserved_platform | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S014 | actor_a | reserved_system | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S015 | actor_a | reserved_support | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S016 | actor_a | reserved_www | deny | deny | TENANT_SLUG_CONFLICT | PASS |
| S017 | actor_a | invalid_slug_empty | deny | deny | VALIDATION_FAILED | PASS |
| S018 | actor_a | invalid_slug_too_short | deny | deny | VALIDATION_FAILED | PASS |
| S019 | actor_a | invalid_slug_too_long | deny | deny | VALIDATION_FAILED | PASS |
| S020 | actor_a | invalid_slug_slash | deny | deny |  | PASS |
| S021 | actor_a | invalid_slug_backslash | deny | deny |  | PASS |
| S022 | actor_a | invalid_slug_ctrl | deny | deny |  | PASS |
| S023 | actor_a | invalid_slug_leading_hyphen | deny | deny |  | PASS |
| S024 | actor_a | owner_spoof_other | deny | deny | PERMISSION_DENIED | PASS |
| S025 | actor_a | owner_spoof_no_tenant | allow | allow |  | PASS |
| S026 | actor_a | owner_unknown | deny | deny | PERMISSION_DENIED | PASS |
| S027 | platform_admin | provision_for_other_owner | allow | deny | 404 | FAIL |
| S028 | anonymous | provision_denied | deny | deny | AUTHENTICATION_REQUIRED | PASS |
| S029 | anonymous | no_tenant_created | allow | allow |  | PASS |
| S030 | actor_b | atomic_slug_conflict | deny | deny |  | PASS |
| S031 | actor_b | atomic_no_orphan_member | allow | allow |  | PASS |
| S032 | actor_b | atomic_no_success_audit | allow | allow |  | PASS |
| S033 | actor_b | retry_after_failure | allow | deny |  | FAIL |
