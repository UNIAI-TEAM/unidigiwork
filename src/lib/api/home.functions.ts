// HOME V2 — 1 request duy nhất cho toàn bộ màn hình Trang chủ.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadHomeSummary } from "./home.server";
import type { HomeSummary, HomeTask, HomeUpcoming, WorkInboxItem } from "./home.server";

export type { HomeSummary, HomeTask, HomeUpcoming, WorkInboxItem };

export const getHomeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeSummary> =>
    loadHomeSummary(context.supabase, context.userId),
  );
