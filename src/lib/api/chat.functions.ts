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

async function resolveScope(ctx: Ctx): Promise<{ tenantId: string; role: string; workspaceId: string | null } | null> {
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
      .select("id, name, description, kind, is_private, last_message_at, created_by")
      .eq("tenant_id", scope.tenantId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) mapPgError(error);
    const rows = (chans ?? []) as any[];
    if (rows.length === 0) {
      return { tenantId: scope.tenantId, workspaceId: scope.workspaceId, canCreate: !!scope.workspaceId, channels: [] };
    }
    const ids = rows.map((r) => r.id);
    const [membersRes, myRes] = await Promise.all([
      ctx.supabase.from("chat_members").select("channel_id, user_id, role").in("channel_id", ids),
      ctx.supabase.from("chat_members").select("channel_id, is_favorite, last_read_at, role").eq("user_id", ctx.userId).in("channel_id", ids),
    ]);
    const counts = new Map<string, number>();
    for (const m of membersRes.data ?? []) counts.set(m.channel_id, (counts.get(m.channel_id) ?? 0) + 1);
    const mine = new Map<string, { is_favorite: boolean; last_read_at: string | null; role: string }>();
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
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ messages: ChatMessageDTO[]; hasMore: boolean }> => {
    const ctx = context as unknown as Ctx;
    const limit = data.limit ?? 50;
    let query = ctx.supabase
      .from("chat_messages")
      .select("id, channel_id, body, author_id, created_at, edited_at, parent_message_id, attachments")
      .eq("channel_id", data.channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (data.q && data.q.trim()) query = query.ilike("body", `%${data.q.trim()}%`);
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
        parentAuthorName: parent ? names.get(parent.author_id) ?? "Thành viên" : null,
        parentExcerpt: parent ? String(parent.body).slice(0, 140) : null,
        attachments: Array.isArray(r.attachments) ? (r.attachments as ChatAttachment[]) : [],
      };
    });
    return { messages, hasMore };
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
    if (!ch) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
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
    if (!scope?.workspaceId) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Chưa có không gian làm việc" });
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
    if (!ch) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
    const { error } = await ctx.supabase
      .from("chat_members")
      .upsert(
        { channel_id: data.channelId, user_id: ctx.userId, tenant_id: ch.tenant_id, role: "member" },
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
    const { error } = await ctx.supabase
      .from("chat_channels")
      .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
      .eq("id", data.channelId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

/** Thành viên của một kênh. */
export const listChatChannelMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ChatMemberDTO[]> => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("chat_members")
      .select("user_id, role")
      .eq("channel_id", data.channelId);
    if (error) mapPgError(error);
    const list = (rows ?? []) as Array<{ user_id: string; role: "owner" | "member" }>;
    const { data: users } = await ctx.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", list.map((r) => r.user_id).length ? list.map((r) => r.user_id) : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map<string, any>();
    for (const u of users ?? []) byId.set(u.id, u);
    return list
      .map((r) => ({
        userId: r.user_id,
        name: byId.get(r.user_id)?.display_name ?? byId.get(r.user_id)?.primary_email ?? "Thành viên",
        email: byId.get(r.user_id)?.primary_email ?? null,
        role: r.role,
        isMe: r.user_id === ctx.userId,
      }))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
  });

/** Danh sách người trong tổ chức (để mời vào kênh hoặc mở DM). */
export const listChatPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().uuid().nullish() }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<ChatPersonDTO[]> => {
    const ctx = context as unknown as Ctx;
    const scope = await resolveScope(ctx);
    if (!scope) return [];
    const { data: members, error } = await ctx.supabase
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .limit(500);
    if (error) mapPgError(error);
    const ids = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    if (ids.length === 0) return [];
    const { data: users } = await ctx.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .in("id", ids);
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
    if (!ch) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy kênh chat" });
    const { error } = await ctx.supabase.from("chat_members").upsert(
      { channel_id: data.channelId, user_id: data.userId, tenant_id: ch.tenant_id, role: "member" },
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
    const names = await displayNames(ctx, list.map((r) => r.user_id));
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
      throw new ApiError({ code: "VALIDATION_FAILED", message: "Không thể nhắn tin cho chính mình" });
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
