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
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ChatMessageDTO[]> => {
    const ctx = context as unknown as Ctx;
    let query = ctx.supabase
      .from("chat_messages")
      .select("id, channel_id, body, author_id, created_at, edited_at")
      .eq("channel_id", data.channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.q && data.q.trim()) query = query.ilike("body", `%${data.q.trim()}%`);
    const { data: rows, error } = await query;
    if (error) mapPgError(error);
    const list = (rows ?? []) as any[];
    const names = await displayNames(ctx, list.map((r) => r.author_id));
    return list
      .reverse()
      .map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        body: r.body,
        authorId: r.author_id,
        authorName: names.get(r.author_id) ?? "Thành viên",
        createdAt: r.created_at,
        editedAt: r.edited_at,
        isMine: r.author_id === ctx.userId,
      }));
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ channelId: z.string().uuid(), body: z.string().trim().min(1).max(8000) }).parse(i),
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
      })
      .select("id")
      .single();
    if (error) mapPgError(error, "PERMISSION_DENIED");
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
