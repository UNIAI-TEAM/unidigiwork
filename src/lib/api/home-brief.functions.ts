// HOME V2 — server fn cho AI Brief (grounding trên dữ liệu thật của user).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadHomeAiBrief } from "./home-brief.server";
import type { HomeAiBrief } from "./home-brief.server";

export type { HomeAiBrief };

export const getHomeAiBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeAiBrief> =>
    loadHomeAiBrief(context.supabase, context.userId),
  );
