// Knowledge — CRUD bài viết tri thức theo tenant (knowledge_articles). RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";
const MANAGER_ROLES = ["tenant_owner", "tenant_admin", "manager"];

export type KnowledgeStatus = "draft" | "published" | "archived";

export type KnowledgeArticleDTO = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  coverUrl: string | null;
  status: KnowledgeStatus;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  canEdit: boolean;
};

type Ctx = { supabase: any; userId: string };

type Row = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  cover_url: string | null;
  status: string;
  published_at: string | null;
  view_count: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

async function resolveTenant(ctx: Ctx): Promise<{ tenantId: string; role: string } | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id, role, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
  const rows = (data ?? []) as Array<{ tenant_id: string; role: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  const chosen = (hint ? rows.find((r) => r.tenant_id === hint) : undefined) ?? rows[0];
  return { tenantId: chosen.tenant_id, role: chosen.role };
}

function toDto(r: Row, isManager: boolean, selfId: string): KnowledgeArticleDTO {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? "",
    content: r.content ?? "",
    category: r.category ?? "guide",
    tags: r.tags ?? [],
    coverUrl: r.cover_url,
    status: (r.status as KnowledgeStatus) ?? "draft",
    publishedAt: r.published_at,
    viewCount: r.view_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    canEdit: isManager || r.created_by === selfId,
  };
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export type KnowledgeListResult = {
  tenantId: string | null;
  canManage: boolean;
  articles: KnowledgeArticleDTO[];
  categories: string[];
  tags: string[];
};

export const listKnowledgeArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.enum(["draft", "published", "archived", "all"]).optional(),
        search: z.string().max(200).optional(),
      })
      .optional()
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<KnowledgeListResult> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) return { tenantId: null, canManage: false, articles: [], categories: [], tags: [] };
    let q = ctx.supabase
      .from("knowledge_articles")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .order("updated_at", { ascending: false })
      .limit(300);
    const status = data?.status ?? "all";
    if (status !== "all") q = q.eq("status", status);
    const search = data?.search?.trim();
    if (search) q = q.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    const isManager = MANAGER_ROLES.includes(tenant.role);
    const articles = ((rows ?? []) as Row[]).map((r) => toDto(r, isManager, ctx.userId));
    return {
      tenantId: tenant.tenantId,
      canManage: isManager,
      articles,
      categories: Array.from(new Set(articles.map((a) => a.category).filter(Boolean))).sort(),
      tags: Array.from(new Set(articles.flatMap((a) => a.tags))).sort(),
    };
  });

export const getKnowledgeArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ slug: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }): Promise<{ article: KnowledgeArticleDTO }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const { data: row, error } = await ctx.supabase
      .from("knowledge_articles")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!row) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "RESOURCE_NOT_FOUND" });
    const isManager = MANAGER_ROLES.includes(tenant.role);
    await ctx.supabase
      .from("knowledge_articles")
      .update({ view_count: ((row as Row).view_count ?? 0) + 1 })
      .eq("id", (row as Row).id);
    return { article: toDto(row as Row, isManager, ctx.userId) };
  });

const ArticleInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  slug: z.string().max(120).optional(),
  summary: z.string().max(600).optional(),
  content: z.string().max(100000).optional(),
  category: z.string().max(60).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  coverUrl: z.string().max(500).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/** Tạo hoặc cập nhật bài viết tri thức. */
export const saveKnowledgeArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ArticleInput.parse(i))
  .handler(async ({ data, context }): Promise<{ article: KnowledgeArticleDTO }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const isManager = MANAGER_ROLES.includes(tenant.role);
    const slug = slugify(data.slug && data.slug.trim().length > 0 ? data.slug : data.title);
    if (!slug) throw new ApiError({ code: "VALIDATION_FAILED", message: "Đường dẫn không hợp lệ" });
    const status = data.status ?? "draft";

    const payload: Record<string, unknown> = {
      tenant_id: tenant.tenantId,
      slug,
      title: data.title.trim(),
      summary: data.summary ?? "",
      content: data.content ?? "",
      category: data.category ?? "guide",
      tags: data.tags ?? [],
      cover_url: data.coverUrl && data.coverUrl.length > 0 ? data.coverUrl : null,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    };

    if (data.id) {
      const { data: row, error } = await ctx.supabase
        .from("knowledge_articles")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenant.tenantId)
        .select("*")
        .maybeSingle();
      if (error) mapPgError(error, "PERMISSION_DENIED");
      if (!row) throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
      return { article: toDto(row as Row, isManager, ctx.userId) };
    }

    const { data: row, error } = await ctx.supabase
      .from("knowledge_articles")
      .insert({ ...payload, created_by: ctx.userId })
      .select("*")
      .maybeSingle();
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!row) throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
    return { article: toDto(row as Row, isManager, ctx.userId) };
  });

/** Đổi trạng thái xuất bản: published / draft / archived. */
export const setKnowledgeArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ article: KnowledgeArticleDTO }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const { data: row, error } = await ctx.supabase
      .from("knowledge_articles")
      .update({
        status: data.status,
        published_at: data.status === "published" ? new Date().toISOString() : null,
        updated_by: ctx.userId,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenant.tenantId)
      .select("*")
      .maybeSingle();
    if (error) mapPgError(error, "PERMISSION_DENIED");
    if (!row) throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
    return { article: toDto(row as Row, MANAGER_ROLES.includes(tenant.role), ctx.userId) };
  });

export const deleteKnowledgeArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    const { error } = await ctx.supabase
      .from("knowledge_articles")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });
