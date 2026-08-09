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


type EmailCtx = { supabase: any; userId: string };

/** Resolve caller's primary workspace + its tenant. */
async function resolveWorkspace(ctx: EmailCtx): Promise<{ workspaceId: string; tenantId: string }> {
  const { data: wm, error } = await ctx.supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(id, tenant_id)")
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ws = (wm as any)?.workspaces;
  if (!ws?.id || !ws?.tenant_id) throw new Error("Bạn cần tham gia workspace trước khi gửi email");
  return { workspaceId: ws.id as string, tenantId: ws.tenant_id as string };
}

/** Map email addresses to internal user ids (profiles). */
async function resolveRecipients(
  ctx: EmailCtx,
  to: string[],
  cc: string[],
): Promise<{ toUserIds: string[]; ccUserIds: string[]; unknown: string[] }> {
  const all = Array.from(new Set([...to, ...cc]));
  if (all.length === 0) return { toUserIds: [], ccUserIds: [], unknown: [] };
  const { data: profs, error } = await ctx.supabase.from("profiles").select("id, email").in("email", all);
  if (error) throw new Error(error.message);
  const map = new Map((profs ?? []).map((p: { email: string; id: string }) => [p.email, p.id] as const));
  return {
    toUserIds: to.map((e) => map.get(e)).filter((v): v is string => !!v),
    ccUserIds: cc.map((e) => map.get(e)).filter((v): v is string => !!v),
    unknown: all.filter((e) => !map.has(e)),
  };
}

/** Ensure a thread exists for a draft/message. */
async function ensureThread(
  ctx: EmailCtx,
  scope: { workspaceId: string; tenantId: string },
  threadId: string | null | undefined,
  subject: string,
): Promise<string> {
  if (threadId) return threadId;
  const { data: t, error } = await ctx.supabase
    .from("email_threads")
    .insert({
      workspace_id: scope.workspaceId,
      tenant_id: scope.tenantId,
      subject: subject || "(Không tiêu đề)",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return t.id as string;
}

const draftSchema = z.object({
  draft_id: z.string().uuid().optional(),
  thread_id: z.string().uuid().optional(),
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().max(500).default(""),
  body: z.string().max(100000).default(""),
});

/** Create or update a draft message (stored in DB, visible in folder "drafts"). */
export const saveEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as EmailCtx;
    const scope = await resolveWorkspace(ctx);
    const { toUserIds, ccUserIds } = await resolveRecipients(ctx, data.to, data.cc);

    if (data.draft_id) {
      const { data: existing, error: exErr } = await ctx.supabase
        .from("email_messages")
        .select("id, thread_id, is_draft, from_user_id")
        .eq("id", data.draft_id)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (!existing || existing.from_user_id !== ctx.userId || !existing.is_draft) {
        throw new Error("Không tìm thấy bản nháp");
      }
      const { error } = await ctx.supabase
        .from("email_messages")
        .update({
          to_user_ids: toUserIds,
          cc_user_ids: ccUserIds,
          subject: data.subject,
          body: data.body,
          updated_by: ctx.userId,
        })
        .eq("id", data.draft_id);
      if (error) throw new Error(error.message);
      if (data.subject) {
        await ctx.supabase
          .from("email_threads")
          .update({ subject: data.subject, updated_by: ctx.userId })
          .eq("id", existing.thread_id);
      }
      return { ok: true, draft_id: data.draft_id as string, thread_id: existing.thread_id as string };
    }

    const threadId = await ensureThread(ctx, scope, data.thread_id, data.subject);
    const { data: msg, error } = await ctx.supabase
      .from("email_messages")
      .insert({
        thread_id: threadId,
        workspace_id: scope.workspaceId,
        tenant_id: scope.tenantId,
        from_user_id: ctx.userId,
        created_by: ctx.userId,
        updated_by: ctx.userId,
        to_user_ids: toUserIds,
        cc_user_ids: ccUserIds,
        subject: data.subject,
        body: data.body,
        is_draft: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: sErr } = await ctx.supabase.from("email_states").insert({
      user_id: ctx.userId,
      message_id: msg.id,
      tenant_id: scope.tenantId,
      folder: "drafts",
      is_read: true,
    });
    if (sErr) throw new Error(sErr.message);
    return { ok: true, draft_id: msg.id as string, thread_id: threadId };
  });

/** Load a draft for editing (recipient emails resolved back from user ids). */
export const getEmailDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as EmailCtx;
    const { data: msg, error } = await ctx.supabase
      .from("email_messages")
      .select("id, thread_id, subject, body, to_user_ids, cc_user_ids, is_draft, from_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg || msg.from_user_id !== ctx.userId || !msg.is_draft) return null;
    const ids = Array.from(new Set([...(msg.to_user_ids ?? []), ...(msg.cc_user_ids ?? [])]));
    let idToEmail = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await ctx.supabase.from("profiles").select("id, email").in("id", ids);
      idToEmail = new Map((profs ?? []).map((p: { id: string; email: string }) => [p.id, p.email] as const));
    }
    return {
      id: msg.id as string,
      thread_id: msg.thread_id as string,
      subject: (msg.subject as string) ?? "",
      body: (msg.body as string) ?? "",
      to: ((msg.to_user_ids ?? []) as string[]).map((i) => idToEmail.get(i)).filter(Boolean) as string[],
      cc: ((msg.cc_user_ids ?? []) as string[]).map((i) => idToEmail.get(i)).filter(Boolean) as string[],
    };
  });

