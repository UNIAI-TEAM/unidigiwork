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

// Lịch sử cuộc họp — chỉ các phòng đã kết thúc/hủy.
export const listMeetingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meetings")
      .select(
        "id, title, status, start_at, end_at, updated_at, workspace_id, meeting_participants(user_id)",
        { count: "exact" },
      )
      .is("deleted_at", null)
      .in("status", ["ended", "canceled"])
      .order("end_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const { data: rows, error, count } = await q;
    if (error) mapPgError(error);

    const items = (rows ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        title: string;
        status: string;
        start_at: string;
        end_at: string;
        updated_at: string;
        workspace_id: string;
        meeting_participants: Array<{ user_id: string }> | null;
      };
      const start = new Date(row.start_at).getTime();
      const end = new Date(row.end_at).getTime();
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        startAt: row.start_at,
        endAt: row.end_at,
        workspaceId: row.workspace_id,
        participantCount: row.meeting_participants?.length ?? 0,
        durationMinutes: Math.max(0, Math.round((end - start) / 60_000)),
      };
    });

    return { items, total: count ?? items.length };
  });

