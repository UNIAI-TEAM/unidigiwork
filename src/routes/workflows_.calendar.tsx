import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Ban,
  CalendarRange,
  Check,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  RotateCw,
  Wrench,
  X,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  exportAnomaliesCsv,
  exportAnomaliesPdf,
  type AnomalyRow,
} from "@/lib/timestamp-anomaly-export";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  cancelWorkflowRun,
  getWorkflowRun,
  listWorkflows,
  listWorkflowRuns,
  repairWorkflowRunTimestamps,
  startWorkflowRun,
} from "@/lib/api/workflows.functions";

export const Route = createFileRoute("/workflows_/calendar")({
  head: () => ({
    meta: [
      { title: "Lịch chạy quy trình · UNIWORK" },
      {
        name: "description",
        content: "Xem lịch các lần chạy workflow theo khoảng thời gian tuỳ chọn trên UNIWORK.",
      },
      { property: "og:title", content: "Lịch chạy quy trình · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi lịch sử và tiến độ các phiên chạy quy trình theo ngày.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkflowCalendarPage,
});

type WF = { id: string; name: string };
type RunStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";
type Run = {
  id: string;
  workflow_id: string;
  status: RunStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

const STATUS_META: Record<RunStatus, { label: string; dot: string; chip: string }> = {
  pending: { label: "Chờ chạy", dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  running: { label: "Đang chạy", dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-500" },
  succeeded: {
    label: "Thành công",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-500",
  },
  failed: { label: "Thất bại", dot: "bg-destructive", chip: "bg-destructive/15 text-destructive" },
  canceled: { label: "Đã huỷ", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-500" },
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Múi giờ hiển thị: lấy theo cấu hình workspace, fallback múi giờ trình duyệt.
const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
};
function isoTz(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return iso(d);
  }
}
function timeTz(ts: string, tz: string) {
  try {
    return new Date(ts).toLocaleTimeString("vi-VN", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
}
function dateTimeTz(ts: string, tz: string) {
  try {
    return new Date(ts).toLocaleString("vi-VN", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleString("vi-VN");
  }
}
function longDateTz(isoDay: string, tz: string) {
  try {
    return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("vi-VN", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoDay;
  }
}
function durationLabel(startTs: string, endTs: string) {
  const ms = new Date(endTs).getTime() - new Date(startTs).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút ${s % 60}s`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

/** Phát hiện timestamp bất thường do dữ liệu cũ / lệch múi giờ. */
function timestampIssues(r: {
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  status: string;
}): string[] {
  const out: string[] = [];
  const now = Date.now();
  const t = (v: string | null) => (v ? new Date(v).getTime() : NaN);
  const started = t(r.started_at);
  const ended = t(r.ended_at);
  const created = t(r.created_at);
  if (!r.started_at && r.status !== "pending") out.push("Thiếu thời điểm bắt đầu");
  if (Number.isFinite(started) && Number.isFinite(ended) && ended < started)
    out.push("Kết thúc trước khi bắt đầu");
  if (Number.isFinite(started) && Number.isFinite(created) && started < created - 60_000)
    out.push("Bắt đầu trước thời điểm tạo");
  const future = [started, ended].filter((v) => Number.isFinite(v) && v > now + 5 * 60_000);
  if (future.length) out.push("Thời gian nằm ở tương lai");
  if (
    Number.isFinite(started) &&
    Number.isFinite(ended) &&
    ended - started > 30 * 24 * 3600_000
  )
    out.push("Thời lượng bất thường (>30 ngày)");
  return out;
}

/** Timestamp kỳ vọng sau khi chuẩn hoá (dùng cho báo cáo đối soát). */
function expectedTimestamps(r: {
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}) {
  const now = new Date();
  const clampFuture = (d: Date) => (d.getTime() > now.getTime() ? now : d);
  const started = clampFuture(new Date(r.started_at ?? r.created_at));
  const createdD = new Date(r.created_at);
  const startFixed = started < createdD ? createdD : started;
  let endFixed: Date | null = r.ended_at ? clampFuture(new Date(r.ended_at)) : null;
  if (endFixed && endFixed < startFixed) endFixed = startFixed;
  return { started: startFixed.toISOString(), ended: endFixed ? endFixed.toISOString() : null };
}

/** Panel hover/click hiển thị lý do cảnh báo và thời gian kỳ vọng. */
function TimestampWarningPanel({ run, tz }: { run: Run; tz: string }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const issues = timestampIssues(run);
  if (issues.length === 0) return null;
  const exp = expectedTimestamps(run);
  const show = hover || pinned;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Cảnh báo thời gian"
      className="relative"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        className="flex items-start gap-1 text-amber-600 hover:text-amber-700"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{issues.join(", ")}</span>
      </button>
      {show && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <div className="font-medium text-amber-700">Quy tắc không hợp lệ</div>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {issues.map((issue) => (
              <li key={issue} className="flex items-start gap-1.5">
                <span className="text-amber-600">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-amber-500/20 pt-2">
            <div className="mb-1 font-medium text-amber-700">Thời gian kỳ vọng</div>
            <div className="space-y-0.5 text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span>Bắt đầu:</span>
                <span>{dateTimeTz(exp.started, tz)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Kết thúc:</span>
                <span>{exp.ended ? dateTimeTz(exp.ended, tz) : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function tzOffsetLabel(tz: string) {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return s ? `${tz} (${s})` : tz;
  } catch {
    return tz;
  }
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7; // thứ 2 đầu tuần
  return addDays(x, -wd);
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function WorkflowCalendarPage() {
  const [open, setOpen] = useSidebarState();
  const today = new Date();
  const [from, setFrom] = useState(iso(addDays(today, -29)));
  const [to, setTo] = useState(iso(today));
  const [selected, setSelected] = useState<string | null>(null);
  const [wfIds, setWfIds] = useState<string[]>([]); // rỗng = tất cả quy trình
  const [wfMenu, setWfMenu] = useState(false);
  const [warningFilter, setWarningFilter] = useState<"all" | "warning" | "clean">("all");
  const [runId, setRunId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  const activeWs = wsId ?? workspaces.data?.[0]?.id;
  // Múi giờ chuẩn hoá theo cấu hình workspace đang chọn.
  const [tzMode, setTzMode] = useState<"workspace" | "browser">("workspace");
  const workspaceTz =
    (workspaces.data ?? []).find((w) => w.id === activeWs)?.timezone?.trim() || browserTz();
  const tz = tzMode === "browser" ? browserTz() : workspaceTz;

  const wfQuery = useQuery({
    queryKey: ["workflows", activeWs],
    enabled: Boolean(activeWs),
    queryFn: async () =>
      (await listWorkflows({ data: { workspaceId: activeWs!, limit: 200 } })) as unknown as WF[],
  });
  const workflows = useMemo(() => wfQuery.data ?? [], [wfQuery.data]);
  const ids = useMemo(() => workflows.map((w) => w.id), [workflows]);
  const nameById = useMemo(
    () => new Map(workflows.map((w) => [w.id, w.name] as const)),
    [workflows],
  );

  const runsQuery = useQuery({
    queryKey: ["workflow-runs", ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await listWorkflowRuns({ data: { workflowIds: ids, limit: 500 } })) as unknown as Run[],
  });

  // Đổi workspace thì bỏ lọc quy trình cũ.
  useEffect(() => {
    setWfIds([]);
    setSelected(null);
  }, [activeWs]);

  useEffect(() => {
    if (!wfMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setWfMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [wfMenu]);

  const runsByDay = useMemo(() => {
    const m = new Map<string, Run[]>();
    const allow = wfIds.length ? new Set(wfIds) : null;
    for (const r of runsQuery.data ?? []) {
      if (allow && !allow.has(r.workflow_id)) continue;
      const hasWarning = timestampIssues(r).length > 0;
      if (warningFilter === "warning" && !hasWarning) continue;
      if (warningFilter === "clean" && hasWarning) continue;
      const key = isoTz(new Date(r.started_at ?? r.created_at), tz);
      if (key < from || key > to) continue;
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return m;
  }, [runsQuery.data, from, to, wfIds, tz, warningFilter]);

  const days = useMemo(() => {
    const start = startOfWeek(new Date(`${from}T00:00:00`));
    const end = new Date(`${to}T00:00:00`);
    const out: Date[] = [];
    let cur = start;
    let guard = 0;
    while (cur <= end && guard < 400) {
      out.push(cur);
      cur = addDays(cur, 1);
      guard++;
    }
    while (out.length % 7 !== 0) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [from, to]);

  const inRange = (d: Date) => iso(d) >= from && iso(d) <= to;
  const total = useMemo(
    () => [...runsByDay.values()].reduce((s, r) => s + r.length, 0),
    [runsByDay],
  );
  const selectedRuns = selected ? (runsByDay.get(selected) ?? []) : [];

  // Cảnh báo timestamp lệch do dữ liệu cũ.
  const anomalies = useMemo(() => {
    const out: { day: string; run: Run; issues: string[] }[] = [];
    for (const [day, runs] of runsByDay) {
      for (const r of runs) {
        const issues = timestampIssues(r);
        if (issues.length) out.push({ day, run: r, issues });
      }
    }
    return out;
  }, [runsByDay]);

  const anomalyRows = (): AnomalyRow[] =>
    anomalies.map(({ day, run, issues }) => {
      const exp = expectedTimestamps(run);
      return {
        runId: run.id,
        workflow: nameById.get(run.workflow_id) ?? run.workflow_id,
        status: STATUS_META[run.status]?.label ?? run.status,
        day,
        originalStarted: run.started_at ? dateTimeTz(run.started_at, tz) : "—",
        originalEnded: run.ended_at ? dateTimeTz(run.ended_at, tz) : "—",
        originalCreated: dateTimeTz(run.created_at, tz),
        expectedStarted: dateTimeTz(exp.started, tz),
        expectedEnded: exp.ended ? dateTimeTz(exp.ended, tz) : "—",
        reasons: issues.join("; "),
      };
    });
  const exportMeta = () => ({
    title: "Báo cáo sự kiện lệch thời gian · Lịch chạy quy trình",
    from,
    to,
    tzLabel: tzOffsetLabel(tz),
  });

  const repairMutation = useMutation({
    mutationFn: (runIds: string[]) => repairWorkflowRunTimestamps({ data: { runIds } }),
    onSuccess: (res) => {
      toast.success(
        res.fixed > 0
          ? `Đã chuẩn hoá ${res.fixed} lần chạy theo múi giờ ${tzOffsetLabel(tz)}`
          : "Không có bản ghi nào cần chuẩn hoá",
      );
      void queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-run"] });
    },
    onError: () => toast.error("Không thể chuẩn hoá thời gian. Vui lòng thử lại."),
  });

  const preset = (n: number) => {
    setFrom(isoTz(addDays(new Date(), -(n - 1)), tz));
    setTo(isoTz(new Date(), tz));
    setSelected(null);
  };

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <Link
            to="/workflows"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quy trình
          </Link>

          <div className="mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <CalendarRange className="h-6 w-6 text-primary" /> Lịch chạy quy trình
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {total} lần chạy trong khoảng {from} → {to}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Múi giờ hiển thị: {tzOffsetLabel(tz)}</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setTzMode("workspace")}
                    className={`px-2 py-1 text-[11px] ${tzMode === "workspace" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
                  >
                    Múi giờ workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => setTzMode("browser")}
                    className={`border-l border-border px-2 py-1 text-[11px] ${tzMode === "browser" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
                  >
                    Múi giờ trình duyệt
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {workspaces.data && workspaces.data.length > 0 && (
                <select
                  value={activeWs ?? ""}
                  onChange={(e) => setWsId(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  {workspaces.data.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setWfMenu((v) => !v)}
                  disabled={workflows.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
                >
                  {wfIds.length === 0
                    ? "Tất cả quy trình"
                    : wfIds.length === 1
                      ? (nameById.get(wfIds[0]!) ?? "1 quy trình")
                      : `${wfIds.length} quy trình`}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {wfMenu && (
                  <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setWfIds([])}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-bg"
                    >
                      Tất cả quy trình
                      {wfIds.length === 0 && <Check className="h-4 w-4 text-primary" />}
                    </button>
                    {workflows.map((w) => {
                      const on = wfIds.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() =>
                            setWfIds((prev) =>
                              prev.includes(w.id)
                                ? prev.filter((x) => x !== w.id)
                                : [...prev, w.id],
                            )
                          }
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-bg"
                        >
                          <span className="truncate">{w.name}</span>
                          {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {wfIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWfIds([])}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground hover:bg-surface"
                >
                  <X className="h-3.5 w-3.5" /> Xoá lọc
                </button>
              )}
              <div className="inline-flex overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setWarningFilter("all")}
                  className={`px-2.5 py-2 text-xs ${warningFilter === "all" ? "bg-primary text-primary-foreground" : "hover:bg-surface"}`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setWarningFilter("warning")}
                  className={`border-l border-border px-2.5 py-2 text-xs ${warningFilter === "warning" ? "bg-amber-600 text-white" : "hover:bg-surface"}`}
                >
                  Có cảnh báo
                </button>
                <button
                  type="button"
                  onClick={() => setWarningFilter("clean")}
                  className={`border-l border-border px-2.5 py-2 text-xs ${warningFilter === "clean" ? "bg-emerald-600 text-white" : "hover:bg-surface"}`}
                >
                  Không cảnh báo
                </button>
              </div>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">→</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              {[7, 30, 90].map((n) => (
                <button
                  key={n}
                  onClick={() => preset(n)}
                  className="rounded-lg border border-border px-2.5 py-2 text-xs hover:bg-surface"
                >
                  {n} ngày
                </button>
              ))}
            </div>
          </div>

          {runsQuery.isLoading || wfQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {anomalies.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      {anomalies.length} lần chạy có thời gian bất thường (dữ liệu cũ hoặc lệch múi
                      giờ)
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={repairMutation.isPending}
                        onClick={() => repairMutation.mutate(anomalies.map((a) => a.run.id))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {repairMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wrench className="h-3.5 w-3.5" />
                        )}
                        Sửa thời gian
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportAnomaliesCsv(anomalyRows(), exportMeta());
                          toast.success("Đã tải báo cáo CSV");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-muted/40"
                      >
                        <Download className="h-3.5 w-3.5" /> Xuất CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = exportAnomaliesPdf(anomalyRows(), exportMeta());
                          if (!ok) toast.error("Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up.");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-muted/40"
                      >
                        <FileText className="h-3.5 w-3.5" /> Xuất PDF
                      </button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {anomalies.slice(0, 5).map(({ day, run, issues }) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(day);
                            setRunId(run.id);
                          }}
                          className="underline-offset-2 hover:underline"
                        >
                          {nameById.get(run.workflow_id) ?? run.workflow_id.slice(0, 8)} ·{" "}
                          {dateTimeTz(run.started_at ?? run.created_at, tz)} — {issues.join(", ")}
                        </button>
                      </li>
                    ))}
                    {anomalies.length > 5 && <li>+{anomalies.length - 5} mục khác</li>}
                  </ul>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="py-2">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((d) => {
                    const key = iso(d);
                    const runs = runsByDay.get(key) ?? [];
                    const active = inRange(d);
                    return (
                      <button
                        key={key}
                        onClick={() => setSelected(key)}
                        className={`min-h-[92px] border-b border-r border-border p-2 text-left align-top transition-colors ${
                          active ? "hover:bg-muted/40" : "opacity-40"
                        } ${selected === key ? "ring-2 ring-inset ring-primary/60" : ""}`}
                      >
                        <div className="text-xs font-medium">{d.getDate()}</div>
                        <div className="mt-1 space-y-1">
                          {runs.slice(0, 3).map((r) => (
                            <div key={r.id} className="flex items-center gap-1.5 text-[11px]">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[r.status].dot}`}
                              />
                              <span className="truncate text-muted-foreground">
                                {nameById.get(r.workflow_id) ?? r.workflow_id.slice(0, 8)}
                              </span>
                            </div>
                          ))}
                          {runs.length > 3 && (
                            <div className="text-[11px] text-muted-foreground">
                              +{runs.length - 3} khác
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="rounded-xl border border-border bg-surface p-4">
                <h2 className="text-sm font-semibold">
                  {selected ? longDateTz(selected, tz) : "Chọn một ngày"}
                </h2>
                {selected && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Theo {tzOffsetLabel(tz)}
                  </p>
                )}
                {!selected ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Bấm vào một ô ngày để xem các lần chạy trong ngày đó.
                  </p>
                ) : selectedRuns.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Không có lần chạy nào trong ngày này.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {selectedRuns.map((r) => (
                      <li key={r.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setRunId(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setRunId(r.id);
                            }
                          }}
                          className="w-full cursor-pointer rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/40"
                        >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {nameById.get(r.workflow_id) ?? r.workflow_id.slice(0, 8)}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_META[r.status].chip}`}
                          >
                            {STATUS_META[r.status].label}
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div>
                            Bắt đầu: {dateTimeTz(r.started_at ?? r.created_at, tz)}
                          </div>
                          <div>
                            Kết thúc:{" "}
                            {r.ended_at ? dateTimeTz(r.ended_at, tz) : "Đang chạy"}
                          </div>
                          {r.ended_at && (
                            <div>
                              Thời lượng:{" "}
                              {durationLabel(r.started_at ?? r.created_at, r.ended_at)}
                            </div>
                          )}
                          <TimestampWarningPanel run={r} tz={tz} />
                        </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </main>
      </div>
      {runId && (
        <RunDetailModal
          runId={runId}
          tz={tz}
          onClose={() => setRunId(null)}
          onRerun={(dayIso) => {
            if (dayIso < from) setFrom(dayIso);
            if (dayIso > to) setTo(dayIso);
            setSelected(dayIso);
          }}
        />
      )}
    </div>
  );
}

const STEP_META: Record<string, { label: string; chip: string; dot: string }> = {
  pending: { label: "Chờ", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  running: { label: "Đang chạy", chip: "bg-sky-500/15 text-sky-500", dot: "bg-sky-500" },
  succeeded: {
    label: "Thành công",
    chip: "bg-emerald-500/15 text-emerald-500",
    dot: "bg-emerald-500",
  },
  failed: { label: "Thất bại", chip: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
  skipped: { label: "Bỏ qua", chip: "bg-amber-500/15 text-amber-500", dot: "bg-amber-500" },
};

function fmt(ts: string | null | undefined, tz: string) {
  if (!ts) return "—";
  return dateTimeTz(ts, tz);
}

function RunDetailModal({
  runId,
  tz,
  onClose,
  onRerun,
}: {
  runId: string;
  tz: string;
  onClose: () => void;
  onRerun?: (dayIso: string) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["workflow-run", runId],
    queryFn: async () => await getWorkflowRun({ data: { runId } }),
  });
  const data = q.data;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["workflow-run", runId] });
    void qc.invalidateQueries({ queryKey: ["workflow-runs"] });
  };

  const cancelMut = useMutation({
    mutationFn: async () =>
      await cancelWorkflowRun({
        data: { runId, reason: "Huỷ từ lịch chạy", idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => {
      toast.success("Đã huỷ lần chạy");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryMut = useMutation({
    mutationFn: async () =>
      await startWorkflowRun({
        data: {
          workflowId: data!.run.workflow_id,
          context: (data!.run.context ?? {}) as Record<string, unknown>,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      const now = new Date();
      onRerun?.(isoTz(now, tz));
      toast.success(`Đã chạy lại quy trình lúc ${dateTimeTz(now.toISOString(), tz)}`, {
        description: `Múi giờ ${tzOffsetLabel(tz)}`,
      });
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.run.status as RunStatus | undefined;
  const canCancel = status === "pending" || status === "running";
  const canRetry = status === "failed" || status === "canceled";
  const busy = cancelMut.isPending || retryMut.isPending;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết lần chạy quy trình"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">
              {data?.workflow?.name ?? "Lần chạy quy trình"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Run ID: {runId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg border border-border p-1.5 hover:bg-bg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : !data ? (
          <p className="py-10 text-sm text-muted-foreground">Không tìm thấy lần chạy này.</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Trạng thái">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_META[data.run.status as RunStatus]?.chip ?? "bg-muted"}`}
                >
                  {STATUS_META[data.run.status as RunStatus]?.label ?? data.run.status}
                </span>
              </Field>
              <Field label="Phiên bản quy trình">v{data.run.workflow_version}</Field>
              <Field label="Bắt đầu">{fmt(data.run.started_at, tz)}</Field>
              <Field label="Kết thúc">{fmt(data.run.ended_at, tz)}</Field>
              <Field label="Tạo lúc">{fmt(data.run.created_at, tz)}</Field>
              <Field label="Cập nhật">{fmt(data.run.updated_at, tz)}</Field>
              <div className="col-span-2">
                <Field label="Correlation ID">
                  <span className="break-all font-mono text-xs">
                    {data.run.correlation_id ?? "—"}
                  </span>
                </Field>
              </div>
            </div>

            <h4 className="mt-5 text-sm font-semibold">Lịch sử trạng thái các bước</h4>
            {data.steps.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Chưa có bước nào được ghi nhận.</p>
            ) : (
              <ol className="mt-3 space-y-3 border-l border-border pl-4">
                {data.steps.map((s) => {
                  const meta = STEP_META[s.status] ?? STEP_META["pending"]!;
                  return (
                    <li key={s.id} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${meta.dot}`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{s.step_key}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmt(s.started_at ?? s.created_at, tz)}
                        {s.ended_at ? ` → ${fmt(s.ended_at, tz)}` : ""}
                      </div>
                      {s.error && (
                        <p className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {typeof s.error === "string" ? s.error : JSON.stringify(s.error)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {(canCancel || canRetry) && (
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                {canCancel && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cancelMut.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {cancelMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                    Huỷ lần chạy
                  </button>
                )}
                {canRetry && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => retryMut.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {retryMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}
                    Chạy lại
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
