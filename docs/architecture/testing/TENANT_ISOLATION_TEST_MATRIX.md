# Tenant Isolation Test Matrix

For each tenant-scoped table (workspaces, documents, email_threads, email_messages, email_states, notifications):

| Actor | Read own | Read other | Write own | Write other | Write audit | Write outbox |
|---|---|---|---|---|---|---|
| anonymous | deny | deny | deny | deny | deny | deny |
| authenticated non-member | deny | deny | deny | deny | deny | deny |
| tenant guest | limited | deny | limited | deny | deny | deny |
| tenant member | allow | deny | allow | deny | deny | deny |
| tenant manager | allow | deny | allow | deny | deny | deny |
| tenant admin | allow | deny | allow | deny | deny | deny |
| tenant owner | allow | deny | allow | deny | deny | deny |
| platform admin | privileged fn only | privileged fn only | privileged fn only | privileged fn only | privileged fn only | SECURITY DEFINER only |

## Runtime gate

Requires a fixture with two tenants + one user per role per tenant. Blocked in Batch 0C. Recorded as external gate for Phase 1 CI.
