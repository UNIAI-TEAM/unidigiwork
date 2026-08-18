import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List notifications for the current user, newest first. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Get one notification by id (only if it belongs to current user). */
export const getNotification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

/** Mark specific notifications as read. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark all notifications for current user as read. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("is_read", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete notifications by id (only own). */
export const deleteNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Archive / unarchive notifications (stored in meta.archived). */
export const setNotificationsArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error: readErr } = await context.supabase
      .from("notifications")
      .select("id, meta")
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (readErr) throw new Error(readErr.message);
    for (const row of rows ?? []) {
      const meta = { ...((row.meta ?? {}) as Record<string, unknown>), archived: data.archived };
      const { error } = await context.supabase
        .from("notifications")
        .update({ meta: meta as never })
        .eq("id", row.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: rows?.length ?? 0 };
  });

/** Mark notifications as unread (undo of mark-read). */
export const unmarkNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ is_read: false, read_at: null })
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Restore previously deleted notifications by re-inserting them (undo of delete). */
const restoreRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable().optional(),
  type: z.enum(["mention", "task", "meeting", "document", "workflow", "system", "email"]),
  title: z.string(),
  body: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  meta: z.unknown().optional(),
  is_read: z.boolean().optional(),
  read_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export const restoreNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ rows: z.array(restoreRowSchema).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({
      id: r.id,
      user_id: context.userId,
      workspace_id: r.workspace_id ?? null,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      link: r.link ?? null,
      meta: (r.meta ?? {}) as never,
      is_read: r.is_read ?? false,
      read_at: r.read_at ?? null,
      created_at: r.created_at,
    }));
    const { error } = await context.supabase.from("notifications").upsert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Create a notification (used by server-side triggers e.g. new email). */
export const createNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        workspace_id: z.string().uuid().nullable().optional(),
        type: z.enum(["mention", "task", "meeting", "document", "workflow", "system", "email"]),
        title: z.string().min(1),
        body: z.string().optional(),
        link: z.string().optional(),
        meta: z.record(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notifications").insert({
      user_id: data.user_id,
      workspace_id: data.workspace_id ?? null,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      meta: (data.meta ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    try {
      const { sendPushToUsers } = await import("./push-dispatch.server");
      await sendPushToUsers([data.user_id], {
        title: data.title,
        body: data.body ?? "",
        url: data.link ?? "/notifications",
        tag: `notif-${data.type}`,
      });
    } catch {
      // push delivery is best-effort; never block notification creation
    }
    return { ok: true };
  });