/** Delete a draft (message + own state row). */
export const deleteEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as EmailCtx;
    await ctx.supabase.from("email_states").delete().eq("message_id", data.id).eq("user_id", ctx.userId);
    const { error } = await ctx.supabase
      .from("email_messages")
      .delete()
      .eq("id", data.id)
      .eq("from_user_id", ctx.userId)
      .eq("is_draft", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const sendSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().default(""),
  thread_id: z.string().uuid().optional(),
  draft_id: z.string().uuid().optional(),
});

/** Send an email. Recipients are resolved from emails → user_ids via profiles. */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as EmailCtx;
    const scope = await resolveWorkspace(ctx);
    const { toUserIds, ccUserIds, unknown } = await resolveRecipients(ctx, data.to, data.cc ?? []);
    if (toUserIds.length === 0) {
      throw new Error(
        unknown.length
          ? `Không tìm thấy người nhận trong hệ thống: ${unknown.join(", ")}`
          : "Không tìm thấy người nhận trong hệ thống",
      );
    }

    const sentAt = new Date().toISOString();
    let threadId = data.thread_id ?? null;
    let messageId: string;

    if (data.draft_id) {
      // Promote an existing draft: giữ nguyên thread/message, chỉ đổi trạng thái.
      const { data: draft, error: dErr } = await ctx.supabase
        .from("email_messages")
        .select("id, thread_id, from_user_id, is_draft")
        .eq("id", data.draft_id)
        .maybeSingle();
      if (dErr) throw new Error(dErr.message);
      if (!draft || draft.from_user_id !== ctx.userId || !draft.is_draft) {
        throw new Error("Không tìm thấy bản nháp để gửi");
      }
      threadId = draft.thread_id as string;
      messageId = draft.id as string;
      const { error: uErr } = await ctx.supabase
        .from("email_messages")
        .update({
          to_user_ids: toUserIds,
          cc_user_ids: ccUserIds,
          subject: data.subject,
          body: data.body,
          is_draft: false,
          sent_at: sentAt,
          updated_by: ctx.userId,
        })
        .eq("id", messageId);
      if (uErr) throw new Error(uErr.message);
      const { error: msErr } = await ctx.supabase
        .from("email_states")
        .update({ folder: "sent", is_read: true })
        .eq("message_id", messageId)
        .eq("user_id", ctx.userId);
      if (msErr) throw new Error(msErr.message);
    } else {
      threadId = await ensureThread(ctx, scope, threadId, data.subject);
      const { data: msg, error: mErr } = await ctx.supabase
        .from("email_messages")
        .insert({
          thread_id: threadId,
          workspace_id: scope.workspaceId,
          tenant_id: scope.tenantId,
          from_user_id: ctx.userId,
          created_by: ctx.userId,
          updated_by: ctx.userId,
          to_user_ids: toUserIds,
          cc_user_ids: ccUserIds,
          subject: data.subject,
          body: data.body,
          is_draft: false,
          sent_at: sentAt,
        })
        .select("id")
        .single();
      if (mErr) throw new Error(mErr.message);
      messageId = msg.id as string;
      const { error: sErr } = await ctx.supabase.from("email_states").insert({
        user_id: ctx.userId,
        message_id: messageId,
        tenant_id: scope.tenantId,
        folder: "sent",
        is_read: true,
      });
      if (sErr) throw new Error(sErr.message);
    }

    // Inbox state cho người nhận (idempotent qua upsert theo message + user).
    const recipients = [...new Set([...toUserIds, ...ccUserIds])].filter((uid) => uid !== ctx.userId);
    if (recipients.length) {
      const { error: rErr } = await ctx.supabase.from("email_states").upsert(
        recipients.map((uid) => ({
          user_id: uid,
          message_id: messageId,
          tenant_id: scope.tenantId,
          folder: "inbox",
          is_read: false,
        })),
        { onConflict: "message_id,user_id" },
      );
      if (rErr) throw new Error(rErr.message);
    }

    // Đồng bộ thread: tiêu đề + thời điểm tin cuối.
    await ctx.supabase
      .from("email_threads")
      .update({ subject: data.subject, last_message_at: sentAt, updated_by: ctx.userId })
      .eq("id", threadId);

    const { data: sender } = await ctx.supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", ctx.userId)
      .maybeSingle();

    const notifRows = recipients.map((uid) => ({
      user_id: uid,
      workspace_id: scope.workspaceId,
      tenant_id: scope.tenantId,
      type: "email",
      title: data.subject,
      body: data.body.slice(0, 240),
      link: `/email/${threadId}`,
      meta: { actor: sender?.display_name ?? sender?.email ?? "" } as never,
    }));
    if (notifRows.length) {
      await ctx.supabase.from("notifications").insert(notifRows);
    }

    return { ok: true, thread_id: threadId as string, message_id: messageId, unknown_recipients: unknown };
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