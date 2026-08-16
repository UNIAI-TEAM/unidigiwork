// Lệnh nghiệp vụ tin cậy: tạo/cập nhật thư nháp. Dùng chung cho Email Hub và AI Action Layer
// để KHÔNG tồn tại write path riêng cho AI (§12/§138).
export type EmailCtx = { supabase: any; userId: string };

export async function resolveEmailWorkspace(
  ctx: EmailCtx,
): Promise<{ workspaceId: string; tenantId: string }> {
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

export async function resolveEmailRecipients(
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

export async function ensureEmailThread(
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

/** Tạo bản nháp mới (không bao giờ gửi). Trả về draft_id + thread_id. */
export async function createEmailDraftCommand(
  ctx: EmailCtx,
  input: { to: string[]; cc: string[]; subject: string; body: string; threadId?: string | null },
): Promise<{ draft_id: string; thread_id: string }> {
  const scope = await resolveEmailWorkspace(ctx);
  const { toUserIds, ccUserIds } = await resolveEmailRecipients(ctx, input.to, input.cc);
  const threadId = await ensureEmailThread(ctx, scope, input.threadId ?? null, input.subject);
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
      subject: input.subject,
      body: input.body,
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
  return { draft_id: msg.id as string, thread_id: threadId };
}
