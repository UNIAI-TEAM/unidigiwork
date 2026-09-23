// Chat — CRUD kênh/thành viên/tin nhắn theo tenant + workspace. RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export type ChatChannelDTO = {
  id: string;
  name: string;
  description: string | null;
  kind: "channel" | "dm";
  isPrivate: boolean;
  isMember: boolean;
  isFavorite: boolean;
  isOwner: boolean;
  memberCount: number;
  unread: number;
  lastMessageAt: string | null;
  meetingId: string | null;
  taskId?: string | null;
  isGeneral?: boolean;
};

export type ChatMessageDTO = {
  id: string;
  channelId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  isMine: boolean;
  parentId: string | null;
  parentAuthorName: string | null;
  parentExcerpt: string | null;
  attachments: ChatAttachment[];
  pinnedAt: string | null;
  pinnedByName: string | null;
  isAi: boolean;
};

export type ChatAttachment = {
  path: string;
  name: string;
  size: number;
  mime: string;
};

export type ChatMemberDTO = {
  userId: string;
  name: string;
  email: string | null;
  role: "owner" | "member";
  isMe: boolean;
};

export type ChatPersonDTO = {
  userId: string;
  name: string;
  email: string | null;
  isMember: boolean;
};

export type ChatReaderDTO = {
  userId: string;
  name: string;
  lastReadAt: string | null;
  isMe: boolean;
};

export type ChatListResult = {
  tenantId: string | null;
  workspaceId: string | null;
  canCreate: boolean;
  channels: ChatChannelDTO[];
};

type Ctx = { supabase: any; userId: string };

async function resolveScope(
  ctx: Ctx,
): Promise<{ tenantId: string; role: string; workspaceId: string | null } | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id, role, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
  const rows = (data ?? []) as Array<{ tenant_id: string; role: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  const chosen = (hint && rows.find((r) => r.tenant_id === hint)) || rows[0];
  const { data: ws } = await ctx.supabase
    .from("workspaces")
    .select("id, created_at")
    .eq("tenant_id", chosen.tenant_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  return {
    tenantId: chosen.tenant_id,
    role: chosen.role,
    workspaceId: (ws ?? [])[0]?.id ?? null,
  };
}

async function displayNames(ctx: Ctx, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return map;
  const { data } = await ctx.supabase
    .from("users")
    .select("id, display_name, primary_email")
    .in("id", unique);
  for (const u of data ?? []) map.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
  return map;
}

/** Danh sách kênh mà tôi thấy được (kênh công khai của workspace + kênh tôi là thành viên). */
export const listChatChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatListResult> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    if (!scope) return { tenantId: null, workspaceId: null, canCreate: false, channels: [] };

    const { data: chans, error } = await ctx.supabase
      .from("chat_channels")
      .select(
        "id, name, description, kind, is_private, last_message_at, created_by, meeting_id, task_id, is_general",
      )
      .eq("tenant_id", scope.tenantId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) mapPgError(error);
    const rows = (chans ?? []) as any[];
    if (rows.length === 0) {
      return {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        canCreate: !!scope.workspaceId,
        channels: [],
      };
    }
    const ids = rows.map((r) => r.id);
    const [membersRes, myRes] = await Promise.all([
      ctx.supabase.from("chat_members").select("channel_id, user_id, role").in("channel_id", ids),
      ctx.supabase
        .from("chat_members")
        .select("channel_id, is_favorite, last_read_at, role")
        .eq("user_id", ctx.userId)
        .in("channel_id", ids),
    ]);
    const counts = new Map<string, number>();
    for (const m of membersRes.data ?? [])
      counts.set(m.channel_id, (counts.get(m.channel_id) ?? 0) + 1);
    const mine = new Map<
      string,
      { is_favorite: boolean; last_read_at: string | null; role: string }
    >();
    for (const m of myRes.data ?? []) mine.set(m.channel_id, m as any);

    // Unread: đếm tin nhắn sau last_read_at cho các kênh tôi tham gia
    const unread = new Map<string, number>();
    await Promise.all(
      Array.from(mine.entries()).map(async ([cid, m]) => {
        let q = ctx.supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", cid)
          .is("deleted_at", null)
          .neq("author_id", ctx.userId);
        if (m.last_read_at) q = q.gt("created_at", m.last_read_at);
        const { count } = await q;
        unread.set(cid, count ?? 0);
      }),
    );

    const channels: ChatChannelDTO[] = rows.map((r) => {
      const m = mine.get(r.id);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        kind: r.kind,
        isPrivate: r.is_private,
        isMember: !!m,
        isFavorite: !!m?.is_favorite,
        isOwner: m?.role === "owner" || r.created_by === ctx.userId,
        memberCount: counts.get(r.id) ?? 0,
        unread: unread.get(r.id) ?? 0,
        lastMessageAt: r.last_message_at,
        meetingId: r.meeting_id ?? null,
        taskId: r.task_id ?? null,
        isGeneral: !!r.is_general,
      };
    });

    return {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      canCreate: !!scope.workspaceId,
      channels,
    };
  });

export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        channelId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
        q: z.string().max(200).optional(),
        before: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ messages: ChatMessageDTO[]; hasMore: boolean }> => {
    const ctx = context as unknown as Ctx;
    const limit = data.limit ?? 50;
    let query = ctx.supabase
      .from("chat_messages")
      .select(
        "id, channel_id, body, author_id, created_at, edited_at, parent_message_id, attachments, pinned_at, pinned_by, is_ai",
      )
      .eq("channel_id", data.channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (data.q && data.q.trim()) query = query.ilike("body", `%${data.q.trim()}%`);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    if (data.before) query = query.lt("created_at", data.before);
    const { data: rows, error } = await query;
    if (error) mapPgError(error);
    let list = (rows ?? []) as any[];
    const hasMore = list.length > limit;
    if (hasMore) list = list.slice(0, limit);

    // Tin nhắn gốc (reply)
    const parentIds = Array.from(
      new Set(list.map((r) => r.parent_message_id).filter(Boolean)),
    ) as string[];
    const parents = new Map<string, { body: string; author_id: string }>();
    if (parentIds.length > 0) {
      const { data: prows } = await ctx.supabase
        .from("chat_messages")
        .select("id, body, author_id")
        .in("id", parentIds);
      for (const p of (prows ?? []) as any[]) parents.set(p.id, p);
    }

    const names = await displayNames(ctx, [
      ...list.map((r) => r.author_id),
      ...list.map((r) => r.pinned_by).filter(Boolean),
      ...Array.from(parents.values()).map((p) => p.author_id),
    ]);

    const messages = list.reverse().map((r) => {
      const parent = r.parent_message_id ? parents.get(r.parent_message_id) : undefined;
      return {
        id: r.id,
        channelId: r.channel_id,
        body: r.body,
        authorId: r.author_id,
        authorName: names.get(r.author_id) ?? "Thành viên",
        createdAt: r.created_at,
        editedAt: r.edited_at,
        isMine: r.author_id === ctx.userId,
        parentId: r.parent_message_id ?? null,
        parentAuthorName: parent ? (names.get(parent.author_id) ?? "Thành viên") : null,
        parentExcerpt: parent ? String(parent.body).slice(0, 140) : null,
        attachments: Array.isArray(r.attachments) ? (r.attachments as ChatAttachment[]) : [],
        pinnedAt: r.pinned_at ?? null,
        pinnedByName: r.pinned_by ? (names.get(r.pinned_by) ?? "Thành viên") : null,
        isAi: r.is_ai === true,
      };
    });
    return { messages, hasMore };
  });

