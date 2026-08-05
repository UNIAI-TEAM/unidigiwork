// Luồng "Yêu cầu mời" — người dùng gửi yêu cầu join, chủ phòng duyệt/từ chối.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError, ensureOk } from "./business.server";

export const requestMeetingJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        message: z.string().max(1000).optional(),
        correlationId: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("request_meeting_join", {
      _meeting_id: data.meetingId,
      _message: data.message ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as {
      status: "pending" | "approved" | "rejected" | "canceled";
      request_id?: string;
      already_participant?: boolean;
      created_at?: string;
    };
  });

/** Trạng thái yêu cầu mới nhất của chính tôi cho một phòng (dùng để poll). */
export const getMyMeetingJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meeting_join_requests")
      .select("id, status, message, decision_note, created_at, decided_at")
      .eq("meeting_id", data.meetingId)
      .eq("requester_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) mapPgError(error);
    return row ?? null;
  });

/** Danh sách yêu cầu của một phòng — RLS chỉ trả về khi tôi là host/quản trị. */
export const listMeetingJoinRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        status: z.enum(["pending", "all"]).default("pending"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meeting_join_requests")
      .select("id, requester_id, status, message, created_at, decided_at")
      .eq("meeting_id", data.meetingId)
      .neq("requester_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.status === "pending") q = q.eq("status", "pending");
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    if (!rows?.length) return [];

    const ids = [...new Set(rows.map((r) => r.requester_id))];
    const { data: people } = await context.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", ids);
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      requester_name: byId.get(r.requester_id)?.display_name ?? null,
      requester_email: byId.get(r.requester_id)?.primary_email ?? null,
    }));
  });

export const decideMeetingJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(500).optional(),
        correlationId: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("decide_meeting_join_request", {
      _request_id: data.requestId,
      _approve: data.approve,
      _note: data.note ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });
