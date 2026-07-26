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
      .object({
        folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).default("inbox"),
        search: z.string().default(""),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Escape PostgREST-sensitive characters for ilike inside .or()
    const s = data.search.replace(/[,()%]/g, " ").trim();
    let q = context.supabase
      .from("email_states")
      .select("message_id, folder, is_read, is_starred, email_messages!inner(*)", {
        count: "exact",
      })
      .eq("user_id", context.userId)
      .eq("folder", data.folder);
    if (s) {
      q = q.or(`subject.ilike.%${s}%,body.ilike.%${s}%`, {
        referencedTable: "email_messages",
      });
    }
    const { data: rows, error, count } = await q
      .order("created_at", { referencedTable: "email_messages", ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    const items = (rows ?? [])
      .map((r) => ({
        message: r.email_messages,
        folder: r.folder,
        is_read: r.is_read,
        is_starred: r.is_starred,
      }))
      .filter((r) => r.message != null);

    // Enrich with sender profile info
    const senderIds = Array.from(
      new Set(items.map((r) => (r.message as { from_user_id: string }).from_user_id)),
    );
    let senderMap = new Map<string, { display_name: string | null; email: string }>();
    if (senderIds.length) {
      const { data: senders } = await context.supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", senderIds);
      senderMap = new Map(
        (senders ?? []).map((p) => [p.id, { display_name: p.display_name, email: p.email }]),
      );
    }

    return {
      items: items.map((r) => ({
        ...r,
        sender:
          senderMap.get((r.message as { from_user_id: string }).from_user_id) ?? null,
      })),
      total: count ?? 0,
    };
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
    if (!thread) return null;
    const messages = (thread.email_messages ?? []).slice().sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const senderIds = Array.from(
      new Set(messages.map((m: { from_user_id: string }) => m.from_user_id)),
    );
    let senderMap = new Map<string, { display_name: string | null; email: string }>();
    if (senderIds.length) {
      const { data: senders } = await context.supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", senderIds);
      senderMap = new Map(
        (senders ?? []).map((p) => [p.id, { display_name: p.display_name, email: p.email }]),
      );
    }
    return {
      id: thread.id,
      subject: thread.subject,
      workspace_id: thread.workspace_id,
      last_message_at: thread.last_message_at,
      messages: messages.map((m: Record<string, unknown> & { from_user_id: string }) => ({
        ...m,
        sender: senderMap.get(m.from_user_id) ?? null,
      })),
    };
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
        .insert({ workspace_id: wm.workspace_id, tenant_id: wm.workspace_id, subject: data.subject })
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
        tenant_id: wm.workspace_id,
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
      { user_id: context.userId, message_id: msg.id, tenant_id: wm.workspace_id, folder: "sent", is_read: true },
      ...[...new Set([...toUserIds, ...ccUserIds])]
        .filter((uid) => uid !== context.userId)
        .map((uid) => ({ user_id: uid, message_id: msg.id, tenant_id: wm.workspace_id, folder: "inbox", is_read: false })),
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