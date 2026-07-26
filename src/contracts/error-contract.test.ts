import { describe, it, expect } from "vitest";
import { STABLE_ERROR_CODES, isApiErrorContract, toApiError, ApiError } from "./errors";

describe("stable error catalogue", () => {
  it("codes are unique", () => {
    const set = new Set(STABLE_ERROR_CODES);
    expect(set.size).toBe(STABLE_ERROR_CODES.length);
  });

  it("contains platform baseline codes", () => {
    for (const code of [
      "AUTHENTICATION_REQUIRED",
      "TENANT_CONTEXT_REQUIRED",
      "VERSION_CONFLICT",
      "INTERNAL_ERROR",
      "BACKEND_UNAVAILABLE",
    ]) {
      expect((STABLE_ERROR_CODES as readonly string[]).includes(code)).toBe(true);
    }
  });

  it("isApiErrorContract validates shape and code", () => {
    expect(isApiErrorContract({ code: "INTERNAL_ERROR", message: "x" })).toBe(true);
    expect(isApiErrorContract({ code: "NOT_A_CODE", message: "x" })).toBe(false);
    expect(isApiErrorContract(null)).toBe(false);
  });

  it("toApiError maps unknown errors to INTERNAL_ERROR without leaking", () => {
    const mapped = toApiError(new Error("db: syntax error at line 12"));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("syntax");
  });

  it("toApiError passes through ApiError instances", () => {
    const err = new ApiError({ code: "TASK_NOT_FOUND", message: "missing" });
    expect(toApiError(err).code).toBe("TASK_NOT_FOUND");
  });
});
