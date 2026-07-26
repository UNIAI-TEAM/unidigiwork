import type {
  NotificationDto,
  NotificationPreferenceDto,
  MarkNotificationReadCommand,
} from "@/contracts";
import { ApiError } from "@/contracts/errors";
import { assertJavaConfigured, resolveBackendProvider } from "../core/provider";

export interface NotificationApi {
  list(): Promise<NotificationDto[]>;
  markRead(command: MarkNotificationReadCommand): Promise<NotificationDto>;
  getPreferences(): Promise<NotificationPreferenceDto[]>;
  updatePreferences(input: NotificationPreferenceDto[]): Promise<NotificationPreferenceDto[]>;
}

// The existing feature layer talks to createServerFn handlers under
// src/lib/api/notifications.functions.ts and notif-prefs.functions.ts.
// The SDK is the target boundary for future callers; the current UI is not
// migrated in Batch 0C to avoid behavior regressions (see manifest).
const lovableNotificationApi: NotificationApi = {
  async list() {
    throw new ApiError({
      code: "NOT_IMPLEMENTED",
      message:
        "NotificationApi.list() SDK adapter deferred; UI still uses server functions directly.",
    });
  },
  async markRead() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
  async getPreferences() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
  async updatePreferences() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
};

export function resolveNotificationApi(): NotificationApi {
  const provider = resolveBackendProvider();
  if (provider === "lovable") return lovableNotificationApi;
  return assertJavaConfigured();
}