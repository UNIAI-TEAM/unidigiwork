// Batch LK-UI — phòng họp thật (LiveKit). Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureOk, mapPgError } from "./business.server";
import { ApiError } from "@/contracts/errors";
import { correlationIdSchema, idempotencyKeySchema } from "@/contracts/common/base";
import { resolveInstantMeetingWindow } from "@/lib/meeting-instant";
import { callPendingRpc } from "./pending-rpc.server";

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
    if (ids.length === 0)
      return [] as Array<{ id: string; name: string; tenant_id: string; timezone: string }>;

    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, name, tenant_id, timezone")
      .in("id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) mapPgError(error);
    return (data ?? []) as Array<{
      id: string;
      name: string;
      tenant_id: string;
      timezone: string;
    }>;
  });

export const listMyMeetingRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        state: z.enum(["all", "live", "upcoming", "ended"]).default("all"),
        sort: z.enum(["asc", "desc"]).default("asc"),
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
      .order("start_at", { ascending: data.sort === "asc" })
      .range(data.offset, data.offset + data.limit - 1)
      .limit(data.limit);
    if (data.state === "live") {
      q = q.eq("status", "live");
    } else if (data.state === "upcoming") {
      q = q.eq("status", "scheduled").gte("start_at", nowIso);
    } else if (data.state === "ended") {
      q = q.in("status", ["ended", "canceled"]);
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
    if (participantMeetingIds.length > 0)
      orParts.push(`id.in.(${participantMeetingIds.join(",")})`);
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
        // Khóa do client sinh một lần cho một ý định tạo phòng và giữ nguyên
        // qua mọi lần thử lại. Trước đây khóa được sinh tại server theo
        // Date.now() nên mỗi lần gửi lại là một khóa mới — tức là không chống
        // trùng được gì cả.
        idempotencyKey: idempotencyKeySchema,
        correlationId: correlationIdSchema,
        title: z.string().min(1).max(200).optional(),
        workspaceId: z.string().uuid().optional(),
        startAt: z.string().datetime().optional(),
        durationMinutes: z.number().int().min(5).max(480).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Chỉ workspace mà người dùng thực sự là thành viên. RLS cho đọc cả
    // workspace khác trong tenant, nên nếu chỉ dựa vào RLS thì lúc client chưa
    // kịp chọn workspace, phòng họp rơi vào một workspace tùy ý của tổ chức.
    const { data: memberships, error: memErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(200);
    if (memErr) mapPgError(memErr);
    const memberWorkspaceIds = (memberships ?? []).map(
      (m) => (m as { workspace_id: string }).workspace_id,
    );
    if (memberWorkspaceIds.length === 0)
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "NO_WORKSPACE" });
    if (data.workspaceId && !memberWorkspaceIds.includes(data.workspaceId))
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "WORKSPACE_FORBIDDEN" });

    const { data: ws, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("id")
      .in("id", data.workspaceId ? [data.workspaceId] : memberWorkspaceIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (wsErr) mapPgError(wsErr);
    if (!ws) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "NO_WORKSPACE" });

    const win = resolveInstantMeetingWindow({
      ...(data.startAt ? { startAt: data.startAt } : {}),
      ...(data.durationMinutes ? { durationMinutes: data.durationMinutes } : {}),
    });
    if (!win.ok)
      throw new ApiError({
        code: win.error === "START_IN_PAST" ? "MEETING_TIME_INVALID" : "VALIDATION_FAILED",
        message: win.error,
      });

    const res = await context.supabase.rpc("schedule_meeting", {
      _workspace_id: (ws as { id: string }).id,
      _title: data.title ?? "Phòng họp nhanh",
      _start_at: win.startAt,
      _end_at: win.endAt,
      _timezone: "Asia/Ho_Chi_Minh",
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as {
      id: string;
      title: string;
      status: string;
      start_at: string;
      end_at: string;
      workspace_id: string;
      deleted_at: string | null;
    };
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
        expiresInMinutes: z
          .number()
          .int()
          .min(1)
          .max(60 * 24 * 30)
          .nullable()
          .optional(),
        maxUses: z.number().int().min(1).max(1000).nullable().optional(),
        label: z.string().max(120).optional(),
        // Mặc định false, và cố ý không để `.optional()` tự suy ra: người gọi
        // quên truyền thì link phải là link nội bộ, không phải link mở.
        allowGuests: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await callPendingRpc<{
      id: string;
      token: string;
      expires_at: string | null;
      max_uses: number | null;
      used_count: number;
      allow_guests: boolean;
    }>(context.supabase, "create_meeting_invite_link", {
      _meeting_id: data.meetingId,
      _expires_in_minutes: data.expiresInMinutes ?? undefined,
      _max_uses: data.maxUses ?? undefined,
      _label: data.label ?? undefined,
      _allow_guests: data.allowGuests,
    });
    const out = ensureOk(res, "MEETING_ACCESS_DENIED");
    return {
      id: out.id,
      token: out.token,
      expiresAt: out.expires_at,
      maxUses: out.max_uses,
      usedCount: out.used_count,
      allowGuests: out.allow_guests ?? false,
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

// Danh sách người đã được mời + trạng thái tham gia của một phòng họp.
export const listMeetingParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meeting_participants")
      .select("user_id, role, rsvp, rsvp_at, created_at")
      .eq("meeting_id", data.meetingId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) mapPgError(error);

    const ids = (rows ?? []).map((r) => (r as { user_id: string }).user_id);
    let people: Record<string, { name: string | null; email: string | null }> = {};
    if (ids.length > 0) {
      const { data: users, error: uErr } = await context.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", ids);
      if (uErr) mapPgError(uErr);
      people = Object.fromEntries(
        (users ?? []).map((u) => {
          const row = u as {
            id: string;
            display_name: string | null;
            primary_email: string | null;
          };
          return [row.id, { name: row.display_name, email: row.primary_email }];
        }),
      );
    }

    return (rows ?? []).map((r) => {
      const row = r as unknown as {
        user_id: string;
        role: string;
        rsvp: string;
        rsvp_at: string | null;
        created_at: string;
      };
      return {
        userId: row.user_id,
        role: row.role,
        rsvp: row.rsvp,
        rsvpAt: row.rsvp_at,
        invitedAt: row.created_at,
        name: people[row.user_id]?.name ?? null,
        email: people[row.user_id]?.email ?? null,
      };
    });
  });

// ----- Khách ngoài (link chia sẻ có allow_guests) -----
// Khách không nằm trong `meeting_participants` nên không hiện ở
// listMeetingParticipants; chủ toạ xem họ qua hàm riêng này.

export interface MeetingGuestDTO {
  guestId: string;
  displayName: string;
  joinedAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export const listMeetingGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<MeetingGuestDTO[]> => {
    const res = await callPendingRpc<
      Array<{
        guest_id: string;
        display_name: string;
        joined_at: string | null;
        last_seen_at: string | null;
        revoked_at: string | null;
      }>
    >(context.supabase, "list_meeting_guests", { _meeting_id: data.meetingId });
    if (res.error) mapPgError(res.error, "MEETING_ACCESS_DENIED");
    return (res.data ?? []).map((g) => ({
      guestId: g.guest_id,
      displayName: g.display_name,
      joinedAt: g.joined_at,
      lastSeenAt: g.last_seen_at,
      revokedAt: g.revoked_at,
    }));
  });

/**
 * Mời khách ra khỏi phòng. Thu hồi ở DB chặn khách xin vé mới; đá khỏi phòng
 * đang mở là việc của LiveKit RemoveParticipant, gọi ngay sau đó.
 */
export const revokeMeetingGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        guestId: z.string().uuid(),
        correlationId: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await callPendingRpc<{
      status: string;
      guest_id: string;
      identity: string;
      room_name: string | null;
    }>(context.supabase, "revoke_meeting_guest", {
      _guest_id: data.guestId,
      _correlation_id: data.correlationId ?? undefined,
    });
    if (res.error) mapPgError(res.error, "MEETING_ACCESS_DENIED");
    const out = res.data;

    // Thu hồi ở DB mới chỉ chặn khách xin vé mới. Vé đang cầm còn sống tới 15
    // phút, nên phải đá khỏi phòng đang mở thì "mời ra" mới có nghĩa ngay.
    if (out?.identity && out.room_name) {
      try {
        const { readLiveKitConfig, removeParticipant } = await import("./livekit.server");
        const config = readLiveKitConfig();
        if (config) await removeParticipant(config, out.room_name, out.identity);
      } catch (err) {
        // Quyền đã thu hồi trong DB rồi — lỗi ở đây chỉ làm chậm việc đá ra,
        // không được biến thao tác thành thất bại trước mắt chủ toạ.
        console.error("[meetings] removeParticipant failed", err);
      }
    }
    return out ?? { status: "revoked", guest_id: data.guestId, identity: "", room_name: null };
  });

