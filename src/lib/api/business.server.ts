// Server-only helpers for Batch 1D-API server functions.
// Kept in a .server.ts file so client bundles never see it, and so
// createServerFn handlers can import it without falling into the
// tss-serverfn-split sibling-helper trap.
import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError, type StableErrorCode } from "@/contracts/errors";

/**
 * RPCs raise `RAISE EXCEPTION '<STABLE_ERROR_CODE>[: extra]'`.
 * Translate them to ApiError with the code preserved.
 */
const KNOWN_CODES: readonly StableErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "TENANT_ACCESS_DENIED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "QUOTA_EXCEEDED",
  "ENTITLEMENT_DENIED",
  "TASK_NOT_FOUND",
  "TASK_VERSION_CONFLICT",
  "TASK_INVALID_TRANSITION",
  "TASK_ASSIGNEE_INVALID",
  "MEETING_NOT_FOUND",
  "MEETING_VERSION_CONFLICT",
  "MEETING_TIME_INVALID",
  "MEETING_RSVP_FORBIDDEN",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_VERSION_CONFLICT",
  "DOCUMENT_STORAGE_FAILED",
  "DOCUMENT_PERMISSION_DENIED",
  "WORKFLOW_NOT_FOUND",
  "WORKFLOW_VERSION_CONFLICT",
  "WORKFLOW_DEFINITION_INVALID",
  "WORKFLOW_NOT_PUBLISHED",
  "WORKFLOW_ALREADY_PUBLISHED",
  "WORKFLOW_RUN_NOT_FOUND",
  "WORKFLOW_RUN_INVALID_TRANSITION",
  "WORKFLOW_STEP_INVALID_TRANSITION",
];

export function mapPgError(err: PostgrestError | Error | null, fallback: StableErrorCode = "INTERNAL_ERROR"): never {
  const raw = (err && "message" in err ? err.message : "") ?? "";
  const match = KNOWN_CODES.find((c) => raw.includes(c));
  const code: StableErrorCode = match ?? fallback;
  throw new ApiError({ code, message: raw || code });
}

/** Throw if error is present, mapping to ApiError. */
export function ensureOk<T>(res: { data: T | null; error: PostgrestError | null }, fallback?: StableErrorCode): T {
  if (res.error) mapPgError(res.error, fallback);
  if (res.data === null) throw new ApiError({ code: fallback ?? "INTERNAL_ERROR", message: "Empty result" });
  return res.data;
}