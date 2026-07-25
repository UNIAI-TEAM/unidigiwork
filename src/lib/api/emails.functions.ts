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

/** List email threads user participates in, most recently active first. */
export const listEmailThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).default("inbox") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: states, error } = await context.supabase
      .from("email_states")
      .select("thread_id, is_read, is_starred, folder, email_threads(id, subject, workspace_id, last_activity_at, created_at)")
      .eq("user_id", context.userId)
      .eq("folder", data.folder)
      .is("message_id", null)
      .order("thread_id", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (states ?? []).map((s) => ({
      thread: s.email_threads,
      is_read: s.is_read,
      is_starred: s.is_starred,
      folder: s.folder,
    }));
  });

/** Get a thread with its messages. */
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
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().default(""),
  thread_id: z.string().uuid().optional(),
});

/** Send an email. Creates thread + message and per-user email_states. */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Primary workspace
    const { data: wm, error: wmErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (wmErr) throw new Error(wmErr.message);
    if (!wm?.workspace_id) throw new Error("Bạn cần tham gia workspace trước khi gửi email");

    // Sender profile
    const { data: sender } = await context.supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", context.userId)
      .maybeSingle();

    // Resolve recipient profiles (may not all exist)
    const allRecipients = Array.from(new Set([...data.to, ...(data.cc ?? []), ...(data.bcc ?? [])]));
    const { data: recipientProfiles } = await context.supabase
      .from("profiles")
      .select("id, email")
      .in("email", allRecipients);
    const emailToId = new Map((recipientProfiles ?? []).map((p) => [p.email, p.id] as const));

    // Thread
    let threadId = data.thread_id ?? null;
    if (!threadId) {
      const { data: t, error: tErr } = await context.supabase
        .from("email_threads")
        .insert({ workspace_id: wm.workspace_id, subject: data.subject, created_by: context.userId })
        .select("id")
        .single();
      if (tErr) throw new Error(tErr.message);
      threadId = t.id;
    }

    // Message
    const { data: msg, error: mErr } = await context.supabase
      .from("email_messages")
      .insert({
        thread_id: threadId,
        sender_id: context.userId,
        sender_email: sender?.email ?? "",
        sender_name: sender?.display_name ?? null,
        to_emails: data.to,
        cc_emails: data.cc ?? [],
        bcc_emails: data.bcc ?? [],
        subject: data.subject,
        body: data.body,
        is_draft: false,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mErr) throw new Error(mErr.message);

    // Per-user state rows: sender in "sent", recipients (known users) in "inbox"
    const stateRows: Array<{
      user_id: string;
      thread_id: string;
      message_id: string | null;
      folder: string;
      is_read: boolean;
    }> = [
      { user_id: context.userId, thread_id: threadId, message_id: null, folder: "sent", is_read: true },
    ];
    for (const [, uid] of emailToId) {
      if (uid === context.userId) continue;
      stateRows.push({ user_id: uid, thread_id: threadId, message_id: null, folder: "inbox", is_read: false });
    }
    if (stateRows.length) {
      const { error: sErr } = await context.supabase
        .from("email_states")
        .upsert(stateRows, { onConflict: "user_id,thread_id,message_id" });
      if (sErr) throw new Error(sErr.message);
    }

    // Notify recipients
    const notifRows = Array.from(emailToId.values())
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

/** Move threads to a folder for current user. */
export const moveEmailThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        thread_ids: z.array(z.string().uuid()).min(1),
        folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_states")
      .update({ folder: data.folder })
      .in("thread_id", data.thread_ids)
      .eq("user_id", context.userId)
      .is("message_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark threads read/unread for current user. */
export const setEmailThreadsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ thread_ids: z.array(z.string().uuid()).min(1), is_read: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_states")
      .update({ is_read: data.is_read })
      .in("thread_id", data.thread_ids)
      .eq("user_id", context.userId)
      .is("message_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });