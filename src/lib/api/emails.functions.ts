import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Return the current user's primary workspace id (first membership). */
export const getMyPrimaryWorkspaceId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.workspace_id ?? null;
  });

/** List email messages in a folder for the current user (grouped later by thread). */
export const listEmailMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).default("inbox") })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("email_states")
      .select("message_id, folder, is_read, is_starred, email_messages(*)")
      .eq("user_id", context.userId)
      .eq("folder", data.folder)
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .map((r) => ({
        message: r.email_messages,
        folder: r.folder,
        is_read: r.is_read,
        is_starred: r.is_starred,
      }))
      .filter((r) => r.message != null)
      .sort((a, b) => {
        const at = (a.message as { sent_at: string | null; created_at: string }).sent_at ?? (a.message as { created_at: string }).created_at;
        const bt = (b.message as { sent_at: string | null; created_at: string }).sent_at ?? (b.message as { created_at: string }).created_at;
        return bt.localeCompare(at);
      });
  });

/** Get a thread with all its messages. */
export const getEmailThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: thread, error } = await context.supabase
      .from("email_threads")
      .select("*, email_messages(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return thread;
  });

const sendSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().default(""),
  thread_id: z.string().uuid().optional(),
});

/** Send an email. Recipients are resolved from emails → user_ids via profiles. */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: wm, error: wmErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (wmErr) throw new Error(wmErr.message);
    if (!wm?.workspace_id) throw new Error("Bạn cần tham gia workspace trước khi gửi email");

    const allEmails = Array.from(new Set([...data.to, ...(data.cc ?? [])]));
    const { data: profs, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, email")
      .in("email", allEmails);
    if (pErr) throw new Error(pErr.message);
    const emailToId = new Map((profs ?? []).map((p) => [p.email, p.id] as const));
    const toUserIds = data.to.map((e) => emailToId.get(e)).filter((v): v is string => !!v);
    const ccUserIds = (data.cc ?? []).map((e) => emailToId.get(e)).filter((v): v is string => !!v);
    if (toUserIds.length === 0) throw new Error("Không tìm thấy người nhận trong hệ thống");

    let threadId = data.thread_id ?? null;
    if (!threadId) {
      const { data: t, error: tErr } = await context.supabase
        .from("email_threads")
        .insert({ workspace_id: wm.workspace_id, subject: data.subject })
        .select("id")
        .single();
      if (tErr) throw new Error(tErr.message);
      threadId = t.id;
    }

    const { data: msg, error: mErr } = await context.supabase
      .from("email_messages")
      .insert({
        thread_id: threadId,
        workspace_id: wm.workspace_id,
        from_user_id: context.userId,
        to_user_ids: toUserIds,
        cc_user_ids: ccUserIds,
        subject: data.subject,
        body: data.body,
        is_draft: false,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mErr) throw new Error(mErr.message);

    // Per-user state rows
    const stateRows = [
      { user_id: context.userId, message_id: msg.id, folder: "sent", is_read: true },
      ...[...new Set([...toUserIds, ...ccUserIds])]
        .filter((uid) => uid !== context.userId)
        .map((uid) => ({ user_id: uid, message_id: msg.id, folder: "inbox", is_read: false })),
    ];
    const { error: sErr } = await context.supabase.from("email_states").insert(stateRows);
    if (sErr) throw new Error(sErr.message);

    // Sender profile for notif label
    const { data: sender } = await context.supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    // Notify recipients
    const notifRows = [...new Set([...toUserIds, ...ccUserIds])]
      .filter((uid) => uid !== context.userId)
      .map((uid) => ({
        user_id: uid,
        workspace_id: wm.workspace_id,
        type: "email",
        title: data.subject,
        body: data.body.slice(0, 240),
        link: `/email/${threadId}`,
        meta: { actor: sender?.display_name ?? sender?.email ?? "" } as never,
      }));
    if (notifRows.length) {
      await context.supabase.from("notifications").insert(notifRows);
    }

    return { ok: true, thread_id: threadId, message_id: msg.id };
  });

/** Move messages to a folder for current user. */
export const moveEmailMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        message_ids: z.array(z.string().uuid()).min(1),
        folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_states")
      .update({ folder: data.folder })
      .in("message_id", data.message_ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark messages read/unread for current user. */
export const setEmailMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ message_ids: z.array(z.string().uuid()).min(1), is_read: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_states")
      .update({ is_read: data.is_read })
      .in("message_id", data.message_ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });