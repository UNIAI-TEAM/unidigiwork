// Blueprint §12, §25.12 — Stable Error Catalogue.
// Codes are machine-readable and MUST NOT change once published.
// Messages MAY be localized. Never parse `message` for control flow.

export const STABLE_ERROR_CODES = [
  // Platform / auth
  "AUTHENTICATION_REQUIRED",
  "IDENTITY_RESOLUTION_FAILED",
  "TENANT_CONTEXT_REQUIRED",
  "TENANT_ACCESS_DENIED",
  "WORKSPACE_ACCESS_DENIED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "BACKEND_UNAVAILABLE",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
  // Task domain
  "TASK_NOT_FOUND",
  "TASK_VERSION_CONFLICT",
  "TASK_INVALID_TRANSITION",
  "TASK_ASSIGNEE_INVALID",
  "TASK_COMMENT_NOT_FOUND",
  // Meeting domain
  "MEETING_NOT_FOUND",
  "MEETING_ACCESS_DENIED",
  "MEETING_NOT_JOINABLE",
  "MEETING_VERSION_CONFLICT",
  "MEETING_TIME_INVALID",
  "MEETING_RSVP_FORBIDDEN",
  "MEETING_PARTICIPANT_NOT_FOUND",
  // Conferencing (LiveKit) — ADR-1E-001
  "MEETING_TOKEN_ISSUE_FAILED",
  "CONFERENCE_PROVIDER_UNAVAILABLE",
  // AI Workspace domain
  "AI_GATEWAY_UNAVAILABLE",
  "AI_GENERATION_FAILED",
  "AI_CONVERSATION_NOT_FOUND",
  "AI_CONVERSATION_CREATE_FAILED",
  "AI_CONVERSATION_DELETE_FAILED",
  "AI_CONVERSATION_LIST_FAILED",
  "AI_MESSAGE_LIST_FAILED",
  "AI_CONVERSATION_RESTORE_FAILED",
  "AI_CONVERSATION_PURGE_FAILED",
  "AI_MESSAGE_VERSION_LIST_FAILED",
  "AI_MESSAGE_UPDATE_FAILED",
  // Document domain
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_VERSION_CONFLICT",
  "DOCUMENT_STORAGE_FAILED",
  "DOCUMENT_PERMISSION_DENIED",
  "DOCUMENT_ARCHIVED",
  // Notification domain
  "NOTIFICATION_NOT_FOUND",
  // Workflow domain
  "WORKFLOW_NOT_FOUND",
  "WORKFLOW_VERSION_CONFLICT",
  "WORKFLOW_DEFINITION_INVALID",
  "WORKFLOW_NOT_PUBLISHED",
  "WORKFLOW_ALREADY_PUBLISHED",
  "WORKFLOW_RUN_NOT_FOUND",
  "WORKFLOW_RUN_INVALID_TRANSITION",
  "WORKFLOW_STEP_NOT_FOUND",
  "WORKFLOW_STEP_INVALID_TRANSITION",
  "WORKFLOW_EDIT_DENIED",
  "WORKFLOW_PUBLISH_DENIED",
  "WORKFLOW_RUN_DENIED",
  // Tenant domain (Batch 1B)
  "TENANT_NOT_FOUND",
  "TENANT_SLUG_CONFLICT",
  "TENANT_INVALID_TRANSITION",
  "TENANT_LAST_OWNER_PROTECTED",
  "TENANT_ROLE_CHANGE_FORBIDDEN",
  "TENANT_MEMBERSHIP_NOT_FOUND",
  "TENANT_INVITATION_NOT_FOUND",
  "TENANT_INVITATION_EXPIRED",
  "TENANT_INVITATION_REVOKED",
  "TENANT_INVITATION_ALREADY_ACCEPTED",
  "TENANT_INVITATION_EMAIL_MISMATCH",
  // Billing / Subscription domain (Batch 1C)
  "PLAN_NOT_FOUND",
  "PLAN_INVALID",
  "SUBSCRIPTION_NOT_FOUND",
  "SUBSCRIPTION_INVALID_TRANSITION",
  "ENTITLEMENT_DENIED",
  "QUOTA_EXCEEDED",
] as const;

export type StableErrorCode = (typeof STABLE_ERROR_CODES)[number];

export interface ApiErrorContract {
  code: StableErrorCode;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error implements ApiErrorContract {
  readonly code: StableErrorCode;
  readonly correlationId?: string;
  readonly details?: Record<string, unknown>;
  constructor(input: ApiErrorContract) {
    super(input.message);
    this.name = "ApiError";
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.details = input.details;
  }
}

export function isApiErrorContract(value: unknown): value is ApiErrorContract {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    (STABLE_ERROR_CODES as readonly string[]).includes(v.code) &&
    typeof v.message === "string"
  );
}

/**
 * Map any thrown value into an ApiErrorContract. Unknown errors become
 * INTERNAL_ERROR — never leak stack traces, SQL errors, or vendor codes.
 */
export function toApiError(err: unknown, correlationId?: string): ApiErrorContract {
  if (isApiErrorContract(err)) return err;
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, correlationId, details: err.details };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    correlationId,
  };
}