/** Ghim / bỏ ghim một tin nhắn (chỉ thành viên kênh). */
export const setChatMessagePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ messageId: z.string().uuid(), pinned: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.rpc("set_chat_message_pin", {
      _message_id: data.messageId,
      _pinned: data.pinned,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

/** Danh sách tin nhắn đã ghim của kênh. */
export const listPinnedChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ChatMessageDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("chat_messages")
      .select(
        "id, channel_id, body, author_id, created_at, edited_at, parent_message_id, attachments, pinned_at, pinned_by, is_ai",
      )
      .eq("channel_id", data.channelId)
      .is("deleted_at", null)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: false })
      .limit(50);
    if (error) mapPgError(error);
    const list = (rows ?? []) as any[];
    const names = await displayNames(ctx, [
      ...list.map((r) => r.author_id),
      ...list.map((r) => r.pinned_by).filter(Boolean),
    ]);
    return list.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      body: r.body,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? "Thành viên",
      createdAt: r.created_at,
      editedAt: r.edited_at,
      isMine: r.author_id === ctx.userId,
      parentId: r.parent_message_id ?? null,
      parentAuthorName: null,
      parentExcerpt: null,
      attachments: Array.isArray(r.attachments) ? (r.attachments as ChatAttachment[]) : [],
      pinnedAt: r.pinned_at ?? null,
      pinnedByName: r.pinned_by ? (names.get(r.pinned_by) ?? "Thành viên") : null,
      isAi: r.is_ai === true,
    }));
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        channelId: z.string().uuid(),
        body: z.string().trim().min(1).max(8000),
        parentId: z.string().uuid().nullish(),
        mentions: z.array(z.string().uuid()).max(30).optional(),
        attachments: z
          .array(
            z.object({
              path: z.string().min(1).max(500),
              name: z.string().min(1).max(200),
              size: z.number().int().min(0),
              mime: z.string().max(120),
            }),
          )
          .max(10)
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: ch, error: chErr } = await ctx.supabase
      .from("chat_channels")
      .select("id, tenant_id")
      .eq("id", data.channelId)
      .maybeSingle();
    if (chErr) mapPgError(chErr);
    if (!ch)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
    const { data: row, error } = await ctx.supabase
      .from("chat_messages")
      .insert({
        channel_id: data.channelId,
        tenant_id: ch.tenant_id,
        author_id: ctx.userId,
        body: data.body,
        parent_message_id: data.parentId ?? null,
        attachments: data.attachments ?? [],
      })
      .select("id")
      .single();
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (data.mentions && data.mentions.length > 0) {
      await ctx.supabase.rpc("create_chat_mention_notifications", {
        _message_id: row.id,
        _user_ids: data.mentions,
      });
    }
    return { id: row.id };
  });

