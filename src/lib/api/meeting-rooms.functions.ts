// Batch LK-UI — phòng họp thật (LiveKit). Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureOk, mapPgError } from "./business.server";
import { ApiError } from "@/contracts/errors";

export const listMyMeetingRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("meetings")
      .select("id, title, status, start_at, end_at, workspace_id")
      .is("deleted_at", null)
      .in("status", ["scheduled", "live"])
      .order("start_at", { ascending: true })
      .limit(20);
    if (error) mapPgError(error);
    return (data ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      start_at: string;
      end_at: string;
      workspace_id: string;
    }>;
  });

export const createInstantMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ title: z.string().min(1).max(200).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ws, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("id")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (wsErr) mapPgError(wsErr);
    if (!ws) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "NO_WORKSPACE" });

    const now = Date.now();
    const res = await context.supabase.rpc("schedule_meeting", {
      _workspace_id: (ws as { id: string }).id,
      _title: data.title ?? "Phòng họp nhanh",
      _start_at: new Date(now - 60_000).toISOString(),
      _end_at: new Date(now + 60 * 60_000).toISOString(),
      _timezone: "Asia/Ho_Chi_Minh",
      _idempotency_key: `instant:${now}:${context.userId.slice(0, 8)}`,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as { id: string; title: string };
  });
