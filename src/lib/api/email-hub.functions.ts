import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailCtx } from "./email-draft.server";

const ATTACHMENT_BUCKET = "email-attachments";

export type EmailLabel = { id: string; name: string; color: string };
export type EmailRule = {
  id: string;
  name: string;
  is_enabled: boolean;
  cond_from: string | null;
  cond_subject_contains: string | null;
  cond_has_attachment: boolean;
  act_label_id: string | null;
  act_folder: string | null;
  act_mark_read: boolean;
};
export type EmailAttachment = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  object_key: string;
};
export type EmailSearchItem = {
  message_id: string;
  thread_id: string;
  subject: string;
  body: string;
  from_user_id: string;
  sender_name: string | null;
  sender_email: string | null;
  sent_at: string | null;
  created_at: string;
  is_draft: boolean;
  folder: string;
  is_read: boolean;
  is_starred: boolean;
  attachment_count: number;
  label_ids: string[];
};

async function tenantOf(ctx: EmailCtx): Promise<string> {
  const { resolveEmailWorkspace } = await import("./email-draft.server");
  const scope = await resolveEmailWorkspace(ctx);
  return scope.tenantId;
}

/* ============ Labels ============ */

export const listEmailLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailLabel[]> => {
    const { data, error } = await context.supabase
      .from("email_labels")
      .select("id, name, color")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailLabel[];
  });

export const upsertEmailLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        name: z.string().min(1).max(60),
        color: z.string().max(20).default("#2563eb"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context as unknown as EmailCtx);
    const { data: id, error } = await (context.supabase.rpc as any)("upsert_email_label", {
      _tenant_id: tenantId,
      _id: data.id ?? null,
      _name: data.name,
      _color: data.color,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const deleteEmailLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context as unknown as EmailCtx);
    const { error } = await context.supabase.rpc("delete_email_label", {
      _tenant_id: tenantId,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMessageLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        message_id: z.string().uuid(),
        label_ids: z.array(z.string().uuid()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("apply_email_labels", {
      _message_id: data.message_id,
      _label_ids: data.label_ids,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Rules ============ */

export const listEmailRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailRule[]> => {
    const { data, error } = await context.supabase
      .from("email_rules")
      .select(
        "id, name, is_enabled, cond_from, cond_subject_contains, cond_has_attachment, act_label_id, act_folder, act_mark_read",
      )
      .eq("user_id", context.userId)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailRule[];
  });

export const upsertEmailRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        name: z.string().min(1).max(120),
        is_enabled: z.boolean().default(true),
        cond_from: z.string().max(200).default(""),
        cond_subject_contains: z.string().max(200).default(""),
        cond_has_attachment: z.boolean().default(false),
        act_label_id: z.string().uuid().nullish(),
        act_folder: z.enum(["inbox", "archive", "trash"]).nullish(),
        act_mark_read: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context as unknown as EmailCtx);
    const { data: id, error } = await (context.supabase.rpc as any)("upsert_email_rule", {
      _tenant_id: tenantId,
      _id: data.id ?? null,
      _name: data.name,
      _is_enabled: data.is_enabled,
      _cond_from: data.cond_from,
      _cond_subject_contains: data.cond_subject_contains,
      _cond_has_attachment: data.cond_has_attachment,
      _act_label_id: data.act_label_id ?? null,
      _act_folder: data.act_folder ?? null,
      _act_mark_read: data.act_mark_read,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const deleteEmailRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_email_rule", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Server-side search ============ */

export const searchEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        folder: z.enum(["inbox", "sent", "drafts", "archive", "trash"]).nullish(),
        starred_only: z.boolean().default(false),
        keyword: z.string().default(""),
        from: z.string().default(""),
        to: z.string().default(""),
        date_from: z.string().nullish(),
        date_to: z.string().nullish(),
        has_attachment: z.boolean().default(false),
        label_ids: z.array(z.string().uuid()).default([]),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ items: EmailSearchItem[]; total: number }> => {
    const { data: rows, error } = await (context.supabase.rpc as any)("search_email_messages", {
      _folder: data.folder ?? null,
      _starred_only: data.starred_only,
      _keyword: data.keyword,
      _from_query: data.from,
      _to_query: data.to,
      _date_from: data.date_from ? new Date(data.date_from).toISOString() : null,
      _date_to: data.date_to ? new Date(`${data.date_to}T23:59:59`).toISOString() : null,
      _has_attachment: data.has_attachment,
      _label_ids: data.label_ids,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as (EmailSearchItem & { total_count: number })[];
    return {
      items: list.map(({ total_count: _ignored, ...rest }) => ({
        ...rest,
        label_ids: rest.label_ids ?? [],
      })),
      total: Number(list[0]?.total_count ?? 0),
    };
  });

/* ============ Attachments ============ */

export const listEmailAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ message_ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EmailAttachment[]> => {
    if (data.message_ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("email_attachments")
      .select("id, message_id, file_name, mime_type, size_bytes, object_key")
      .in("message_id", data.message_ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as EmailAttachment[];
  });

export const registerEmailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        message_id: z.string().uuid(),
        object_key: z.string().min(1).max(500),
        file_name: z.string().min(1).max(260),
        mime_type: z.string().max(200).nullish(),
        size_bytes: z.number().int().min(0).max(26_214_400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase.rpc as any)("register_email_attachment", {
      _message_id: data.message_id,
      _object_key: data.object_key,
      _file_name: data.file_name,
      _mime_type: data.mime_type ?? null,
      _size_bytes: data.size_bytes,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const deleteEmailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("email_attachments")
      .select("id, object_key")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Không tìm thấy tệp đính kèm");
    await context.supabase.storage.from(ATTACHMENT_BUCKET).remove([row.object_key as string]);
    const { error: dErr } = await context.supabase
      .from("email_attachments")
      .delete()
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    return { ok: true };
  });

export const getEmailAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("email_attachments")
      .select("object_key, file_name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Không tìm thấy tệp đính kèm");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(row.object_key as string, 300, { download: row.file_name as string });
    if (sErr) throw new Error(sErr.message);
    return { url: signed?.signedUrl ?? null };
  });

/* ============ Signature ============ */

export const getEmailSignature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ body: string; is_enabled: boolean }> => {
    const { data, error } = await context.supabase
      .from("email_signatures")
      .select("body, is_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { body: data?.body ?? "", is_enabled: data?.is_enabled ?? true };
  });

export const saveEmailSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ body: z.string().max(4000).default(""), is_enabled: z.boolean().default(true) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context as unknown as EmailCtx);
    const { error } = await context.supabase.from("email_signatures").upsert(
      {
        user_id: context.userId,
        tenant_id: tenantId,
        body: data.body,
        is_enabled: data.is_enabled,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
