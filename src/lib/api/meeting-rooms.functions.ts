// Batch LK-UI — phòng họp thật (LiveKit). Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureOk, mapPgError } from "./business.server";
import { ApiError } from "@/contracts/errors";

// Danh sách workspace mà người dùng thấy được (RLS lọc theo tenant/thành viên).
export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Chỉ workspace mà người dùng thực sự là thành viên (không phải mọi workspace trong tenant).
    const { data: memberships, error: memErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(200);
    if (memErr) mapPgError(memErr);
    const ids = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
    if (ids.length === 0) return [] as Array<{ id: string; name: string; tenant_id: string }>;

    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, name, tenant_id")
      .in("id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) mapPgError(error);
    return (data ?? []) as Array<{ id: string; name: string; tenant_id: string }>;
  });

export const listMyMeetingRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        state: z.enum(["all", "live", "upcoming"]).default("all"),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Quyền xem: workspace mình là thành viên, hoặc cuộc họp mình được mời/tham gia.
    const { data: memberships, error: memErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(200);
    if (memErr) mapPgError(memErr);
    const memberWorkspaceIds = (memberships ?? []).map(
      (m) => (m as { workspace_id: string }).workspace_id,
    );

    const { data: parts, error: partErr } = await context.supabase
      .from("meeting_participants")
      .select("meeting_id")
      .eq("user_id", context.userId)
      .limit(500);
    if (partErr) mapPgError(partErr);
    const participantMeetingIds = (parts ?? []).map(
      (p) => (p as { meeting_id: string }).meeting_id,
    );

    // Workspace được yêu cầu nhưng không có quyền → danh sách rỗng, không lộ dữ liệu tenant khác.
    if (data.workspaceId && !memberWorkspaceIds.includes(data.workspaceId)) {
      const onlyInvited = participantMeetingIds.length > 0;
      if (!onlyInvited) return { items: [], total: 0 };
    }
    if (memberWorkspaceIds.length === 0 && participantMeetingIds.length === 0) {
      return { items: [], total: 0 };
    }

    const nowIso = new Date().toISOString();
    let q = context.supabase
      .from("meetings")
      .select("id, title, status, start_at, end_at, workspace_id", { count: "exact" })
      .is("deleted_at", null)
      .order("start_at", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1)
      .limit(data.limit);
    if (data.state === "live") {
      q = q.eq("status", "live");
    } else if (data.state === "upcoming") {
      q = q.eq("status", "scheduled").gte("start_at", nowIso);
    } else {
      q = q.in("status", ["scheduled", "live"]);
    }
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const allowedWs = data.workspaceId
      ? memberWorkspaceIds.filter((id) => id === data.workspaceId)
      : memberWorkspaceIds;
    const orParts: string[] = [];
    if (allowedWs.length > 0) orParts.push(`workspace_id.in.(${allowedWs.join(",")})`);
    if (participantMeetingIds.length > 0) orParts.push(`id.in.(${participantMeetingIds.join(",")})`);
    q = q.or(orParts.join(","));

    const { data: rows, error, count } = await q;
    if (error) mapPgError(error);
    return {
      items: (rows ?? []) as Array<{
        id: string;
        title: string;
        status: string;
        start_at: string;
        end_at: string;
        workspace_id: string;
      }>,
      total: count ?? rows?.length ?? 0,
    };
  });

// Mời một người tham gia phòng họp theo email (gọi tuần tự để UI hiện tiến trình).
export const inviteMeetingParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        email: z.string().email(),
        correlationId: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("invite_meeting_participant", {
      _meeting_id: data.meetingId,
      _email: data.email,
      _correlation_id: data.correlationId,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as {
      email: string;
      status: "invited" | "already" | "not_found";
      user_id?: string;
    };
  });

export const createInstantMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        title: z.string().min(1).max(200).optional(),
        workspaceId: z.string().uuid().optional(),
        startAt: z.string().datetime().optional(),
        durationMinutes: z.number().int().min(5).max(480).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let wsQuery = context.supabase
      .from("workspaces")
      .select("id")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data.workspaceId) wsQuery = wsQuery.eq("id", data.workspaceId);
    const { data: ws, error: wsErr } = await wsQuery.maybeSingle();
    if (wsErr) mapPgError(wsErr);
    if (!ws) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "NO_WORKSPACE" });

    const now = Date.now();
    const start = data.startAt ? new Date(data.startAt).getTime() : now - 60_000;
    const duration = (data.durationMinutes ?? 60) * 60_000;
    const res = await context.supabase.rpc("schedule_meeting", {
      _workspace_id: (ws as { id: string }).id,
      _title: data.title ?? "Phòng họp nhanh",
      _start_at: new Date(start).toISOString(),
      _end_at: new Date(start + duration).toISOString(),
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


// Link mời có kiểm soát: thời hạn + số lần sử dụng.
export const createMeetingInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        expiresInMinutes: z.number().int().min(1).max(60 * 24 * 30).nullable().optional(),
        maxUses: z.number().int().min(1).max(1000).nullable().optional(),
        label: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_meeting_invite_link", {
      _meeting_id: data.meetingId,
      _expires_in_minutes: data.expiresInMinutes ?? null,
      _max_uses: data.maxUses ?? null,
      _label: data.label ?? null,
    });
    const out = ensureOk(res, "MEETING_ACCESS_DENIED") as unknown as {
      id: string;
      token: string;
      expires_at: string | null;
      max_uses: number | null;
      used_count: number;
    };
    return {
      id: out.id,
      token: out.token,
      expiresAt: out.expires_at,
      maxUses: out.max_uses,
      usedCount: out.used_count,
    };
  });

export const redeemMeetingInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ token: z.string().min(10).max(128) }).parse(i))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("redeem_meeting_invite_link", { _token: data.token });
    const out = ensureOk(res, "MEETING_NOT_FOUND") as unknown as {
      status: "joined" | "already" | "expired" | "exhausted" | "revoked" | "invalid";
      meeting_id?: string;
    };
    return { status: out.status, meetingId: out.meeting_id ?? null };
  });
