// Blueprint §2.4, §21 — backend provider resolution.
// Lovable Cloud is the only active runtime in Phase 0.
// Java is a future portability target; NEVER auto-fallback to Lovable.
import { ApiError } from "@/contracts/errors";

export type BackendProviderKind = "lovable" | "java";

function readEnv(): string | undefined {
  // Runtime chooses provider; client cannot override.
  const fromServer =
    typeof process !== "undefined" ? process.env?.UNIWORK_BACKEND_PROVIDER : undefined;
  const fromClient =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string | undefined> }).env
          ?.VITE_UNIWORK_BACKEND_PROVIDER
      : undefined;
  return fromServer ?? fromClient;
}

export function resolveBackendProvider(): BackendProviderKind {
  const raw = (readEnv() ?? "lovable").toLowerCase();
  if (raw === "lovable") return "lovable";
  if (raw === "java") return "java";
  // Fail-closed on unknown provider.
  throw new ApiError({
    code: "BACKEND_UNAVAILABLE",
    message: `Unknown backend provider: ${raw}`,
  });
}

export function assertJavaConfigured(): never {
  // Java runtime not configured in Phase 0. No silent fallback.
  throw new ApiError({
    code: "BACKEND_UNAVAILABLE",
    message: "Java backend is not configured in this environment.",
  });
}