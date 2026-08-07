import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CalendarRange,
  Check,
  ChevronDown,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  cancelWorkflowRun,
  getWorkflowRun,
  listWorkflows,
  listWorkflowRuns,
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
  const [runId, setRunId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      const key = isoTz(new Date(r.started_at ?? r.created_at), tz);
      if (key < from || key > to) continue;
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return m;
  }, [runsQuery.data, from, to, wfIds, tz]);

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
              <p className="mt-0.5 text-xs text-muted-foreground">
                Múi giờ hiển thị: {tzOffsetLabel(tz)}
              </p>
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
                  {selected ? `Chi tiết ngày ${selected}` : "Chọn một ngày"}
                </h2>
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
                        <button
                          type="button"
                          onClick={() => setRunId(r.id)}
                          className="w-full rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/40"
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
                        <div className="mt-1 text-xs text-muted-foreground">
                          {timeTz(r.started_at ?? r.created_at, tz)}
                          {r.ended_at ? ` → ${timeTz(r.ended_at, tz)}` : ""}
                        </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </main>
      </div>
      {runId && <RunDetailModal runId={runId} tz={tz} onClose={() => setRunId(null)} />}
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

function fmt(ts: string | null | undefined, tz?: string) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("vi-VN", tz ? { timeZone: tz } : undefined);
  } catch {
    return new Date(ts).toLocaleString("vi-VN");
  }
}

function RunDetailModal({
  runId,
  tz,
  onClose,
}: {
  runId: string;
  tz: string;
  onClose: () => void;
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
      toast.success("Đã chạy lại quy trình");
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
