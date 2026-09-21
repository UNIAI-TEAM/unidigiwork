import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search, UserCog, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { listTaskOpsBoard, reassignTaskOwner } from "@/lib/api/task-ops.functions";
import type { TaskOpsItem } from "@/lib/api/task-ops.functions";

export const Route = createFileRoute("/_authenticated/task-ops")({
  head: () => ({
    meta: [
      { title: "Quản lý công việc — UNIWORK" },
      {
        name: "description",
        content:
          "Theo dõi công việc đang chạy của tổ chức, gán lại người phụ trách và cập nhật Work Graph.",
      },
      { property: "og:title", content: "Quản lý công việc — UNIWORK" },
      {
        property: "og:description",
        content: "Danh sách việc đang chạy và gán lại người phụ trách theo thời gian thực.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskOpsPage,
});

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["todo", "in_progress", "blocked", "done", "canceled"] as const;

function TaskOpsPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [includeDone, setIncludeDone] = useState(false);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const board = useQuery({
    queryKey: ["task-ops-board", includeDone, status, term, page],
    queryFn: () =>
      listTaskOpsBoard({
        data: {
          includeDone,
          statuses: status === "all" ? [] : [status as (typeof STATUS_OPTIONS)[number]],
          search: term,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const reassign = useMutation({
    mutationFn: (v: { taskId: string; assigneeId: string }) =>
      reassignTaskOwner({
        data: {
          taskId: v.taskId,
          assigneeId: v.assigneeId,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onMutate: (v) => setPending(v.taskId),
    onSettled: () => setPending(null),
    onSuccess: () => {
      toast.success(t("tops.reassigned"));
      void qc.invalidateQueries({ queryKey: ["task-ops-board"] });
      void qc.invalidateQueries({ queryKey: ["work-graph-board"] });
    },
    onError: () => toast.error(t("tops.reassignFailed")),
  });

  const tasks = board.data?.tasks ?? [];
  const members = board.data?.members ?? {};

  const visible = tasks;
  const total = board.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const overdue = tasks.filter((item) => item.overdue).length;
  const unassigned = tasks.filter((item) => item.assignees.length === 0).length;

  const statusLabel = (item: TaskOpsItem) => {
    const key = `tops.status.${item.status}`;
    const label = t(key as Parameters<typeof t>[0]);
    return label === key ? item.status : label;
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(lang === "vi" ? "vi-VN" : "en-US") : "";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("tops.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tops.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">
            {t("tops.statRunning")}: {tasks.length}
          </Badge>
          <Badge variant={overdue > 0 ? "destructive" : "secondary"}>
            {t("tops.statOverdue")}: {overdue}
          </Badge>
          <Badge variant="secondary">
            {t("tops.statUnassigned")}: {unassigned}
          </Badge>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch id="tops-done" checked={includeDone} onCheckedChange={setIncludeDone} />
          <Label htmlFor="tops-done" className="text-sm text-muted-foreground">
            {t("tops.includeDone")}
          </Label>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tops.searchPlaceholder")}
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
            {t("tops.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((item) => {
              const owner = item.assignees[0];
              const options = members[item.workspaceId] ?? [];
              return (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/tasks/$id"
                        params={{ id: item.id }}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.workspaceName}</span>
                        <span>·</span>
                        <span>{statusLabel(item)}</span>
                        {item.dueAt && (
                          <>
                            <span>·</span>
                            <span className={item.overdue ? "text-destructive" : undefined}>
                              {item.overdue && (
                                <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px]" />
                              )}
                              {t("tops.due")}: {fmt(item.dueAt)}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Waypoints className="h-3 w-3" />
                          {item.inGraph
                            ? `${item.graphLinks} ${t("tops.graphLinks")}`
                            : t("tops.notInGraph")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:w-72">
                      <UserCog className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Select
                        value={owner?.userId ?? ""}
                        disabled={pending === item.id || options.length === 0}
                        onValueChange={(value) =>
                          reassign.mutate({ taskId: item.id, assigneeId: value })
                        }
                      >
                        <SelectTrigger className="h-9 min-w-0 flex-1">
                          <SelectValue placeholder={t("tops.unassigned")} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {pending === item.id && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("tops.graphNote")}</p>
    </div>
  );
}
