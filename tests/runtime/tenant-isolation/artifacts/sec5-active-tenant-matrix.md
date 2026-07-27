# SEC.5 Active Tenant Runtime Matrix (sec5_2026-07-27T04-15-59-045Z)

- Total: 47
- Passed: 38
- Failed: 9

| ID | Group | Actor | Action | Expected | Actual | Notes |
|---|---|---|---|---|---|---|
| C001 | A | single_a | no_cookie_auto_select | tenantA | other | multi_tenant_no_hint | ❌
| C002 | A | single_a | valid_cookie_A | tenantA | tenantA |  |
| C003 | A | single_a | foreign_cookie_B_falls_back_to_A | tenantA_or_null | other | single-tenant compat: cookie ignored, sole membership auto-selected | ❌
| C004 | A | single_a | malformed_cookie_ignored | tenantA_or_null | other |  | ❌
| C005 | A | single_a | nonexistent_cookie_ignored | tenantA_or_null | other |  | ❌
| C006 | A | single_a | setActive_B_denied | deny | deny | TENANT_ACCESS_DENIED |
| C007 | A | single_a | setActive_random_denied | deny | deny |  |
| C008 | A | single_a | setActive_malformed_denied | deny | deny | malformed |
| C009 | B | multi_ab | no_cookie_no_autoselect | null | null | multi_tenant_no_hint |
| C010 | B | multi_ab | setActive_A | allow | deny |  | ❌
| C011 | B | multi_ab | setActive_B | allow | deny |  | ❌
| C012 | B | multi_ab | cookie_A_resolves_A | tenantA | tenantA |  |
| C013 | B | multi_ab | cookie_B_resolves_B | tenantB | tenantB |  |
| C014 | B | multi_ab | foreign_cookie_no_autoselect | null | null |  |
| C015 | C | outsider | setActive_A_denied | deny | deny |  |
| C016 | C | outsider | getActive_no_membership | null | null |  |
| C017 | D | owner_a | setActive_foreign_B_denied | deny | deny |  |
| C018 | D | owner_b | setActive_foreign_A_denied | deny | deny |  |
| C019 | D | owner_a | setActive_sqli_shape_denied | deny | deny | UUID validator strips shape |
| C020 | D | owner_a | setActive_empty_denied | deny | deny |  |
| C021 | E | single_a | cross_tenant_read_denied_by_rls | deny | deny | rows=0 |
| C022 | F | susp_member | baseline_active_allow | allow | deny |  | ❌
| C023 | F | susp_member | after_suspend_denied | deny | deny |  |
| C024 | F | susp_member | after_suspend_get_returns_null | null | null |  |
| C025 | F | susp_member | reactivate_allow | allow | deny |  | ❌
| C026 | F | susp_member | after_remove_denied | deny | deny |  |
| C027 | G | role_downgrade | baseline_role_is_admin | tenant_admin | tenant_admin |  |
| C028 | G | role_downgrade | after_demote_role_is_member | member | member | role always re-fetched from DB, never cached in cookie |
| C029 | G | role_downgrade | demoted_admin_action_denied | deny | deny | PERMISSION_DENIED |
| C030 | H | susp_tenant_member | baseline_active_tenant_allow | allow | allow |  |
| C031 | H | susp_tenant_member | after_suspend_setActive_denied | deny | deny |  |
| C032 | H | susp_tenant_member | after_suspend_get_returns_null | null | null |  |
| C033 | H | susp_tenant_member | suspended_tenant_not_in_available | hidden | hidden |  |
| C034 | H | arch_tenant_member | archived_setActive_denied | deny | deny |  |
| C035 | H | arch_tenant_member | archived_get_returns_null | null | null |  |
| C036 | I | expired | bad_jwt_no_data | deny | deny | No suitable key or wrong key type |
| C037 | I | anon | no_bearer_no_data | empty | empty |  |
| C038 | J | code | setActive_calls_cancelQueries_and_clear | true | true | src/features/tenants/hooks.ts:42-43 |
| C039 | J | code | switcher_forces_hard_reload | true | true | src/components/tenant-switcher.tsx:27 window.location.reload() |
| C040 | J | code | logout_clears_cache_and_signs_out | true | true | AppShell logout path calls signOut + navigate; cache reset via clear on reload |
| C041 | K | code | cache_cleared_before_switch_completes | true | true | cancelQueries awaited before clear; reload discards any in-flight fetch resolution |
| C042 | L | code | notifications_useEffect_cleanup_present | true | true | src/routes/_authenticated/notifications.tsx:192 removeChannel(channel) |
| C043 | L | code | reload_unmounts_all_channels | true | true | Hard reload on tenant switch terminates every realtime subscription |
| C044 | L | owner_b | cross_user_notifications_deny | empty | empty |  |
| C045 | M | multi_ab | two_tabs_both_selections_valid | allow | deny |  | ❌
| C046 | M | multi_ab | tab_with_stale_context_denied_after_suspend | deny | deny |  |
| C047 | N | outsider | error_no_secret_leak | safe | safe | TENANT_ACCESS_DENIED |