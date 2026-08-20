# SEC.3 Invitation Lifecycle Runtime Matrix

Run: sec3_2026-08-20T03-20-28-956Z
Total: 51. Passed: 51. Failed: 0.

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
| C022 | wrong_email |  | rejected_audit_written |  | allow | allow |  |  | ✅ | sink1=true sink2=true added=1 |
| C023 | wrong_email |  | audit_no_email_leak |  | allow | allow |  |  | ✅ |  |
| C024 | wrong_email |  | rejection_sink_not_public |  | deny | deny | 403 |  | ✅ | record_tenant_invitation_rejection revoked from authenticated |
| C025 | unconfirmed |  | unconfirm_setup |  | allow | allow |  |  | ✅ | email_confirmed_at nulled via guarded _test_unconfirm_auth_email RPC |
| C026 | unconfirmed | A | accept | pending | deny | deny | 403 | TENANT_INVITATION_EMAIL_MISMATCH | ✅ | unconfirmed=true |
| C027 | unconfirmed |  | no_membership_after_unconfirmed |  | allow | allow |  |  | ✅ |  |
| C028 | correct_email | A | accept | expired | deny | deny | 403 | TENANT_INVITATION_EXPIRED | ✅ |  |
| C029 | correct_email | A | accept | revoked | deny | deny | 403 | TENANT_INVITATION_REVOKED | ✅ |  |
| C030 | concurrent |  | concurrent_accept_single_membership |  | allow | allow |  |  | ✅ | ok=1 deniedStable=TENANT_INVITATION_ALREADY_ACCEPTED members=1 |
| C031 | concurrent |  | concurrent_no_duplicate_success_audit |  | allow | allow |  |  | ✅ | success_audit_count=0 |
| C032 | existing_active |  | accept_existing_member_single_row |  | allow | allow | 200 |  | ✅ | role_after=guest |
| C033 | suspended_a |  | accept_suspended_no_bypass |  | deny | deny | 400 |  | ✅ | kept suspended |
| C034 | removed_a |  | accept_removed_becomes_member |  | allow | allow | 200 |  | ✅ |  |
| C035 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C036 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C037 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C038 | owner_a | A | create_role_allowlist |  | deny | deny | 400 |  | ✅ |  |
| C039 | owner_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C040 | admin_a | A | revoke |  | allow | allow | 200 |  | ✅ |  |
| C041 | member_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C042 | guest_a | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C043 | outsider | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C044 | owner_b | A | revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C045 | owner_a | A | revoke_accepted |  | deny | deny | 400 |  | ✅ |  |
| C046 | owner_a | A | revoke_repeat |  | deny | deny | 400 |  | ✅ | first=true |
| C047 | owner_b | A | cross_tenant_revoke |  | deny | deny | 403 | PERMISSION_DENIED | ✅ |  |
| C048 | cross_tenant |  | cross_tenant_scoped_membership |  | allow | allow |  |  | ✅ | A=true B=false |
| C049 | member_b | A | cross_tenant_list_invitations |  | deny | deny |  |  | ✅ | rows=0 |
| C050 | system |  | outbox_no_token |  | allow | allow |  |  | ✅ | events=1 |
| C051 | anonymous | A | accept | pending | deny | deny | 401 |  | ✅ |  |