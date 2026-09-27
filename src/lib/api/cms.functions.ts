// Website CMS: nội dung công khai (dịch vụ, bảng giá, bài viết) + yêu cầu tư vấn → Công việc.
// Đọc công khai qua publishable client (RLS chỉ cho bản published); ghi qua RLS admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const kindSchema = z.enum(["service", "pricing", "article"]);
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
});

const COLS = "id, kind, slug, title, summary, body, data, status, sort_order, updated_at";

export const listPublishedCms = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ kind: kindSchema, limit: z.number().int().max(50).default(20) }).parse(i),
  )
  .handler(async ({ data }): Promise<CmsEntry[]> => {
    const { data: rows, error } = await publicClient()
      .from("cms_entries")
      .select(COLS)
      .eq("kind", data.kind)
      .eq("status", "published")
      .order("sort_order")
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(map);
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
    return (rows ?? []).map(map);
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
