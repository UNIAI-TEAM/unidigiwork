import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  X,
  Loader2,
  Briefcase,
  ListChecks,
  Video,
  FileText,
  Mail,
  MessageSquare,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { readSearchScope, writeSearchScope } from "@/lib/search-scope";
import { universalSearch } from "@/lib/api/search-universal.functions";
import { SEARCH_KINDS, type SearchKind } from "@/lib/api/search-universal.server";

const PAGE_SIZE = 30;

export const Route = createFileRoute("/_authenticated/m/search")({
  head: () => ({
    meta: [
      { title: "Tìm kiếm · UNIWORK" },
      {
        name: "description",
        content: "Tìm nhanh dự án, công việc, cuộc họp, tài liệu, email và nhân sự trên UNIWORK.",
      },
      { property: "og:title", content: "Tìm kiếm · UNIWORK" },
      {
        property: "og:description",
        content: "Tìm nhanh dự án, công việc, cuộc họp, tài liệu, email và nhân sự trên UNIWORK.",
      },
    ],
  }),
  component: MobileSearchPage,
});

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  project: Briefcase,
  task: ListChecks,
  meeting: Video,
  document: FileText,
  email: Mail,
  chat: MessageSquare,
  person: Users,
};

const KIND_LABEL: Record<SearchKind, string> = {
  project: "Dự án",
  task: "Công việc",
  meeting: "Cuộc họp",
  document: "Tài liệu",
  email: "Email",
  chat: "Chat",
  person: "Nhân sự",
};

function MobileSearchPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<SearchKind | null>(null);
  const { workspaceId: activeWorkspaceId, workspaces, ready } = useActiveWorkspace();
  // null = tất cả workspace; mặc định theo workspace đang làm việc.
  const [scope, setScope] = useState<string | null>(null);
  const [scopeTouched, setScopeTouched] = useState(false);

  useEffect(() => {
    if (!ready || scopeTouched) return;
    const saved = readSearchScope();
    setScope(saved === undefined ? activeWorkspaceId : saved);
  }, [ready, activeWorkspaceId, scopeTouched]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useServerFn(universalSearch);
  const enabled = debounced.length >= 2;
  const { data, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["m-search", debounced, kind, scope],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        runSearch({
          data: {
            q: debounced,
            kinds: kind ? [kind] : undefined,
            workspaceId: scope ?? undefined,
            limit: PAGE_SIZE,
            offset: pageParam as number,
            expandGraph: false,
          },
        }),
      getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
      enabled,
      staleTime: 30_000,
    });

  const firstPage = data?.pages?.[0];
  const counts = firstPage?.counts;
  const availableKinds = useMemo(
    () => SEARCH_KINDS.filter((k) => (counts?.[k] ?? 0) > 0 || k === kind),
    [counts, kind],
  );

  const items = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items), [data]);

  // Tự tải thêm khi cuộn tới cuối danh sách.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div className="flex min-h-full flex-col pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Tìm dự án, việc, họp, tài liệu…"
            aria-label="Tìm kiếm toàn workspace"
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          {q && !isFetching && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Xóa từ khóa"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {enabled && availableKinds.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <FilterChip active={kind === null} onClick={() => setKind(null)}>
              Tất cả {firstPage ? `(${firstPage.total})` : ""}
            </FilterChip>
            {availableKinds.map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]} {counts?.[k] ? `(${counts[k]})` : ""}
              </FilterChip>
            ))}
          </div>
        )}

        {workspaces.length > 0 && (
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            <FilterChip
              active={scope === null}
              onClick={() => {
                setScopeTouched(true);
                setScope(null);
                writeSearchScope(null);
              }}
            >
              Mọi dự án
            </FilterChip>
            {workspaces.map((w) => (
              <FilterChip
                key={w.id}
                active={scope === w.id}
                onClick={() => {
                  setScopeTouched(true);
                  const next = scope === w.id ? null : w.id;
                  setScope(next);
                  writeSearchScope(next);
                }}
              >
                {w.name}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        {!enabled ? (
          <p className="px-1 py-10 text-center text-sm text-muted-foreground">
            Nhập ít nhất 2 ký tự để tìm kiếm.
          </p>
        ) : items.length === 0 && !isFetching ? (
          <p className="px-1 py-10 text-center text-sm text-muted-foreground">
            Không tìm thấy kết quả cho “{debounced}”.
          </p>
        ) : (
          items.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileText;
            return (
              <MobileListItem
                key={`${item.entityType}-${item.id}`}
                title={item.title}
                subtitle={item.snippet || item.subtitle || undefined}
                meta={
                  [KIND_LABEL[item.kind], item.workspaceName ?? undefined]
                    .filter(Boolean)
                    .join(" · ")
                }
                icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                onClick={() => navigate({ href: item.href } as never)}
              />
            );
          })
        )}
        {hasNextPage && <div ref={sentinelRef} className="h-1" />}
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
