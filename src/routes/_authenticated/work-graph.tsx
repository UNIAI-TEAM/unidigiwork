import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Loader2,
  PlayCircle,
  Search,
  Waypoints,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { getWorkGraphOverview, listWorkGraphBoard } from "@/lib/api/work-graph.functions";
import type { WorkGraphBoardItem } from "@/lib/api/work-graph.functions";

export const Route = createFileRoute("/_authenticated/work-graph")({
  head: () => ({
    meta: [
      { title: "Work Graph — UNIWORK" },
      {
        name: "description",
        content:
          "Bản đồ công việc của tổ chức: công việc đang chạy, đã nghiệm thu và kết quả công việc đã liên kết.",
      },
      { property: "og:title", content: "Work Graph — UNIWORK" },
      {
        property: "og:description",
        content: "Bản đồ công việc của tổ chức theo thời gian thực.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkGraphPage,
});

const RUNNING_TASK = new Set(["in_progress", "blocked"]);
const RUNNING_EXEC = new Set(["QUEUED", "RUNNING", "WAITING_REVIEW", "CHANGES_REQUESTED"]);
const DONE_TASK = new Set(["done"]);
const DONE_EXEC = new Set(["ACCEPTED", "SUCCEEDED"]);
const PAGE_SIZE = 25;

function isRunning(i: WorkGraphBoardItem) {
  if (i.type === "EXECUTION") return RUNNING_EXEC.has(i.status ?? "");
  if (i.type === "TASK") return RUNNING_TASK.has((i.status ?? "").toLowerCase());
  return false;
}

function isDone(i: WorkGraphBoardItem) {
  if (i.type === "EXECUTION") return DONE_EXEC.has(i.status ?? "");
  if (i.type === "TASK") return DONE_TASK.has((i.status ?? "").toLowerCase());
  return i.status === "ACCEPTED" || i.status === "DELIVERED";
}

type Tab = "all" | "running" | "done" | "products";

function WorkGraphPage() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const overview = useQuery({
    queryKey: ["work-graph-overview"],
    queryFn: () => getWorkGraphOverview(),
  });
  const board = useQuery({
    queryKey: ["work-graph-board", tab, term, page],
    queryFn: () => listWorkGraphBoard({ data: { tab, search: term, page, pageSize: PAGE_SIZE } }),
    placeholderData: (prev) => prev,
  });

  const visible = board.data?.items ?? [];
  const counts = board.data?.counts ?? { all: 0, running: 0, done: 0, products: 0 };
  const total = board.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Thời gian còn lại tới hạn, rút gọn theo ngày/giờ. */
  const remaining = (due: string | null) => {
    if (!due) return null;
    const ms = new Date(due).getTime() - Date.now();
    const overdue = ms < 0;
    const abs = Math.abs(ms);
    const days = Math.floor(abs / 86400000);
    const hours = Math.floor((abs % 86400000) / 3600000);
    const span = days > 0 ? `${days}${t("wg.unitDay")}` : `${Math.max(1, hours)}${t("wg.unitHour")}`;
    return { text: overdue ? t("wg.overdueBy").replace("{v}", span) : t("wg.leftIn").replace("{v}", span), overdue };
  };

  const statusLabel = (i: WorkGraphBoardItem) => {
    const s = i.status ?? "";
    const key = `wg.status.${i.type === "TASK" ? s.toLowerCase() : s}`;
    const label = t(key as Parameters<typeof t>[0]);
    return label === key ? s : label;
  };

  const typeMeta = (type: WorkGraphBoardItem["type"]) =>
    type === "TASK"
      ? { icon: ListChecks, label: t("wg.type.task") }
      : type === "EXECUTION"
        ? { icon: Zap, label: t("wg.type.execution") }
        : { icon: ClipboardList, label: t("wg.type.product") };

  const tabs: { id: Tab; label: string; count: number; icon: typeof ListChecks }[] = [
    { id: "all", label: t("wg.tabAll"), count: counts.all, icon: Waypoints },
    { id: "running", label: t("wg.tabRunning"), count: counts.running, icon: PlayCircle },
    { id: "done", label: t("wg.tabDone"), count: counts.done, icon: CheckCircle2 },
    { id: "products", label: t("wg.tabProducts"), count: counts.products, icon: ClipboardList },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("wg.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("wg.subtitle")}</p>
        </div>
        {overview.data && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {t("wg.statsNodes")}: {overview.data.nodes}
            </Badge>
            <Badge variant="secondary">
              {t("wg.statsEdges")}: {overview.data.edges}
            </Badge>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {tabs.map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("wg.searchPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card">
        {board.isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("wg.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((i) => {
              const meta = typeMeta(i.type);
              const Icon = meta.icon;
              return (
                <li key={`${i.type}:${i.id}`}>
                  <Link
                    to={i.href as never}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {meta.label}
                        {i.links > 0 && ` · ${i.links} ${t("wg.links")}`}
                        {i.updatedAt &&
                          ` · ${new Date(i.updatedAt).toLocaleString(
                            lang === "vi" ? "vi-VN" : "en-US",
                          )}`}
                      </span>
                    </span>
                    {i.status && (
                      <Badge
                        variant={isDone(i) ? "default" : isRunning(i) ? "secondary" : "outline"}
                        className="shrink-0"
                      >
                        {statusLabel(i)}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
