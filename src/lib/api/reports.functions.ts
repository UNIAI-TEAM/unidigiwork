// Reports — server functions backed by public.report_overview RPC (SECURITY INVOKER, RLS applies).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export type ReportOverview = {
  range_days: number;
  from: string;
  kpis: {
    users: number;
    active_users: number;
    workspaces: number;
    tasks: number;
    meetings: number;
    documents: number;
    tasks_cur: number;
    tasks_prev: number;
    meetings_cur: number;
    meetings_prev: number;
    docs_cur: number;
    docs_prev: number;
    ws_cur: number;
    ws_prev: number;
  };
  tasks_by_status: {
    done: number;
    in_progress: number;
    todo: number;
    blocked: number;
    canceled: number;
    total: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    tasks: number;
    members: number;
    progress: number;
    status: "ontrack" | "risk" | "not_started";
  }>;
  activity: Array<{
    day: string;
    tasks: number;
    meetings: number;
    documents: number;
    completed: number;
  }>;
};

export const getReportOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        days: z.number().int().min(1).max(365).default(30),
        workspaceId: z.string().uuid().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("report_overview", {
      _days: data.days,
      _workspace_id: data.workspaceId ?? undefined,
    });
    if (error) mapPgError(error);
    return (row ?? null) as ReportOverview | null;
  });