// Chính sách vào phòng (ADR-1E-001).
export type MeetingAccessPolicy = "tenant_open" | "invite_only";

export interface MeetingAccessPolicyDTO {
  accessPolicy: MeetingAccessPolicy;
  rowVersion: number;
  /** Người xem có được phép đổi chính sách không (chủ toạ/điều phối/người tạo). */
  canManage: boolean;
}

export const getMeetingAccessPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<MeetingAccessPolicyDTO> => {
    const res = await context.supabase.rpc("get_meeting_access_policy", {
      _meeting_id: data.meetingId,
    });
    const out = ensureOk(res, "MEETING_NOT_FOUND") as unknown as {
      access_policy: MeetingAccessPolicy;
      row_version: number;
      can_manage: boolean;
    };
    return {
      accessPolicy: out.access_policy,
      rowVersion: Number(out.row_version ?? 0),
      canManage: Boolean(out.can_manage),
    };
  });

export const setMeetingAccessPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        accessPolicy: z.enum(["tenant_open", "invite_only"]),
        expectedRowVersion: z.number().int().min(0).optional(),
        idempotencyKey: z.string().min(8).max(200).optional(),
        correlationId: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("set_meeting_access_policy", {
      _meeting_id: data.meetingId,
      _access_policy: data.accessPolicy,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    const out = ensureOk(res, "MEETING_ACCESS_DENIED") as unknown as {
      access_policy: MeetingAccessPolicy;
      row_version: number;
    };
    return { accessPolicy: out.access_policy, rowVersion: Number(out.row_version ?? 0) };
  });

// Thống kê thật cho dashboard /meeting (RPC SECURITY DEFINER kiểm tra thành viên).
export const getWorkspaceMeetingStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_workspace_meeting_stats", {
      _workspace_id: data.workspaceId,
    });
    if (error) mapPgError(error);
    const r = rows?.[0];
    return {
      today: Number(r?.today_count ?? 0),
      live: Number(r?.live_count ?? 0),
      recordings: Number(r?.recording_count ?? 0),
      summaries: Number(r?.summary_count ?? 0),
    };
  });
