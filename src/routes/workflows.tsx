import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { Key } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Search as SearchIcon,
  X,
  Play,
  ChevronDown,
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Rocket,
  Workflow as WorkflowIcon,
  CalendarRange,
  History,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  listWorkflows,
  listWorkflowRuns,
  createWorkflow,
  publishWorkflow,
  startWorkflowRun,
} from "@/lib/api/workflows.functions";

export const Route = createFileRoute("/workflows")({
  head: () => ({
    meta: [
      { title: "Workflows · UNIWORK" },
      { name: "description", content: "Tự động hoá và quản lý quy trình nghiệp vụ trên UNIWORK." },
    ],
  }),
  component: WorkflowsPage,
});

type DbStatus = "draft" | "published" | "archived";
type WF = {
  id: string;
  name: string;
  description: string | null;
  status: DbStatus;
  version: number;
  row_version: number;
  updated_at: string;
  created_at: string;
  definition: Record<string, unknown> | null;
};
type Run = {
  id: string;
  workflow_id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "canceled";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

// Ánh xạ trạng thái CSDL sang nhãn hiển thị đã có sẵn trong i18n.
const statusKey: Record<DbStatus, "active" | "paused" | "draft"> = {
  published: "active",
  archived: "paused",
  draft: "draft",
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function avgHours(runs: Run[]) {
  const done = runs.filter((r) => r.status === "succeeded" && r.started_at && r.ended_at);
  if (done.length === 0) return null;
  const total = done.reduce(
    (s, r) => s + (new Date(r.ended_at!).getTime() - new Date(r.started_at!).getTime()),
    0,
  );
  return total / done.length / 3_600_000;
}

function WorkflowsPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | DbStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  const activeWs = wsId ?? workspaces.data?.[0]?.id;

  const wfQuery = useQuery({
    queryKey: ["workflows", activeWs],
    enabled: Boolean(activeWs),
    queryFn: async () =>
      (await listWorkflows({ data: { workspaceId: activeWs!, limit: 200 } })) as unknown as WF[],
  });
  const workflows = useMemo(() => wfQuery.data ?? [], [wfQuery.data]);

  const ids = useMemo(() => workflows.map((w) => w.id), [workflows]);
  const runsQuery = useQuery({
    queryKey: ["workflow-runs", ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await listWorkflowRuns({ data: { workflowIds: ids, limit: 500 } })) as unknown as Run[],
  });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  const runsByWf = useMemo(() => {
    const m = new Map<string, Run[]>();
    for (const r of runs) m.set(r.workflow_id, [...(m.get(r.workflow_id) ?? []), r]);
    return m;
  }, [runs]);

  const filtered = useMemo(
    () =>
      workflows.filter((w) => {
        if (q && !w.name.toLowerCase().includes(q.toLowerCase())) return false;
        if (status !== "All" && w.status !== status) return false;
        return true;
      }),
    [workflows, q, status],
  );

  useEffect(() => {
    if (filtered.length && !filtered.some((w) => w.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
    if (filtered.length === 0) setSelectedId(null);
  }, [filtered, selectedId]);

  const selected = filtered.find((w) => w.id === selectedId) ?? null;

  const running = runs.filter((r) => r.status === "running" || r.status === "pending").length;
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const avg = avgHours(runs);

  const createMut = useMutation({
    mutationFn: (p: { name: string; description?: string }) =>
      createWorkflow({
        data: {
          workspaceId: activeWs!,
          name: p.name,
          description: p.description,
          definition: { steps: [] },
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      setShowCreate(false);
      await qc.invalidateQueries({ queryKey: ["workflows", activeWs] });
      toast.success(t("wf.create"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (w: WF) =>
      publishWorkflow({
        data: {
          workflowId: w.id,
          expectedRowVersion: w.row_version,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workflows", activeWs] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: (w: WF) =>
      startWorkflowRun({
        data: { workflowId: w.id, context: {}, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workflow-runs", ids] });
      toast.success(t("wf.panel.run"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{t("wf.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("wf.sub")}</p>
              </div>
              <div className="flex items-center gap-2">
                {workspaces.data && workspaces.data.length > 0 && (
                  <Select
                    value={activeWs ?? ""}
                    onChange={setWsId}
                    label="Workspace"
                    options={workspaces.data.map((w) => w.id)}
                    renderOption={(id) =>
                      workspaces.data?.find((w) => w.id === id)?.name ?? id.slice(0, 8)
                    }
                  />
                )}
                <button
                  onClick={() => setShowCreate(true)}
                  disabled={!activeWs}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> {t("wf.new")}
                </button>
                <Link
                  to="/workflows/calendar"
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <CalendarRange className="h-4 w-4" /> Lịch chạy
                </Link>
                <Link
                  to="/workflows/runs"
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <History className="h-4 w-4" /> Lịch sử chạy
                </Link>
                <Link
                  to="/workflows/permissions"
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <ShieldCheck className="h-4 w-4" /> Phân quyền
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard
                label={t("wf.kpi.total")}
                value={String(workflows.length)}
                icon={WorkflowIcon}
                accent="text-primary"
              />
              <KpiCard
                label={t("wf.kpi.active")}
                value={String(running)}
                icon={Activity}
                accent="text-sky-300"
              />
              <KpiCard
                label={t("wf.kpi.done")}
                value={String(succeeded)}
                icon={CheckCircle2}
                accent="text-emerald-300"
              />
              <KpiCard
                label={t("wf.kpi.pending")}
                value={String(failed)}
                icon={Clock}
                accent="text-amber-300"
              />
              <KpiCard
                label={t("wf.kpi.avg")}
                value={avg === null ? "—" : avg.toFixed(1)}
                suffix={avg === null ? undefined : "h"}
                icon={Clock}
                accent="text-violet-300"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("wf.search")}
                  className="w-full rounded-lg bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Select
                value={status}
                onChange={(v) => setStatus(v as "All" | DbStatus)}
                label={t("wf.filter.status")}
                options={["All", "draft", "published", "archived"]}
                renderOption={(v) =>
                  v === "All" ? "All" : t(`wf.status.${statusKey[v as DbStatus]}` as Key)
                }
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
              {wfQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> …
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <WorkflowIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("wf.sub")}</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    disabled={!activeWs}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> {t("wf.create")}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left font-medium">{t("wf.col.name")}</th>
                        <th className="px-3 py-3 text-left font-medium">{t("wf.col.status")}</th>
                        <th className="px-3 py-3 text-left font-medium">{t("wf.col.instances")}</th>
                        <th className="px-3 py-3 text-left font-medium">{t("wf.col.completed")}</th>
                        <th className="px-3 py-3 text-left font-medium">{t("wf.col.time")}</th>
                        <th className="px-3 py-3 text-left font-medium">{t("wf.col.updated")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((w) => {
                        const r = runsByWf.get(w.id) ?? [];
                        const a = avgHours(r);
                        return (
                          <tr
                            key={w.id}
                            onClick={() => {
                              setSelectedId(w.id);
                              setPanelOpen(true);
                            }}
                            className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${selectedId === w.id ? "bg-surface-2" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium">{w.name}</div>
                              <div className="line-clamp-1 text-[11px] text-muted-foreground">
                                {w.description ?? `v${w.version}`}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <StatusBadge status={w.status} t={t} />
                            </td>
                            <td className="px-3 py-3">
                              {r.filter((x) => x.status === "running" || x.status === "pending").length}
                            </td>
                            <td className="px-3 py-3">
                              {r.filter((x) => x.status === "succeeded").length}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {a === null ? "—" : `${a.toFixed(1)}h`}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {fmtDate(w.updated_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filtered.length > 0 && (
                <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  {t("wf.showing")} {filtered.length} {t("wf.of")} {workflows.length}{" "}
                  {t("wf.cat.workflows")}
                </div>
              )}
            </div>
          </main>

          {selected && panelOpen && (
            <WorkflowPanel
              wf={selected}
              runs={runsByWf.get(selected.id) ?? []}
              onClose={() => setPanelOpen(false)}
              onPublish={() => publishMut.mutate(selected)}
              onRun={() => runMut.mutate(selected)}
              busy={publishMut.isPending || runMut.isPending}
              t={t}
            />
          )}
        </div>
      </div>

      {showCreate && (
        <CreateWorkflowModal
          onClose={() => setShowCreate(false)}
          onSubmit={(v) => createMut.mutate(v)}
          busy={createMut.isPending}
          t={t}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <div className="text-2xl font-semibold">{value}</div>
        {suffix && <div className="text-sm text-muted-foreground">{suffix}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: DbStatus; t: (k: Key) => string }) {
  const cls =
    status === "published"
      ? "bg-success/15 text-success border border-success/30"
      : status === "archived"
        ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
        : "bg-surface-2 text-muted-foreground border border-border";
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {t(`wf.status.${statusKey[status]}` as Key)}
    </span>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
  renderOption,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
  renderOption?: (v: string) => string;
}) {
  return (
    <label className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-surface py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label}: {renderOption ? renderOption(o) : o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}

const runTone: Record<Run["status"], string> = {
  succeeded: "bg-success/15 text-success border border-success/30",
  running: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  pending: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  failed: "bg-destructive/15 text-destructive border border-destructive/30",
  canceled: "bg-surface-2 text-muted-foreground border border-border",
};

function WorkflowPanel({
  wf,
  runs,
  onClose,
  onPublish,
  onRun,
  busy,
  t,
}: {
  wf: WF;
  runs: Run[];
  onClose: () => void;
  onPublish: () => void;
  onRun: () => void;
  busy: boolean;
  t: (k: Key) => string;
}) {
  const steps = Array.isArray((wf.definition as { steps?: unknown })?.steps)
    ? ((wf.definition as { steps: { key?: string; name?: string }[] }).steps ?? [])
    : [];
  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold">{wf.name}</div>
          <StatusBadge status={wf.status} t={t} />
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground">{wf.description ?? "—"}</p>

        <dl className="mt-4 space-y-2.5 text-sm">
          <Row label={t("wf.panel.created")}>
            <span className="text-muted-foreground">{fmtDate(wf.created_at)}</span>
          </Row>
          <Row label={t("wf.panel.updated")}>
            <span className="text-muted-foreground">{fmtDate(wf.updated_at)}</span>
          </Row>
          <Row label="Version">
            <span className="text-muted-foreground">v{wf.version}</span>
          </Row>
        </dl>

        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("wf.panel.diagram")}
          </div>
          {steps.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-2 text-[11px]">
              {steps.map((s, i) => (
                <div key={s.key ?? i} className="flex flex-col items-center gap-1.5">
                  <div className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 font-medium text-sky-300">
                    {s.name ?? s.key ?? `Step ${i + 1}`}
                  </div>
                  {i < steps.length - 1 && <div className="h-3 w-px bg-border" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold">{t("wf.panel.recent")}</div>
          {runs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              —
            </div>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{r.id.slice(0, 8)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtDate(r.started_at ?? r.created_at)}
                    </div>
                  </div>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${runTone[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        {wf.status === "draft" && (
          <button
            onClick={onPublish}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" /> Publish
          </button>
        )}
        <button
          onClick={onRun}
          disabled={busy || wf.status !== "published"}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t("wf.panel.run")}
        </button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CreateWorkflowModal({
  onClose,
  onSubmit,
  busy,
  t,
}: {
  onClose: () => void;
  onSubmit: (v: { name: string; description?: string }) => void;
  busy: boolean;
  t: (k: Key) => string;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("wf.create")}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit({ name: name.trim(), description: desc.trim() || undefined });
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("wf.col.name")}
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder={t("wf.sub")}
            className="w-full resize-none rounded-lg bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("wf.new")}
          </button>
        </form>
      </div>
    </div>
  );
}
