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
  // Meeting domain
  "MEETING_NOT_FOUND",
  "MEETING_ACCESS_DENIED",
  "MEETING_NOT_JOINABLE",
  // Document domain
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_VERSION_CONFLICT",
  // Notification domain
  "NOTIFICATION_NOT_FOUND",
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
