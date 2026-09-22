import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, ListChecks, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listWorkGraphBoard, type WorkGraphBoardItem } from "@/lib/api/work-graph.functions";
import { toMobileHref } from "@/lib/mobile-routes";

const searchSchema = z.object({ task: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/m/work-graph")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Work Graph mobile — UNIWORK" },
      { name: "description", content: "Công việc và kết quả liên kết trên điện thoại." },
      { property: "og:title", content: "Work Graph mobile — UNIWORK" },
      { property: "og:description", content: "Công việc và kết quả liên kết trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileWorkGraphPage,
});

function MobileWorkGraphPage() {
  const navigate = useNavigate();
  const { task } = Route.useSearch();
  const [tab, setTab] = useState<"all" | "running" | "done" | "products">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [tab, debounced]);
  const board = useQuery({
    queryKey: ["m-work-graph", tab, debounced, page, task],
    queryFn: () => listWorkGraphBoard({ data: { tab, search: debounced, page, pageSize: 25, taskId: task, dueFilter: "all", unassigned: false } }),
  });
  const pages = Math.max(1, Math.ceil((board.data?.total ?? 0) / 25));
  const tabs = [
    ["all", "Tất cả", board.data?.counts.all],
    ["running", "Đang chạy", board.data?.counts.running],
    ["done", "Đã nghiệm thu", board.data?.counts.done],
    ["products", "Kết quả", board.data?.counts.products],
  ] as const;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Work Graph</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Công việc đang chạy, đã nghiệm thu và kết quả công việc.
        </p>
      </header>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-9" placeholder="Tìm trong Work Graph…" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{tabs.map(([id, label, count]) => <Button key={id} variant={tab === id ? "default" : "outline"} className="min-h-11 shrink-0 rounded-full" onClick={() => setTab(id)}>{label}{typeof count === "number" ? ` ${count}` : ""}</Button>)}</div>
      {board.isLoading ? <div className="grid gap-2">{[0,1,2].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}</div> : !board.data?.items.length ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu phù hợp.</p> : <ul className="grid gap-2">{board.data.items.map((item) => <WorkGraphRow key={`${item.type}-${item.id}`} item={item} />)}</ul>}
      <footer className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Trang {page}/{pages}</span><div className="flex gap-2"><Button size="icon" variant="outline" className="h-11 w-11" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4"/><span className="sr-only">Trang trước</span></Button><Button size="icon" variant="outline" className="h-11 w-11" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight className="h-4 w-4"/><span className="sr-only">Trang sau</span></Button></div></footer>
      {task ? <Button variant="outline" className="min-h-11" onClick={() => void navigate({ to: "/m/tasks/$id", params: { id: task } })}>Mở chi tiết công việc</Button> : null}
    </div>
  );
}

function WorkGraphRow({ item }: { item: WorkGraphBoardItem }) {
  const Icon = item.type === "WORK_PRODUCT" ? FileText : ListChecks;
  return (
    <li>
      <Link
        to={toMobileHref(item.href) as never}
        className="block min-w-0 rounded-xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-semibold leading-5">{item.title}</span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {item.type === "WORK_PRODUCT" ? "Work Product" : "Task"}
              </Badge>
              {item.ownerName ? (
                <Badge variant="secondary" className="max-w-full truncate text-[10px]">
                  {item.ownerName}
                </Badge>
              ) : null}
            </span>
          </span>
          {item.status ? (
            <Badge variant="secondary" className="max-w-24 shrink-0 truncate text-[10px]">
              {item.status}
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
            />
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{item.progress}%</span>
        </div>
        {item.dueAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Hạn {new Date(item.dueAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
          </p>
        ) : null}
      </Link>
    </li>
  );
  );
}
