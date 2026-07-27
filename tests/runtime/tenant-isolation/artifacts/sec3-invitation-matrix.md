# SEC.3 Invitation Lifecycle Runtime Matrix

Run: sec3_2026-07-27T02-45-59-197Z
Total: 43. Passed: 35. Failed: 8.

| Cell | Actor | Tenant | Action | InvState | Expected | Actual | HTTP | Stable | Pass | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| C001 | owner_a | A | create |  | allow | deny | 400 |  | ❌ |  |
| C002 | owner_a | B | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C003 | owner_a | A | create |  | deny | deny | 403 | TENANT_ROLE_CHANGE_FORBIDDEN | ✅ |  |
| C004 | admin_a | A | create |  | allow | deny | 400 |  | ❌ |  |
| C005 | admin_a | A | create |  | deny | deny | 403 | TENANT_ROLE_CHANGE_FORBIDDEN | ✅ |  |
| C006 | member_a | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C007 | guest_a | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C008 | outsider | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C009 | owner_b | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C010 | platform_admin | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ | no explicit trusted platform op contract for invitation creation |
| C011 | owner_a | A | list_invitations_redaction |  | allow | allow |  |  | ✅ | token_hash exposed only via RLS column policy |
| C012 | correct_email | A | accept | pending | allow | deny | 400 |  | ❌ |  |
| C013 | correct_email | A | accept_replay_same | accepted | deny | deny | 400 |  | ✅ | wrong stable |
| C014 | wrong_email | A | accept_replay_other | accepted | deny | deny | 403 | TENANT_INVITATION_EMAIL_MISMATCH | ✅ |  |
| C015 | wrong_email | A | accept | pending | deny | deny | 403 | TENANT_INVITATION_EMAIL_MISMATCH | ✅ | stable OK |
| C016 | wrong_email |  | no_membership_after_mismatch |  | allow | allow |  |  | ✅ |  |
| C017 | wrong_email |  | invitation_unchanged |  | allow | allow |  |  | ✅ |  |
| C018 | wrong_email |  | rejected_audit_written |  | allow | deny |  |  | ❌ |  |
| C019 | unconfirmed |  | unconfirm_setup |  | allow | environmental |  |  | ❌ | Supabase admin API kept email_confirmed_at set; unconfirmed cell is environmental. |
| C020 | unconfirmed | A | accept | pending | deny | deny | 400 |  | ✅ | unconfirmed=false |
| C021 | correct_email | A | accept | expired | deny | deny | 403 | TENANT_INVITATION_EXPIRED | ✅ |  |
| C022 | correct_email | A | accept | revoked | deny | deny | 403 | TENANT_INVITATION_REVOKED | ✅ |  |
| C023 | concurrent |  | concurrent_accept_single_membership |  | allow | deny |  |  | ❌ | ok=0 deniedStable=null members=0 |
| C024 | concurrent |  | concurrent_no_duplicate_success_audit |  | allow | allow |  |  | ✅ | success_audit_count=0 |
| C025 | existing_active |  | accept_existing_member_single_row |  | allow | allow | 400 |  | ✅ | role_after=member |
| C026 | suspended_a |  | accept_suspended_no_bypass |  | deny | deny | 400 |  | ✅ | kept suspended |
| C027 | removed_a |  | accept_removed_becomes_member |  | allow | deny | 400 |  | ❌ |  |
| C028 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C029 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C030 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C031 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C032 | owner_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C033 | admin_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C034 | member_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C035 | guest_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C036 | outsider | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C037 | owner_b | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C038 | owner_a | A | revoke_accepted |  | deny | deny | 400 |  | ✅ |  |
| C039 | owner_a | A | revoke_repeat |  | deny | deny | 400 |  | ✅ | first=true |
| C040 | owner_b | A | cross_tenant_revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C041 | cross_tenant |  | cross_tenant_scoped_membership |  | allow | deny |  |  | ❌ | A=false B=false |
| C042 | member_b | A | cross_tenant_list_invitations |  | deny | deny |  |  | ✅ | rows=0 |
| C043 | anonymous | A | accept | pending | deny | deny | 401 |  | ✅ |  |