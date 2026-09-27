// Website CMS: nội dung công khai (dịch vụ, bảng giá, bài viết) + yêu cầu tư vấn → Công việc.
// Đọc công khai qua publishable client (RLS chỉ cho bản published); ghi qua RLS admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const kindSchema = z.enum(["service", "pricing", "article", "plan"]);
export type CmsKind = z.infer<typeof kindSchema>;

export type CmsEntry = {
  id: string;
  kind: CmsKind;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  data: Record<string, any>;
  status: "draft" | "published";
  sortOrder: number;
  updatedAt: string;
  coverPath: string | null;
  coverUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishAt: string | null;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const map = (r: any): CmsEntry => ({
  id: r.id,
  kind: r.kind,
  slug: r.slug,
  title: r.title,
  summary: r.summary,
  body: r.body,
  data: (r.data ?? {}) as Record<string, any>,
  status: r.status,
  sortOrder: r.sort_order,
  updatedAt: r.updated_at,
  coverPath: r.cover_path ?? null,
  coverUrl: null,
  seoTitle: r.seo_title ?? null,
  seoDescription: r.seo_description ?? null,
  publishAt: r.publish_at ?? null,
});

async function withCovers(sb: any, entries: CmsEntry[]): Promise<CmsEntry[]> {
  const paths = entries.map((e) => e.coverPath).filter(Boolean) as string[];
  if (!paths.length) return entries;
  const { data } = await sb.storage.from("cms-media").createSignedUrls(paths, 60 * 60 * 24);
  const byPath = new Map<string, string>(
    ((data ?? []) as any[]).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]),
  );
  return entries.map((e) => ({ ...e, coverUrl: e.coverPath ? (byPath.get(e.coverPath) ?? null) : null }));
}

const COLS =
  "id, kind, slug, title, summary, body, data, status, sort_order, updated_at, cover_path, seo_title, seo_description, publish_at";

export const listPublishedCms = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ kind: kindSchema, limit: z.number().int().max(50).default(20) }).parse(i),
  )
  .handler(async ({ data }): Promise<CmsEntry[]> => {
    const sb = publicClient();
    const { data: rows, error } = await sb
      .from("cms_entries")
      .select(COLS)
      .eq("kind", data.kind)
      .eq("status", "published")
      .order("sort_order")
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return withCovers(sb, (rows ?? []).map(map));
  });

export const submitConsultation = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(40).default(""),
        company: z.string().trim().max(200).default(""),
        service: z.string().trim().max(120).default(""),
        message: z.string().trim().max(4000).default(""),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { error } = await publicClient().rpc("submit_consultation_request", {
      _name: data.name,
      _email: data.email,
      _phone: data.phone,
      _company: data.company,
      _service: data.service,
      _message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitConsultationBooking = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(40).default(""),
        company: z.string().trim().max(200).default(""),
        service: z.string().trim().max(120).default(""),
        message: z.string().trim().max(4000).default(""),
        preferredAt: z.string().datetime({ offset: true }),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { data: res, error } = await (publicClient() as any).rpc("submit_consultation_booking", {
      _name: data.name,
      _email: data.email,
      _phone: data.phone,
      _company: data.company,
      _service: data.service,
      _message: data.message,
      _preferred_at: data.preferredAt,
    });
    if (error) throw new Error(error.message);
    return { token: (res as any).token as string };
  });

export type ConsultationBooking = {
  service: string;
  name: string;
  created_at: string;
  task_status: string | null;
  assigned: boolean;
  start_at: string;
  end_at: string | null;
  meeting_status: string | null;
  meeting_id: string | null;
  invite: string | null;
};

export const getConsultationBooking = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(i))
  .handler(async ({ data }): Promise<ConsultationBooking | null> => {
    const { data: res, error } = await (publicClient() as any).rpc("get_consultation_booking", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    return (res ?? null) as ConsultationBooking | null;
  });

/* ------------------------------- Admin (RLS) ------------------------------- */

export const listCmsEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ kind: kindSchema }).parse(i))
  .handler(async ({ data, context }): Promise<CmsEntry[]> => {
    const { data: rows, error } = await (context.supabase as any)
      .from("cms_entries")
      .select(COLS)
      .eq("kind", data.kind)
      .order("sort_order")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return withCovers(context.supabase, (rows ?? []).map(map));
  });

export const getCmsAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: isAdmin } = await sb.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { isAdmin: false, leadWorkspaceId: null, workspaces: [] };
    const [{ data: setting }, { data: ws }] = await Promise.all([
      sb.from("cms_settings").select("value").eq("key", "lead_workspace").maybeSingle(),
      sb.from("workspaces").select("id, name").is("deleted_at", null).order("name").limit(200),
    ]);
    return {
      isAdmin: true,
      leadWorkspaceId: ((setting?.value as any)?.workspace_id as string | undefined) ?? null,
      workspaces: ((ws ?? []) as any[]).map((w) => ({
        id: w.id as string,
        name: w.name as string,
      })),
    };
  });

export const setLeadWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("cms_settings").upsert({
      key: "lead_workspace",
      value: { workspace_id: data.workspaceId },
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        kind: kindSchema,
        slug: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9-]+$/),
        title: z.string().trim().min(1).max(200),
        summary: z.string().max(1000).nullish(),
        body: z.string().max(50000).nullish(),
        data: z.record(z.string(), z.any()).default({}),
        status: z.enum(["draft", "published"]),
        sortOrder: z.number().int().min(0).max(10000).default(0),
        coverPath: z.string().max(300).nullish(),
        seoTitle: z.string().max(200).nullish(),
        seoDescription: z.string().max(400).nullish(),
        publishAt: z.string().datetime({ offset: true }).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const row = {
      kind: data.kind,
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? null,
      body: data.body ?? null,
      data: data.data,
      status: data.status,
      sort_order: data.sortOrder,
      cover_path: data.coverPath ?? null,
      seo_title: data.seoTitle ?? null,
      seo_description: data.seoDescription ?? null,
      publish_at: data.publishAt ?? null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? sb.from("cms_entries").update(row).eq("id", data.id)
      : sb.from("cms_entries").insert({ ...row, created_by: context.userId });
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("cms_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCmsEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    for (const [i, id] of data.ids.entries()) {
      const { error } = await sb
        .from("cms_entries")
        .update({ sort_order: i * 10, updated_by: context.userId })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------------------- Consultation routing (admin) ---------------------- */

export const getConsultationRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("FORBIDDEN");
    const [{ data: lead }, { data: routing }] = await Promise.all([
      sb.from("cms_settings").select("value").eq("key", "lead_workspace").maybeSingle(),
      sb.from("cms_settings").select("value").eq("key", "consultation_routing").maybeSingle(),
    ]);
    const wsId = ((lead?.value as any)?.workspace_id as string | undefined) ?? null;
    let members: { id: string; name: string }[] = [];
    if (wsId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: wm } = await (supabaseAdmin as any)
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", wsId);
      const ids = ((wm ?? []) as any[]).map((r) => r.user_id as string);
      if (ids.length) {
        const { data: profs } = await (supabaseAdmin as any)
          .from("profiles")
          .select("id, email, display_name")
          .in("id", ids);
        members = ((profs ?? []) as any[])
          .map((p) => ({ id: p.id as string, name: (p.display_name || p.email || p.id) as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return {
      workspaceId: wsId,
      members,
      routing: ((routing?.value ?? {}) as Record<string, string>),
    };
  });

export const setConsultationRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ routing: z.record(z.string().regex(/^[a-z0-9-]+$/), z.string().uuid()) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("cms_settings").upsert({
      key: "consultation_routing",
      value: data.routing,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
