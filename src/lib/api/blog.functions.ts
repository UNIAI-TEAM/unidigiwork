// Blog công khai — đọc bài viết đã xuất bản bằng publishable key (RLS as anon).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type BlogPostDto = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  content: string;
  authorName: string;
  authorSeed: string;
  readTime: string;
  coverUrl: string | null;
  isFeatured: boolean;
  publishedAt: string | null;
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

const SELECT =
  "slug, category, title, excerpt, content, author_name, author_seed, read_time, cover_url, is_featured, published_at";

type Row = {
  slug: string;
  category: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  author_name: string | null;
  author_seed: string | null;
  read_time: string | null;
  cover_url: string | null;
  is_featured: boolean | null;
  published_at: string | null;
};

function toDto(r: Row): BlogPostDto {
  return {
    slug: r.slug,
    category: r.category,
    title: r.title,
    excerpt: r.excerpt ?? "",
    content: r.content ?? "",
    authorName: r.author_name ?? "",
    authorSeed: r.author_seed ?? r.slug,
    readTime: r.read_time ?? "",
    coverUrl: r.cover_url,
    isFeatured: Boolean(r.is_featured),
    publishedAt: r.published_at,
  };
}

export const listBlogPosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogPostDto[]> => {
    const { data, error } = await publicClient()
      .from("blog_posts")
      .select(SELECT)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toDto);
  },
);

export const getBlogPost = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ post: BlogPostDto | null; related: BlogPostDto[] }> => {
    const supabase = publicClient();
    const [{ data: one }, { data: rest }] = await Promise.all([
      supabase.from("blog_posts").select(SELECT).eq("status", "published").eq("slug", data.slug).maybeSingle(),
      supabase
        .from("blog_posts")
        .select(SELECT)
        .eq("status", "published")
        .neq("slug", data.slug)
        .order("published_at", { ascending: false })
        .limit(3),
    ]);
    return {
      post: one ? toDto(one as unknown as Row) : null,
      related: ((rest ?? []) as unknown as Row[]).map(toDto),
    };
  });
