import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search as SearchIcon,
  Video,
  ListChecks,
  Flag,
  FileText,
  Users as UsersIcon,
  Calendar as CalendarIcon,
  ArrowUpRight,
  Sparkles,
  SlidersHorizontal,
  X,
  Briefcase,
  User as UserIcon,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { searchAll, getSearchFacets } from "@/lib/api/search.functions";

type ResultType = "meeting" | "task" | "deadline" | "document" | "person";

type SearchParams = {
  q?: string;
  type?: ResultType | "all";
  project?: string; // workspace id
  assignee?: string; // user id
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  sort?: "relevance" | "time";
};

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v : undefined;
    const t = s.type;
    return {
      q: str(s.q),
      type:
        t === "meeting" || t === "task" || t === "deadline" || t === "document" || t === "person"
          ? t
          : "all",
      project: str(s.project),
      assignee: str(s.assignee),
      from: str(s.from),
      to: str(s.to),
      sort: s.sort === "time" ? "time" : "relevance",
    };
  },
  head: () => ({
    meta: [
      { title: "Tìm kiếm — UNIWORK" },
      {
        name: "description",
        content:
          "Tìm kiếm toàn workspace với bộ lọc nâng cao: thời gian, dự án, người phụ trách.",
      },
      { property: "og:title", content: "Tìm kiếm — UNIWORK" },
      {
        property: "og:description",
        content: "Tìm meeting, công việc, hạn chót, tài liệu và nhân sự trong UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

type SearchItem = {
  id: string;
  kind: string;
  title: string;
  snippet: string;
  occurredAt: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

const TYPE_META: Record<
  ResultType,
  { label: string; icon: typeof Video; chip: string; iconBg: string }
> = {
  meeting: {
    label: "Họp",
    icon: Video,
    chip: "bg-primary/15 text-primary border-primary/30",
    iconBg: "bg-primary/15 text-primary",
  },
  task: {
    label: "Công việc",
    icon: ListChecks,
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    iconBg: "bg-emerald-500/15 text-emerald-400",
  },
  deadline: {
    label: "Hạn chót",
    icon: Flag,
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    iconBg: "bg-rose-500/15 text-rose-400",
  },
  document: {
    label: "Tài liệu",
    icon: FileText,
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    iconBg: "bg-amber-500/15 text-amber-400",
  },
  person: {
    label: "Nhân sự",
    icon: UsersIcon,
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    iconBg: "bg-violet-500/15 text-violet-400",
  },
};

const TYPE_ORDER: (ResultType | "all")[] = [
  "all",
  "meeting",
  "task",
  "deadline",
  "document",
  "person",
];

const DATE_PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "today", label: "Hôm nay", range: () => [isoToday(), isoToday()] },
  { id: "7d", label: "7 ngày tới", range: () => [isoToday(), isoAdd(isoToday(), 7)] },
  { id: "30d", label: "30 ngày tới", range: () => [isoToday(), isoAdd(isoToday(), 30)] },
  {
    id: "month",
    label: "Tháng này",
    range: () => {
      const d = new Date();
      return [
        toIso(new Date(d.getFullYear(), d.getMonth(), 1)),
        toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      ];
    },
  },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToday() {
  return toIso(new Date());
}
function isoAdd(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + days);
  return toIso(x);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${esc(q)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ResultLink({
  item,
  children,
  className,
}: {
  item: SearchItem;
  children: React.ReactNode;
  className: string;
}) {
  const params = { id: item.id };
  switch (item.kind) {
    case "document":
      return (
        <Link to="/documents/$id" params={params} className={className}>
          {children}
        </Link>
      );
    case "meeting":
      return (
        <Link to="/meeting/$id" params={params} className={className}>
          {children}
        </Link>
      );
    case "task":
    case "deadline":
      return (
        <Link to="/tasks/$id" params={params} className={className}>
          {children}
        </Link>
      );
    case "person":
      return (
        <Link to="/people/$id" params={params} className={className}>
          {children}
        </Link>
      );
    default:
      return <span className={className}>{children}</span>;
  }
}

const PAGE_SIZE = 20;

function SearchPage() {
  const params = Route.useSearch();
  const { q = "", type = "all", project, assignee, from, to, sort = "relevance" } = params;
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(q);
  }, [q]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const update = (patch: Partial<SearchParams>) => {
    const next: SearchParams = { ...params, ...patch };
    const clean: Record<string, unknown> = {};
    (Object.keys(next) as (keyof SearchParams)[]).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === "" || (k === "type" && v === "all") || (k === "sort" && v === "relevance")) return;
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

  const runSearch = useServerFn(searchAll);
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["global-search", q, type, project, assignee, from, to, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      runSearch({
        data: {
          q: q.trim() || undefined,
          kind: type,
          workspaceId: project,
          assigneeId: assignee,
          from,
          to,
          sort,
          limit: PAGE_SIZE,
          offset: pageParam as number,
        },
      }),
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
    staleTime: 30_000,
  });

  const items = useMemo<SearchItem[]>(
    () => (data?.pages ?? []).flatMap((p) => p.items as SearchItem[]),
    [data],
  );
  const total = data?.pages?.[0]?.total ?? 0;
  const counts = (data?.pages?.[0]?.counts ?? {}) as Record<string, number>;

  const activeFilterCount =
    (project ? 1 : 0) + (assignee ? 1 : 0) + (from || to ? 1 : 0);
  const projectName = facets?.workspaces.find((w) => w.id === project)?.name;
  const assigneeName = facets?.assignees.find((a) => a.id === assignee)?.name;

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <SearchIcon className="h-3.5 w-3.5" />
              Tìm kiếm toàn workspace
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
              Meeting, công việc, hạn chót, tài liệu và nhân sự — tất cả ở một nơi.
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
              placeholder="Tìm meeting, task, deadline, tài liệu hoặc nhân sự…"
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
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (filtersOpen || activeFilterCount > 0
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground")
              }
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc nâng cao
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/25 px-1.5 text-[10px]">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {project && (
              <FilterChip
                icon={Briefcase}
                label={`Workspace: ${projectName ?? project}`}
                onClear={() => update({ project: undefined })}
              />
            )}
            {assignee && (
              <FilterChip
                icon={UserIcon}
                label={`Người phụ trách: ${assigneeName ?? assignee}`}
                onClear={() => update({ assignee: undefined })}
              />
            )}
            {(from || to) && (
              <FilterChip
                icon={CalendarIcon}
                label={`Thời gian: ${from ?? "…"} → ${to ?? "…"}`}
                onClear={() => update({ from: undefined, to: undefined })}
              />
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  update({
                    project: undefined,
                    assignee: undefined,
                    from: undefined,
                    to: undefined,
                  })
                }
                className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Xoá tất cả
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="mb-5 grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
              <FilterField icon={Briefcase} label="Workspace">
                <select
                  value={project ?? ""}
                  onChange={(e) => update({ project: e.target.value || undefined })}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Tất cả workspace</option>
                  {(facets?.workspaces ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField icon={UserIcon} label="Người phụ trách">
                <select
                  value={assignee ?? ""}
                  onChange={(e) => update({ assignee: e.target.value || undefined })}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Tất cả nhân sự</option>
                  {(facets?.assignees ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField icon={CalendarIcon} label="Khoảng thời gian">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={from ?? ""}
                    onChange={(e) => update({ from: e.target.value || undefined })}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Từ ngày"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="date"
                    value={to ?? ""}
                    onChange={(e) => update({ to: e.target.value || undefined })}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Đến ngày"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DATE_PRESETS.map((p) => {
                    const [f, t] = p.range();
                    const active = from === f && to === t;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => update({ from: f, to: t })}
                        className={
                          "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                          (active
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border bg-surface-2 text-muted-foreground hover:text-foreground")
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </FilterField>
            </div>
          )}

          <div className="mb-5 flex flex-wrap gap-2">
            {TYPE_ORDER.map((t) => {
              const active = type === t;
              const label = t === "all" ? "Tất cả" : TYPE_META[t].label;
              const Icon = t === "all" ? Sparkles : TYPE_META[t].icon;
              const count = counts[t] ?? 0;
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

          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isLoading
                ? "Đang tìm…"
                : total === 0
                  ? "0 kết quả"
                  : `Hiển thị ${items.length} / ${total} kết quả`}
            </span>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex rounded-lg border border-border bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => update({ sort: undefined })}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (sort === "relevance"
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  Liên quan nhất
                </button>
                <button
                  type="button"
                  onClick={() => update({ sort: "time" })}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (sort === "time"
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  Mới nhất
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
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
              <h2 className="text-base font-medium">Không tìm thấy kết quả nào</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử thay đổi từ khoá, bộ lọc thời gian, workspace hoặc người phụ trách
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {items.map((r) => {
                  const meta = TYPE_META[(r.kind as ResultType)] ?? TYPE_META.document;
                  const Icon = meta.icon;
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <ResultLink
                        item={r}
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
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {highlight(r.snippet, q)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {r.ownerName && (
                              <span className="flex items-center gap-1.5">
                                <img
                                  src={avatar(r.ownerId ?? r.ownerName)}
                                  alt=""
                                  className="h-5 w-5 rounded-full"
                                />
                                {r.ownerName}
                              </span>
                            )}
                            {r.workspaceName && (
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5" /> {r.workspaceName}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <CalendarIcon className="h-3.5 w-3.5" /> {fmtDate(r.occurredAt)}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </ResultLink>
                    </li>
                  );
                })}
              </ul>

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

function FilterChip({
  icon: Icon,
  label,
  onClear,
}: {
  icon: typeof Briefcase;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
      <Icon className="h-3.5 w-3.5" />
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label="Xoá bộ lọc"
        className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FilterField({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Briefcase;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      {children}
    </div>
  );
}