export const updateChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ messageId: z.string().uuid(), body: z.string().trim().min(1).max(8000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_messages")
      .update({ body: data.body, edited_at: new Date().toISOString() })
      .eq("id", data.messageId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const deleteChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ messageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.messageId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const createChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[\p{L}\p{N} _-]+$/u, "Tên kênh không hợp lệ"),
        description: z.string().trim().max(300).optional(),
        isPrivate: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    if (!scope?.workspaceId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Chưa có không gian làm việc" });
    const { data: row, error } = await ctx.supabase
      .from("chat_channels")
      .insert({
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        name: data.name,
        description: data.description ?? null,
        is_private: data.isPrivate ?? false,
        kind: "channel",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) mapPgError(error, "PERMISSION_DENIED");
    const { error: memErr } = await ctx.supabase.from("chat_members").insert({
      channel_id: row.id,
      user_id: ctx.userId,
      tenant_id: scope.tenantId,
      role: "owner",
    });
    if (memErr) mapPgError(memErr);
    return { id: row.id };
  });

export const joinChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: ch, error: chErr } = await ctx.supabase
      .from("chat_channels")
      .select("id, tenant_id")
      .eq("id", data.channelId)
      .maybeSingle();
    if (chErr) mapPgError(chErr);
    if (!ch)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
    const { error } = await ctx.supabase.from("chat_members").upsert(
      {
        channel_id: data.channelId,
        user_id: ctx.userId,
        tenant_id: ch.tenant_id,
        role: "member",
      },
      { onConflict: "channel_id,user_id" },
    );
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const leaveChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_members")
      .delete()
      .eq("channel_id", data.channelId)
      .eq("user_id", ctx.userId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const setChatFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid(), value: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_members")
      .update({ is_favorite: data.value })
      .eq("channel_id", data.channelId)
      .eq("user_id", ctx.userId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const markChatChannelRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", data.channelId)
      .eq("user_id", ctx.userId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const deleteChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.rpc("soft_delete_chat_channel", {
      _channel_id: data.channelId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

/** Thành viên của một kênh. */
export const listChatChannelMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ChatMemberDTO[]> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("chat_members")
      .select("user_id, role")
      .eq("channel_id", data.channelId);
    if (error) mapPgError(error);
    const list = (rows ?? []) as Array<{ user_id: string; role: "owner" | "member" }>;
    const byId = new Map<string, any>();
    if (scope) {
      const { data: profiles } = await ctx.supabase.rpc("list_tenant_member_profiles", {
        _tenant_id: scope.tenantId,
      });
      for (const u of (profiles ?? []) as any[]) byId.set(u.id, u);
    }

    return list
      .map((r) => ({
        userId: r.user_id,
        name:
          byId.get(r.user_id)?.display_name ?? byId.get(r.user_id)?.primary_email ?? "Thành viên",
        email: byId.get(r.user_id)?.primary_email ?? null,
        role: r.role,
        isMe: r.user_id === ctx.userId,
      }))
      .sort((a, b) =>
        a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1,
      );
  });

/** Danh sách người trong tổ chức (để mời vào kênh hoặc mở DM). */
export const listChatPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid().nullish() }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<ChatPersonDTO[]> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    if (!scope) return [];
    const { data: profiles, error } = await ctx.supabase.rpc("list_tenant_member_profiles", {
      _tenant_id: scope.tenantId,
    });
    if (error) mapPgError(error);
    const users = (profiles ?? []) as Array<{
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }>;
    if (users.length === 0) return [];

    let inChannel = new Set<string>();
    if (data.channelId) {
      const { data: cm } = await ctx.supabase
        .from("chat_members")
        .select("user_id")
        .eq("channel_id", data.channelId);
      inChannel = new Set(((cm ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    }
    return ((users ?? []) as any[])
      .map((u) => ({
        userId: u.id,
        name: u.display_name ?? u.primary_email ?? "Thành viên",
        email: u.primary_email ?? null,
        isMember: inChannel.has(u.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const addChatChannelMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ channelId: z.string().uuid(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: ch, error: chErr } = await ctx.supabase
      .from("chat_channels")
      .select("id, tenant_id")
      .eq("id", data.channelId)
      .maybeSingle();
    if (chErr) mapPgError(chErr);
    if (!ch)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
    const { error } = await ctx.supabase.from("chat_members").upsert(
      {
        channel_id: data.channelId,
        user_id: data.userId,
        tenant_id: ch.tenant_id,
        role: "member",
      },
      { onConflict: "channel_id,user_id" },
    );
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

/** Mốc đã đọc của từng thành viên trong kênh (để hiển thị trạng thái đã xem theo tin nhắn). */
export const listChatChannelReaders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ChatReaderDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("chat_members")
      .select("user_id, last_read_at")
      .eq("channel_id", data.channelId);
    if (error) mapPgError(error);
    const list = (rows ?? []) as Array<{ user_id: string; last_read_at: string | null }>;
    const names = await displayNames(
      ctx,
      list.map((r) => r.user_id),
    );
    return list.map((r) => ({
      userId: r.user_id,
      name: names.get(r.user_id) ?? "Thành viên",
      lastReadAt: r.last_read_at,
      isMe: r.user_id === ctx.userId,
    }));
  });

export const removeChatChannelMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ channelId: z.string().uuid(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_members")
      .delete()
      .eq("channel_id", data.channelId)
      .eq("user_id", data.userId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const setChatMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        channelId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["owner", "member"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("chat_members")
      .update({ role: data.role })
      .eq("channel_id", data.channelId)
      .eq("user_id", data.userId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

/** Mở (hoặc tạo) cuộc trò chuyện 1-1 với một người trong tổ chức. */
export const openDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as unknown as Ctx;
    if (data.userId === ctx.userId)
      throw new ApiError({
        code: "VALIDATION_FAILED",
        message: "Không thể nhắn tin cho chính mình",
      });
    const scope = await resolveScope(ctx);
    if (!scope?.workspaceId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Chưa có không gian làm việc" });

    // Tìm DM đã tồn tại giữa 2 người
    const { data: mineRows } = await ctx.supabase
      .from("chat_members")
      .select("channel_id")
      .eq("user_id", ctx.userId);
    const mineIds = ((mineRows ?? []) as Array<{ channel_id: string }>).map((r) => r.channel_id);
    if (mineIds.length > 0) {
      const { data: theirs } = await ctx.supabase
        .from("chat_members")
        .select("channel_id")
        .eq("user_id", data.userId)
        .in("channel_id", mineIds);
      const shared = ((theirs ?? []) as Array<{ channel_id: string }>).map((r) => r.channel_id);
      if (shared.length > 0) {
        const { data: dms } = await ctx.supabase
          .from("chat_channels")
          .select("id")
          .in("id", shared)
          .eq("kind", "dm")
          .is("deleted_at", null)
          .limit(1);
        const existing = (dms ?? [])[0];
        if (existing) return { id: existing.id };
      }
    }

    const names = await displayNames(ctx, [ctx.userId, data.userId]);
    const { data: row, error } = await ctx.supabase
      .from("chat_channels")
      .insert({
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        name: `${names.get(ctx.userId) ?? "Tôi"} · ${names.get(data.userId) ?? "Thành viên"}`,
        kind: "dm",
        is_private: true,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) mapPgError(error, "PERMISSION_DENIED");
    const { error: memErr } = await ctx.supabase.from("chat_members").insert([
      { channel_id: row.id, user_id: ctx.userId, tenant_id: scope.tenantId, role: "owner" },
      { channel_id: row.id, user_id: data.userId, tenant_id: scope.tenantId, role: "owner" },
    ]);
    if (memErr) mapPgError(memErr, "PERMISSION_DENIED");
    return { id: row.id };
  });

/** Kênh chat riêng của một cuộc họp (tạo nếu chưa có, idempotent, tenant-scoped). */
export const ensureMeetingChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ channelId: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: channelId, error } = await ctx.supabase.rpc("ensure_meeting_chat_channel", {
      _meeting_id: data.meetingId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!channelId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tạo được kênh họp" });
    return { channelId: channelId as string };
  });

/** Phòng trò chuyện chung của tổ chức (tự tạo lần đầu, mọi thành viên đều thuộc phòng). */
export const ensureTenantGeneralChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ channelId: string }> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    if (!scope) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Chưa có tổ chức" });
    const { data: channelId, error } = await ctx.supabase.rpc("ensure_tenant_general_channel", {
      _tenant_id: scope.tenantId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!channelId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tạo được phòng chung" });
    return { channelId: channelId as string };
  });

/** Phòng trò chuyện gắn với một công việc (tự tạo lần đầu, thêm người phụ trách). */
export const ensureTaskChatChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ channelId: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: channelId, error } = await ctx.supabase.rpc("ensure_task_chat_channel", {
      _task_id: data.taskId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!channelId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tạo được phòng công việc" });
    return { channelId: channelId as string };
  });

/**
 * Đăng thông báo đổi trạng thái/tiến độ công việc vào đúng phòng của công việc.
 * Ghi qua RLS của người dùng; phòng được tạo idempotent bởi RPC.
 */
export const announceTaskStatusInRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        status: z.enum(["todo", "in_progress", "blocked", "done", "canceled"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ channelId: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: channelId, error } = await ctx.supabase.rpc("ensure_task_chat_channel", {
      _task_id: data.taskId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!channelId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tạo được phòng công việc" });

    const labels: Record<string, string> = {
      todo: "Cần làm",
      in_progress: "Đang thực hiện",
      blocked: "Bị chặn",
      done: "Hoàn thành",
      canceled: "Đã huỷ",
    };
    const { data: ch } = await ctx.supabase
      .from("chat_channels")
      .select("tenant_id")
      .eq("id", channelId as string)
      .maybeSingle();
    if (!ch)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });

    const body = `Cập nhật tiến độ: trạng thái → ${labels[data.status] ?? data.status}${
      data.note ? `\n${data.note}` : ""
    }`;
    const { error: insErr } = await ctx.supabase.from("chat_messages").insert({
      channel_id: channelId as string,
      tenant_id: ch.tenant_id,
      author_id: ctx.userId,
      body,
    });
    if (insErr) mapPgError(insErr, "PERMISSION_DENIED");
    return { channelId: channelId as string };
  });

/**
 * Đăng tin nhắn của người dùng vào đúng phòng chat của công việc (idempotent tạo phòng).
 * Dùng khi gửi tin từ Work Graph để tin xuất hiện cả trong phòng chat lẫn dòng thời gian.
 */
export const postTaskRoomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        body: z.string().trim().min(1).max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ channelId: string }> => {
    const ctx = context as unknown as Ctx;
    const { data: channelId, error } = await ctx.supabase.rpc("ensure_task_chat_channel", {
      _task_id: data.taskId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!channelId)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tạo được phòng công việc" });

    const { data: ch } = await ctx.supabase
      .from("chat_channels")
      .select("tenant_id")
      .eq("id", channelId as string)
      .maybeSingle();
    if (!ch)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });

    const { error: insErr } = await ctx.supabase.from("chat_messages").insert({
      channel_id: channelId as string,
      tenant_id: ch.tenant_id,
      author_id: ctx.userId,
      body: data.body,
    });
    if (insErr) mapPgError(insErr, "PERMISSION_DENIED");
    return { channelId: channelId as string };
  });

export type TaskChatMessage = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  isAi: boolean;
};

/** Tin nhắn gần nhất của phòng gắn công việc — dùng cho dòng thời gian công việc. */
export const listTaskChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ taskId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() })
      .parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ channelId: string | null; messages: TaskChatMessage[] }> => {
      const ctx = context as unknown as Ctx;
      const { data: ch, error } = await ctx.supabase
        .from("chat_channels")
        .select("id")
        .eq("task_id", data.taskId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) mapPgError(error);
      if (!ch?.id) return { channelId: null, messages: [] };
      const channelId = ch.id as string;
      const { data: rows, error: msgErr } = await ctx.supabase
        .from("chat_messages")
        .select("id, body, author_id, created_at, is_ai")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 20);
      if (msgErr) mapPgError(msgErr);
      const list = (rows ?? []) as Array<{
        id: string;
        body: string | null;
        author_id: string;
        created_at: string;
        is_ai: boolean | null;
      }>;
      const names = await displayNames(
        ctx,
        list.map((r) => r.author_id),
      );
      return {
        channelId,
        messages: list.reverse().map((r) => ({
          id: r.id,
          body: r.body ?? "",
          authorId: r.author_id,
          authorName: names.get(r.author_id) ?? "Thành viên",
          createdAt: r.created_at,
          isAi: !!r.is_ai,
        })),
      };
    },
  );

