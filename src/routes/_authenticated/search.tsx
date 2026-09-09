import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search as SearchIcon,
  Video,
  ListChecks,
  FileText,
  Users as UsersIcon,
  Calendar as CalendarIcon,
  ArrowUpRight,
  Sparkles,
  X,
  Briefcase,
  Mail,
  MessageSquare,
  Loader2,
  Network,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { getSearchFacets } from "@/lib/api/search.functions";
import { universalSearch } from "@/lib/api/search-universal.functions";
import { readSearchScope, writeSearchScope } from "@/lib/search-scope";
import type {
  SearchKind,
  UniversalSearchItem,
} from "@/lib/api/search-universal.server";

type SearchParams = {
  q?: string;
  type?: SearchKind | "all";
  project?: string;
};

const KINDS: SearchKind[] = [
  "project",
  "task",
  "meeting",
  "artifact",
  "document",
  "workproduct",
  "email",
  "chat",
  "person",
];

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v : undefined;
    const t = s.type;
    return {
      q: str(s.q),
      type: KINDS.includes(t as SearchKind) ? (t as SearchKind) : "all",
      project: str(s.project),
    };
  },
  head: () => ({
    meta: [
      { title: "Tìm kiếm — UNIWORK" },
      {
        name: "description",
        content:
          "Tìm kiếm hợp nhất toàn tổ chức: dự án, công việc, cuộc họp, tài liệu, email, kênh chat và nhân sự.",
      },
      { property: "og:title", content: "Tìm kiếm — UNIWORK" },
      {
        property: "og:description",
        content:
          "Universal Search: tìm mọi dữ liệu công việc bạn có quyền xem, ngay trong một ô tìm kiếm.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const TYPE_META: Record<
  SearchKind,
  { label: string; icon: LucideIcon; chip: string; iconBg: string }
> = {
  project: {
    label: "Dự án",
    icon: Briefcase,
    chip: "bg-primary/15 text-primary border-primary/30",
    iconBg: "bg-primary/15 text-primary",
  },
  task: {
    label: "Công việc",
    icon: ListChecks,
    chip: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    iconBg: "bg-emerald-500/15 text-emerald-500",
  },
  meeting: {
    label: "Cuộc họp",
    icon: Video,
    chip: "bg-sky-500/15 text-sky-500 border-sky-500/30",
    iconBg: "bg-sky-500/15 text-sky-500",
  },
  artifact: {
    label: "Kết quả họp",
    icon: Sparkles,
    chip: "bg-sky-500/10 text-sky-600 border-sky-500/25",
    iconBg: "bg-sky-500/10 text-sky-600",
  },
  workproduct: {
    label: "Kết quả công việc",
    icon: FileText,
    chip: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    iconBg: "bg-violet-500/15 text-violet-500",
  },
  document: {
    label: "Tài liệu",
    icon: FileText,
    chip: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    iconBg: "bg-amber-500/15 text-amber-500",
  },
  email: {
    label: "Email",
    icon: Mail,
    chip: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    iconBg: "bg-rose-500/15 text-rose-500",
  },
  chat: {
    label: "Kênh chat",
    icon: MessageSquare,
    chip: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
    iconBg: "bg-indigo-500/15 text-indigo-500",
  },
  person: {
    label: "Nhân sự",
    icon: UsersIcon,
    chip: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    iconBg: "bg-violet-500/15 text-violet-500",
  },
};

const MATCH_LABEL: Record<UniversalSearchItem["matchType"], string> = {
  EXACT: "Khớp chính xác",
  PREFIX: "Khớp đầu",
  LEXICAL: "Khớp từ khoá",
  FUZZY: "Gợi ý gần đúng",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlight(text: string, q: string) {
  if (!q.trim() || !text) return text;
  const parts = text.split(new RegExp(`(${esc(q.trim())})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.trim().toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

const PAGE_SIZE = 20;

function SearchPage() {
  const params = Route.useSearch();
  const { q = "", type = "all", project } = params;
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(q), [q]);

  // Khôi phục phạm vi dự án đã lưu khi URL chưa chỉ định.
  const scopeRestored = useRef(false);
  useEffect(() => {
    if (scopeRestored.current) return;
    scopeRestored.current = true;
    if (project) return;
    const saved = readSearchScope();
    if (saved) navigate({ to: "/search", search: { ...params, project: saved }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const update = (patch: Partial<SearchParams>) => {
    const next: SearchParams = { ...params, ...patch };
    if ("project" in patch) writeSearchScope(patch.project ?? null);
    const clean: Record<string, unknown> = {};
    (Object.keys(next) as (keyof SearchParams)[]).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === "" || (k === "type" && v === "all")) return;
      clean[k] = v;
    });
    navigate({ to: "/search", search: clean });
  };

  const fetchFacets = useServerFn(getSearchFacets);
  const { data: facets } = useQuery({
    queryKey: ["search-facets"],
    queryFn: () => fetchFacets(),
    staleTime: 5 * 60_000,
  });

  const runSearch = useServerFn(universalSearch);
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["universal-search", q, type, project],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        runSearch({
          data: {
            q: q.trim(),
            kinds: type === "all" ? undefined : [type],
            workspaceId: project,
            limit: PAGE_SIZE,
            offset: pageParam as number,
            expandGraph: (pageParam as number) === 0,
          },
        }),
      getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
      enabled: q.trim().length >= 2,
      staleTime: 30_000,
    });

  const items = useMemo<UniversalSearchItem[]>(
    () => (data?.pages ?? []).flatMap((p) => p.items),
    [data],
  );
  const first = data?.pages?.[0];
  const total = first?.total ?? 0;
  const counts = first?.counts;
  const related = first?.related ?? [];
  const tookMs = first?.tookMs ?? 0;

  const projectName = facets?.workspaces.find((w) => w.id === project)?.name;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasNextPage) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const totalCount = counts
    ? KINDS.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
    : 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <SearchIcon className="h-3.5 w-3.5" />
              Tìm kiếm hợp nhất
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {q ? (
                <>
                  Kết quả cho <span className="text-primary">&ldquo;{q}&rdquo;</span>
                </>
              ) : (
                "Tìm mọi thứ trong UNIWORK"
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dự án, công việc, cuộc họp, tài liệu, email, kênh chat và nhân sự — chỉ
              hiển thị dữ liệu bạn có quyền xem.
            </p>
          </div>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: draft.trim() || undefined });
            }}
            className="relative mb-3"
          >
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Nhập từ khoá (không dấu vẫn tìm được)…"
              className="w-full rounded-2xl border border-border bg-surface py-4 pl-12 pr-28 text-base shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Tìm
            </button>
          </form>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={project ?? ""}
              onChange={(e) => update({ project: e.target.value || undefined })}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Lọc theo dự án"
            >
              <option value="">Tất cả dự án</option>
              {(facets?.workspaces ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {project && (
              <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <Briefcase className="h-3.5 w-3.5" />
                {projectName ?? project}
                <button
                  type="button"
                  onClick={() => update({ project: undefined })}
                  aria-label="Xoá bộ lọc dự án"
                  className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {(["all", ...KINDS] as (SearchKind | "all")[]).map((t) => {
              const active = type === t;
              const label = t === "all" ? "Tất cả" : TYPE_META[t].label;
              const Icon = t === "all" ? Sparkles : TYPE_META[t].icon;
              const count = t === "all" ? totalCount : (counts?.[t] ?? 0);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => update({ type: t === "all" ? undefined : t })}
                  className={
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (active
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span
                    className={
                      "rounded-full px-1.5 text-[10px] " +
                      (active ? "bg-primary/25 text-primary" : "bg-surface-2")
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {q.trim().length < 2
                ? "Nhập tối thiểu 2 ký tự để tìm kiếm"
                : isLoading
                  ? "Đang tìm…"
                  : total === 0
                    ? "0 kết quả"
                    : `Hiển thị ${items.length} / ${total} kết quả`}
            </span>
            {tookMs > 0 && (
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> {tookMs} ms
              </span>
            )}
          </div>

          {isLoading && q.trim().length >= 2 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-start gap-4 px-5 py-4">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-surface-2" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
              <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="text-base font-medium">
                {q.trim().length < 2 ? "Bắt đầu tìm kiếm" : "Không tìm thấy kết quả nào"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử từ khoá khác, bỏ bộ lọc dự án hoặc mở bảng lệnh bằng ⌘K.
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {items.map((r) => {
                  const meta = TYPE_META[r.kind] ?? TYPE_META.document;
                  const Icon = meta.icon;
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <a
                        href={r.href}
                        className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
                      >
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                            meta.iconBg
                          }
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                                meta.chip
                              }
                            >
                              {meta.label}
                            </span>
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {highlight(r.title, q)}
                            </h3>
                            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {MATCH_LABEL[r.matchType]}
                            </span>
                          </div>
                          {(r.snippet || r.subtitle) && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {highlight(r.snippet || r.subtitle, q)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {r.workspaceName && (
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5" /> {r.workspaceName}
                              </span>
                            )}
                            {r.source && (
                              <span className="flex items-center gap-1.5">
                                <Video className="h-3.5 w-3.5" />
                                <span className="truncate">Nguồn: {r.source.title}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <CalendarIcon className="h-3.5 w-3.5" />{" "}
                              {fmtDate(r.occurredAt)}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    </li>
                  );
                })}
              </ul>

              {related.length > 0 && (
                <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
                  <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Network className="h-3.5 w-3.5" />
                    Liên quan tới kết quả hàng đầu
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {related.map((r) => {
                      const meta = TYPE_META[r.kind] ?? TYPE_META.document;
                      const Icon = meta.icon;
                      return (
                        <a
                          key={`${r.kind}-${r.id}`}
                          href={r.href}
                          className="flex max-w-full items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground/90 transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{r.title}</span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              )}

              {hasNextPage && (
                <div ref={sentinelRef} className="flex justify-center py-6">
                  {isFetchingNextPage ? (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thêm…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void fetchNextPage()}
                      className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Tải thêm
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
