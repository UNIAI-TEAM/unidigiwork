import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Save, Play, Rocket, Trash2, ArrowUp, ArrowDown,
  Zap, Sparkles, GitBranch, Mail, Database, CheckCircle2, Clock, Loader2,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  getWorkflow, updateWorkflow, publishWorkflow, startWorkflowRun,
  upsertWorkflowTrigger, deleteWorkflowTrigger,
} from "@/lib/api/workflows.functions";

export const Route = createFileRoute("/workflows/$id")({
  head: () => ({
    meta: [
      { title: "Trình thiết kế quy trình · UNIWORK" },
      { name: "description", content: "Thiết kế các bước quy trình và cấu hình trigger/lịch chạy tự động." },
    ],
  }),
  component: WorkflowBuilderPage,
});

type StepType = "trigger" | "ai" | "branch" | "action" | "notify" | "end";
type OnErrorPolicy = "stop" | "skip";
type Step = { key: string; title: string; type: StepType; config: Record<string, unknown> };

const ON_ERROR_OPTIONS: { value: OnErrorPolicy; label: string; hint: string }[] = [
  { value: "stop", label: "Dừng toàn bộ", hint: "Bước lỗi sẽ kết thúc cả lượt chạy (trạng thái thất bại)." },
  { value: "skip", label: "Bỏ qua bước", hint: "Bước lỗi được đánh dấu bỏ qua, lượt chạy tiếp tục." },
];

const stepOnError = (s: Step): OnErrorPolicy =>
  (s.config?.["on_error"] === "skip" ? "skip" : "stop");

const STEP_META: Record<StepType, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  trigger: { label: "Khởi động", icon: Zap, cls: "bg-warning/15 text-warning border-warning/30" },
  ai: { label: "AI xử lý", icon: Sparkles, cls: "bg-primary/15 text-primary border-primary/30" },
  branch: { label: "Điều kiện", icon: GitBranch, cls: "bg-accent/15 text-accent-foreground border-border" },
  action: { label: "Hành động", icon: Database, cls: "bg-success/15 text-success border-success/30" },
  notify: { label: "Thông báo", icon: Mail, cls: "bg-success/15 text-success border-success/30" },
  end: { label: "Kết thúc", icon: CheckCircle2, cls: "bg-surface-2 text-muted-foreground border-border" },
};

const FREQ: { value: "minutes" | "hourly" | "daily" | "weekly"; label: string }[] = [
  { value: "minutes", label: "Mỗi N phút" },
  { value: "hourly", label: "Hàng giờ" },
  { value: "daily", label: "Hàng ngày" },
  { value: "weekly", label: "Hàng tuần" },
];
const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

function WorkflowBuilderPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => getWorkflow({ data: { workflowId: id } }),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data?.workflow) return;
    const def = (data.workflow.definition ?? {}) as { steps?: Step[] };
    setName(data.workflow.name ?? "");
    setDescription(data.workflow.description ?? "");
    setSteps(Array.isArray(def.steps) ? def.steps : []);
    setDirty(false);
  }, [data?.workflow]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["workflow", id] });

  const save = useMutation({
    mutationFn: () =>
      updateWorkflow({
        data: {
          idempotencyKey: uid(),
          workflowId: id,
          name: name.trim() || "Quy trình chưa đặt tên",
          description,
          definition: { steps } as Record<string, unknown>,
        },
      }),
    onSuccess: () => { toast.success("Đã lưu quy trình"); setDirty(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: () => publishWorkflow({ data: { idempotencyKey: uid(), workflowId: id } }),
    onSuccess: () => { toast.success("Đã phát hành quy trình"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: () => startWorkflowRun({ data: { idempotencyKey: uid(), workflowId: id, context: { source: "manual" } } }),
    onSuccess: () => { toast.success("Đã tạo lượt chạy"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutateSteps = (next: Step[]) => { setSteps(next); setDirty(true); };
  const addStep = (type: StepType) =>
    mutateSteps([...steps, { key: `step_${steps.length + 1}_${Math.random().toString(36).slice(2, 6)}`, title: STEP_META[type].label, type, config: {} }]);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    const a = next[i]!; next[i] = next[j]!; next[j] = a;
    mutateSteps(next);
  };

  const wf = data?.workflow;
  const published = wf?.status === "published";

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <Link to="/workflows" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Tất cả quy trình
            </Link>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setDirty(true); }}
                placeholder="Tên quy trình"
                className="w-full max-w-md rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none hover:border-border focus:border-border focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${published ? "bg-success/15 text-success" : "bg-surface-2 text-muted-foreground"}`}>
                {published ? "Đã phát hành" : "Bản nháp"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm hover:bg-surface-3 disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
            </button>
            <button
              onClick={() => publish.mutate()}
              disabled={publish.isPending || published}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm hover:bg-surface-3 disabled:opacity-50"
            >
              <Rocket className="h-4 w-4" /> Phát hành
            </button>
            <button
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending || !published}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Chạy ngay
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Đang tải…</div>
          ) : !wf ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">Không tìm thấy quy trình này.</p>
              <Link to="/workflows" className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Về danh sách</Link>
            </div>
          ) : (
            <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 xl:grid-cols-3">
              {/* Steps */}
              <section className="space-y-4 xl:col-span-2">
                <div className="rounded-xl border border-border bg-card p-4 md:p-6">
                  <h2 className="text-sm font-semibold">Mô tả</h2>
                  <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                    rows={2}
                    placeholder="Quy trình này làm gì?"
                    className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="rounded-xl border border-border bg-card p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Các bước ({steps.length})</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(STEP_META) as StepType[]).map((t) => (
                        <button key={t} onClick={() => addStep(t)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-surface-2">
                          <Plus className="h-3.5 w-3.5" /> {STEP_META[t].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {steps.length === 0 ? (
                    <p className="mt-6 text-center text-sm text-muted-foreground">Chưa có bước nào — thêm bước đầu tiên ở trên.</p>
                  ) : (
                    <ol className="mt-4 space-y-2">
                      {steps.map((s, i) => {
                        const Icon = STEP_META[s.type].icon;
                        return (
                          <li key={s.key} className="rounded-xl border border-border bg-surface-2 p-3">
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border ${STEP_META[s.type].cls}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1 space-y-2">
                                <input
                                  value={s.title}
                                  onChange={(e) => mutateSteps(steps.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                                  className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={s.type}
                                    onChange={(e) => mutateSteps(steps.map((x, k) => (k === i ? { ...x, type: e.target.value as StepType } : x)))}
                                    className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                                  >
                                    {(Object.keys(STEP_META) as StepType[]).map((t) => (
                                      <option key={t} value={t}>{STEP_META[t].label}</option>
                                    ))}
                                  </select>
                                  <span className="font-mono text-[10px] text-muted-foreground">{s.key}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="text-xs text-muted-foreground">Khi lỗi</label>
                                  <select
                                    value={stepOnError(s)}
                                    onChange={(e) =>
                                      mutateSteps(
                                        steps.map((x, k) =>
                                          k === i
                                            ? { ...x, config: { ...(x.config ?? {}), on_error: e.target.value as OnErrorPolicy } }
                                            : x,
                                        ),
                                      )
                                    }
                                    className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                                  >
                                    {ON_ERROR_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                  <span className="text-[11px] text-muted-foreground">
                                    {ON_ERROR_OPTIONS.find((o) => o.value === stepOnError(s))?.hint}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button aria-label="Lên" onClick={() => move(i, -1)} className="rounded-lg p-1.5 hover:bg-surface-3"><ArrowUp className="h-3.5 w-3.5" /></button>
                                <button aria-label="Xuống" onClick={() => move(i, 1)} className="rounded-lg p-1.5 hover:bg-surface-3"><ArrowDown className="h-3.5 w-3.5" /></button>
                                <button aria-label="Xoá bước" onClick={() => mutateSteps(steps.filter((_, k) => k !== i))} className="rounded-lg p-1.5 text-destructive hover:bg-surface-3"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </section>

              {/* Triggers + runs */}
              <section className="space-y-4">
                <TriggersPanel workflowId={id} triggers={data.triggers} published={published} onChanged={refresh} />
                <div className="rounded-xl border border-border bg-card p-4 md:p-6">
                  <h2 className="text-sm font-semibold">Lượt chạy gần đây</h2>
                  {data.runs.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">Chưa có lượt chạy nào.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {data.runs.slice(0, 8).map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
                          <span className="truncate font-mono text-[10px] text-muted-foreground">{r.id.slice(0, 8)}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at as string).toLocaleString("vi-VN")}
                          </span>
                          <span className="rounded-full bg-card px-2 py-0.5">{r.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type TriggerRow = {
  id: string; kind: string; frequency: string | null; interval_minutes: number | null;
  at_hour: number | null; at_minute: number | null; weekday: number | null; timezone: string;
  event_type: string | null; is_enabled: boolean; next_run_at: string | null; last_fired_at: string | null;
};

function TriggersPanel({
  workflowId, triggers, published, onChanged,
}: { workflowId: string; triggers: TriggerRow[]; published: boolean; onChanged: () => void }) {
  const [kind, setKind] = useState<"schedule" | "event">("schedule");
  const [frequency, setFrequency] = useState<"minutes" | "hourly" | "daily" | "weekly">("daily");
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [atHour, setAtHour] = useState(9);
  const [atMinute, setAtMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [eventType, setEventType] = useState("document.created");

  const save = useMutation({
    mutationFn: () =>
      upsertWorkflowTrigger({
        data: {
          workflowId, kind,
          frequency: kind === "schedule" ? frequency : undefined,
          intervalMinutes: kind === "schedule" && frequency === "minutes" ? intervalMinutes : undefined,
          atHour: kind === "schedule" && (frequency === "daily" || frequency === "weekly") ? atHour : undefined,
          atMinute: kind === "schedule" && frequency !== "minutes" ? atMinute : undefined,
          weekday: kind === "schedule" && frequency === "weekly" ? weekday : undefined,
          eventType: kind === "event" ? eventType.trim() : undefined,
          payload: {}, isEnabled: true,
        },
      }),
    onSuccess: () => { toast.success("Đã lưu trigger"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (t: TriggerRow) =>
      upsertWorkflowTrigger({
        data: {
          workflowId, triggerId: t.id, kind: t.kind as "schedule" | "event",
          frequency: (t.frequency ?? undefined) as never,
          intervalMinutes: t.interval_minutes ?? undefined,
          atHour: t.at_hour ?? undefined, atMinute: t.at_minute ?? undefined,
          weekday: t.weekday ?? undefined, timezone: t.timezone,
          eventType: t.event_type ?? undefined, payload: {}, isEnabled: !t.is_enabled,
        },
      }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (triggerId: string) => deleteWorkflowTrigger({ data: { triggerId } }),
    onSuccess: () => { toast.success("Đã xoá trigger"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const describe = (t: TriggerRow) => {
    if (t.kind === "event") return `Sự kiện: ${t.event_type}`;
    if (t.frequency === "minutes") return `Mỗi ${t.interval_minutes} phút`;
    if (t.frequency === "hourly") return `Hàng giờ, phút ${String(t.at_minute ?? 0).padStart(2, "0")}`;
    const hhmm = `${String(t.at_hour ?? 0).padStart(2, "0")}:${String(t.at_minute ?? 0).padStart(2, "0")}`;
    if (t.frequency === "daily") return `Hàng ngày lúc ${hhmm}`;
    return `${WEEKDAYS[t.weekday ?? 1]} hàng tuần lúc ${hhmm}`;
  };

  const hint = useMemo(
    () => (published ? null : "Quy trình phải được phát hành thì trigger mới tạo được lượt chạy."),
    [published],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6">
      <h2 className="text-sm font-semibold">Trigger &amp; Lịch chạy</h2>
      {hint && <p className="mt-1 text-xs text-warning">{hint}</p>}

      <div className="mt-3 space-y-2">
        {triggers.length === 0 && <p className="text-xs text-muted-foreground">Chưa có trigger nào.</p>}
        {triggers.map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm">{describe(t)}</p>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => toggle.mutate(t)}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${t.is_enabled ? "bg-success/15 text-success" : "bg-card text-muted-foreground"}`}>
                  {t.is_enabled ? "Đang bật" : "Đã tắt"}
                </button>
                <button aria-label="Xoá trigger" onClick={() => remove.mutate(t.id)} className="rounded-lg p-1.5 text-destructive hover:bg-surface-3">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t.kind === "schedule" && t.next_run_at ? `Lần chạy kế: ${new Date(t.next_run_at).toLocaleString("vi-VN")} · ${t.timezone}` : "Kích hoạt theo sự kiện"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <div className="flex gap-1.5">
          {(["schedule", "event"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`h-8 flex-1 rounded-lg border px-2 text-xs ${kind === k ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-surface-2"}`}>
              {k === "schedule" ? "Theo lịch" : "Theo sự kiện"}
            </button>
          ))}
        </div>

        {kind === "schedule" ? (
          <div className="grid grid-cols-2 gap-2">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}
              className="col-span-2 h-9 rounded-lg border border-border bg-surface-2 px-2 text-sm">
              {FREQ.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            {frequency === "minutes" && (
              <label className="col-span-2 text-xs text-muted-foreground">
                Mỗi (phút)
                <input type="number" min={1} max={1440} value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground" />
              </label>
            )}
            {frequency === "weekly" && (
              <label className="col-span-2 text-xs text-muted-foreground">
                Ngày trong tuần
                <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground">
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
            )}
            {(frequency === "daily" || frequency === "weekly") && (
              <label className="text-xs text-muted-foreground">
                Giờ
                <input type="number" min={0} max={23} value={atHour} onChange={(e) => setAtHour(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground" />
              </label>
            )}
            {frequency !== "minutes" && (
              <label className="text-xs text-muted-foreground">
                Phút
                <input type="number" min={0} max={59} value={atMinute} onChange={(e) => setAtMinute(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground" />
              </label>
            )}
          </div>
        ) : (
          <label className="block text-xs text-muted-foreground">
            Mã sự kiện
            <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="document.created"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground" />
          </label>
        )}

        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm trigger
        </button>
      </div>
    </div>
  );
}
