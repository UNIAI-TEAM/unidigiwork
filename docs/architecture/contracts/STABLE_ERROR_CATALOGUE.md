# Stable Error Catalogue (Blueprint §12)

Codes are machine-readable and MUST NOT change once published. Messages MAY be localized. Never parse `message` for control flow.

## Platform

| Code | Owner | Meaning | Retryable | User-safe message |
|---|---|---|---|---|
| AUTHENTICATION_REQUIRED | platform | No valid session | no | yes |
| IDENTITY_RESOLUTION_FAILED | platform | Subject not mapped to internal user | no | yes |
| TENANT_CONTEXT_REQUIRED | platform | No active tenant / ambiguous | no | yes |
| TENANT_ACCESS_DENIED | platform | Actor not a tenant member | no | yes |
| WORKSPACE_ACCESS_DENIED | platform | Actor not a workspace member | no | yes |
| PERMISSION_DENIED | platform | Missing permission | no | yes |
| RESOURCE_NOT_FOUND | platform | Generic not found | no | yes |
| VALIDATION_FAILED | platform | Schema/business rule violation | no | yes |
| VERSION_CONFLICT | platform | Optimistic concurrency (row_version) | yes (refetch) | yes |
| IDEMPOTENCY_CONFLICT | platform | Same key, different payload | no | yes |
| RATE_LIMITED | platform | Too many requests | yes (backoff) | yes |
| BACKEND_UNAVAILABLE | platform | Provider unavailable | yes | yes |
| NOT_IMPLEMENTED | platform | Adapter not wired | no | yes |
| INTERNAL_ERROR | platform | Unknown — never leak details | no | yes |

## Domain

TASK_NOT_FOUND, TASK_VERSION_CONFLICT, TASK_INVALID_TRANSITION (tasks);
MEETING_NOT_FOUND, MEETING_ACCESS_DENIED, MEETING_NOT_JOINABLE (meetings);
DOCUMENT_NOT_FOUND, DOCUMENT_VERSION_CONFLICT (documents);
NOTIFICATION_NOT_FOUND (notifications).

## Rules

- Codes are permanent; add-only.
- Adapters map vendor errors to stable codes; never leak SQL/stack traces.
- Unknown → INTERNAL_ERROR.
- Every trusted-boundary response carries correlationId when available.
