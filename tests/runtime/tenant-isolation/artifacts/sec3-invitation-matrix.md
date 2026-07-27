# SEC.3 Invitation Lifecycle Runtime Matrix

Run: sec3_2026-07-27T02-52-57-453Z
Total: 48. Passed: 46. Failed: 2.

| Cell | Actor | Tenant | Action | InvState | Expected | Actual | HTTP | Stable | Pass | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| C001 | owner_a | A | create |  | allow | allow | 200 |  | ✅ |  |
| C002 | owner_a | A | token_hash_only |  | allow | allow |  |  | ✅ | DB stores sha256 hash only |
| C003 | owner_a | A | rpc_no_plaintext_token |  | allow | allow |  |  | ✅ |  |
| C004 | owner_a | B | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C005 | owner_a | A | create |  | deny | deny | 403 | TENANT_ROLE_CHANGE_FORBIDDEN | ✅ |  |
| C006 | admin_a | A | create |  | allow | allow | 200 |  | ✅ |  |
| C007 | admin_a | A | create |  | deny | deny | 403 | TENANT_ROLE_CHANGE_FORBIDDEN | ✅ |  |
| C008 | member_a | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C009 | guest_a | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C010 | outsider | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C011 | owner_b | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C012 | platform_admin | A | create |  | deny | deny | 403 | PERMISSION_DENIED | ✅ | no explicit trusted platform op contract for invitation creation |
| C013 | owner_a | A | list_invitations_redaction |  | allow | allow |  |  | ✅ | token_hash exposed only via RLS column policy |
| C014 | correct_email | A | accept | pending | allow | allow | 200 |  | ✅ |  |
| C015 | correct_email | A | membership_created |  | allow | allow |  |  | ✅ |  |
| C016 | correct_email |  | no_cross_tenant_membership |  | allow | allow |  |  | ✅ |  |
| C017 | correct_email | A | accept_replay_same | accepted | deny | deny | 403 | TENANT_INVITATION_ALREADY_ACCEPTED | ✅ | stable code correct |
| C018 | wrong_email | A | accept_replay_other | accepted | deny | deny | 403 | TENANT_INVITATION_ALREADY_ACCEPTED | ✅ |  |
| C019 | wrong_email | A | accept | pending | deny | deny | 403 | TENANT_INVITATION_EMAIL_MISMATCH | ✅ | stable OK |
| C020 | wrong_email |  | no_membership_after_mismatch |  | allow | allow |  |  | ✅ |  |
| C021 | wrong_email |  | invitation_unchanged |  | allow | allow |  |  | ✅ |  |
| C022 | wrong_email |  | rejected_audit_written |  | allow | deny |  |  | ❌ |  |
| C023 | unconfirmed |  | unconfirm_setup |  | allow | environmental |  |  | ❌ | Supabase admin API kept email_confirmed_at set; unconfirmed cell is environmental. |
| C024 | unconfirmed | A | accept | pending | allow | allow | 200 |  | ✅ | unconfirmed=false |
| C025 | correct_email | A | accept | expired | deny | deny | 403 | TENANT_INVITATION_EXPIRED | ✅ |  |
| C026 | correct_email | A | accept | revoked | deny | deny | 403 | TENANT_INVITATION_REVOKED | ✅ |  |
| C027 | concurrent |  | concurrent_accept_single_membership |  | allow | allow |  |  | ✅ | ok=1 deniedStable=TENANT_INVITATION_ALREADY_ACCEPTED members=1 |
| C028 | concurrent |  | concurrent_no_duplicate_success_audit |  | allow | allow |  |  | ✅ | success_audit_count=0 |
| C029 | existing_active |  | accept_existing_member_single_row |  | allow | allow | 200 |  | ✅ | role_after=guest |
| C030 | suspended_a |  | accept_suspended_no_bypass |  | deny | deny | 400 |  | ✅ | kept suspended |
| C031 | removed_a |  | accept_removed_becomes_member |  | allow | allow | 200 |  | ✅ |  |
| C032 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C033 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C034 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C035 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C036 | owner_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C037 | admin_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C038 | member_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C039 | guest_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C040 | outsider | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C041 | owner_b | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C042 | owner_a | A | revoke_accepted |  | deny | deny | 400 |  | ✅ |  |
| C043 | owner_a | A | revoke_repeat |  | deny | deny | 400 |  | ✅ | first=true |
| C044 | owner_b | A | cross_tenant_revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C045 | cross_tenant |  | cross_tenant_scoped_membership |  | allow | allow |  |  | ✅ | A=true B=false |
| C046 | member_b | A | cross_tenant_list_invitations |  | deny | deny |  |  | ✅ | rows=0 |
| C047 | system |  | outbox_no_token |  | allow | allow |  |  | ✅ | events=1 |
| C048 | anonymous | A | accept | pending | deny | deny | 401 |  | ✅ |  |