export type TaskDirectConversation = {
  userId: string;
  name: string;
  channelId: string | null;
  lastMessageAt: string | null;
  preview: string | null;
};

/**
 * Các cuộc trò chuyện 1-1 liên quan tới một công việc: người phụ trách + người tạo.
 * Chỉ trả phòng DM mà chính người gọi là thành viên (RLS), không lộ tin riêng của người khác.
 */
export const listTaskDirectConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ people: TaskDirectConversation[] }> => {
    const ctx = context as unknown as Ctx;

    const [assigneesRes, taskRes] = await Promise.all([
      ctx.supabase.from("task_assignees").select("user_id").eq("task_id", data.taskId),
      ctx.supabase.from("tasks").select("created_by").eq("id", data.taskId).maybeSingle(),
    ]);
    const ids = new Set<string>();
    for (const r of (assigneesRes.data ?? []) as Array<{ user_id: string }>) ids.add(r.user_id);
    const creator = (taskRes.data as { created_by?: string } | null)?.created_by;
    if (creator) ids.add(creator);
    ids.delete(ctx.userId);
    const targets = Array.from(ids);
    if (targets.length === 0) return { people: [] };

    // Các phòng tôi tham gia → tìm DM chung với từng người.
    const { data: mineRows } = await ctx.supabase
      .from("chat_members")
      .select("channel_id")
      .eq("user_id", ctx.userId);
    const mineIds = ((mineRows ?? []) as Array<{ channel_id: string }>).map((r) => r.channel_id);

    const dmByUser = new Map<string, string>();
    if (mineIds.length > 0) {
      const { data: dmRows } = await ctx.supabase
        .from("chat_channels")
        .select("id, kind, deleted_at")
        .in("id", mineIds)
        .eq("kind", "dm")
        .is("deleted_at", null);
      const dmIds = ((dmRows ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (dmIds.length > 0) {
        const { data: others } = await ctx.supabase
          .from("chat_members")
          .select("channel_id, user_id")
          .in("channel_id", dmIds)
          .in("user_id", targets);
        for (const row of (others ?? []) as Array<{ channel_id: string; user_id: string }>) {
          if (!dmByUser.has(row.user_id)) dmByUser.set(row.user_id, row.channel_id);
        }
      }
    }

    const names = await displayNames(ctx, targets);
    const previews = new Map<string, { at: string | null; body: string | null }>();
    await Promise.all(
      Array.from(dmByUser.values()).map(async (cid) => {
        const { data: last } = await ctx.supabase
          .from("chat_messages")
          .select("body, created_at")
          .eq("channel_id", cid)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const row = ((last ?? []) as Array<{ body: string | null; created_at: string }>)[0];
        previews.set(cid, { at: row?.created_at ?? null, body: row?.body ?? null });
      }),
    );

    const people = targets.map((userId) => {
      const channelId = dmByUser.get(userId) ?? null;
      const preview = channelId ? previews.get(channelId) : undefined;
      return {
        userId,
        name: names.get(userId) ?? "Thành viên",
        channelId,
        lastMessageAt: preview?.at ?? null,
        preview: preview?.body ?? null,
      };
    });
    people.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    return { people };
  });
