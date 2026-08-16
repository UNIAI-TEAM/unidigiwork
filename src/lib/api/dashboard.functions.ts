// Dashboard — thin server-function wrappers (RLS applies). Logic lives in dashboard.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadOverview, loadAiSummary, loadNotifications } from "./dashboard.server";
import type {
  DashboardOverview,
  DashboardAiSummary,
  DashboardRecentItem,
  DashboardMeeting,
  DashboardProject,
} from "./dashboard.server";

export type {
  DashboardOverview,
  DashboardAiSummary,
  DashboardRecentItem,
  DashboardMeeting,
  DashboardProject,
};

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        rangeDays: z.number().int().min(1).max(90).default(7),
        workspaceId: z.string().uuid().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) =>
    loadOverview(context.supabase, { rangeDays: data.rangeDays, workspaceId: data.workspaceId }),
  );

export const getDashboardAiSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        dayStart: z.string().datetime({ offset: true }).optional(),
        dayEnd: z.string().datetime({ offset: true }).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => loadAiSummary(context.supabase, data));

export type DashboardNotification = {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  priority: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export type DashboardBundle = DashboardOverview & {
  ai: DashboardAiSummary;
  notifications: DashboardNotification[];
};

/**
 * One request thay cho 3 (overview + ai summary + notifications).
 * Giảm số request client → API gateway khi tải cao (perf tier-1000).
 */
export const getDashboardBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        rangeDays: z.number().int().min(1).max(90).default(7),
        workspaceId: z.string().uuid().optional(),
        dayStart: z.string().datetime({ offset: true }).optional(),
        dayEnd: z.string().datetime({ offset: true }).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<DashboardBundle> => {
    const [overview, ai, notifications] = await Promise.all([
      loadOverview(context.supabase, {
        rangeDays: data.rangeDays,
        workspaceId: data.workspaceId,
      }),
      loadAiSummary(context.supabase, {
        workspaceId: data.workspaceId,
        dayStart: data.dayStart,
        dayEnd: data.dayEnd,
      }),
      loadNotifications(context.supabase, context.userId),
    ]);
    return { ...overview, ai, notifications: notifications as DashboardNotification[] };
  });
