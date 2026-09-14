// GIAO BAN THỰC TẾ — CEO ghi nhận kết quả từng công việc trong cuộc họp.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/active-workspace";
import {
  getAutoStandupSettings,
  getStandupBoard,
  recordStandupOutcome,
  setAutoStandupEnabled,
  setAutoStandupHour,
  type StandupTask,
} from "@/lib/api/ceo-standup.functions";

export const Route = createFileRoute("/_authenticated/ceo_/standup")({
  head: () => ({
    meta: [
      { title: "Giao ban thực tế — CEO Command Center" },
      {
        name: "description",
        content:
          "Ghi nhận kết quả từng công việc ngay trong buổi giao ban: trạng thái, tiến độ và ghi chú, tự cập nhật KPI và nhật ký.",
      },
      { property: "og:title", content: "Giao ban thực tế — CEO Command Center" },
      {
        property: "og:description",
        content:
          "Ghi nhận kết quả từng công việc ngay trong buổi giao ban: trạng thái, tiến độ và ghi chú.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StandupPage,
});

const STATUS: { id: "todo" | "in_progress" | "blocked" | "done"; label: string }[] = [
  { id: "todo", label: "Chưa làm" },
  { id: "in_progress", label: "Đang làm" },
  { id: "blocked", label: "Vướng mắc" },
  { id: "done", label: "Hoàn thành" },
];

const statusLabel = (s: string) => STATUS.find((x) => x.id === s)?.label ?? s;

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function TaskRow({
  task,
  meetingTitle,
  onSaved,
}: {
  task: StandupTask;
  meetingTitle: string | null;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(task.status);
  const [pct, setPct] = useState<number>(task.progressPct ?? (task.status === "done" ? 100 : 0));
  const [note, setNote] = useState("");
  const record = useServerFn(recordStandupOutcome);

  const dirty = status !== task.status || pct !== (task.progressPct ?? 0) || note.trim().length > 0;

  const save = useMutation({
    mutationFn: () =>
      record({
        data: {
          taskId: task.id,
          meetingTitle,
          status: status as "todo" | "in_progress" | "blocked" | "done",
          progressPct: pct,
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Đã ghi nhận kết quả giao ban");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Không lưu được"),
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {task.projectName ? <span className="truncate">{task.projectName}</span> : null}
            <span>Hạn: {fmt(task.dueAt)}</span>
            {task.overdue ? <Badge variant="destructive">Quá hạn</Badge> : null}
            <span>Hiện tại: {statusLabel(task.status)}</span>
          </div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">{pct}%</div>
      </div>

      {task.lastNote ? (
        <div className="mt-2 line-clamp-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-muted-foreground">
          {task.lastNote}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          aria-label="Trạng thái"
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="h-11 w-full"
            aria-label="Tiến độ"
          />
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Kết quả ghi nhận tại buổi giao ban…"
        className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />

      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          className="min-h-11"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Ghi nhận
        </Button>
      </div>
    </div>
  );
}

function AutoStandupCard() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getAutoStandupSettings);
  const setEnabled = useServerFn(setAutoStandupEnabled);
  const setHour = useServerFn(setAutoStandupHour);
  const { data } = useQuery({
    queryKey: ["ceo", "auto-standup"],
    queryFn: () => getSettings({}),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setEnabled({ data: { enabled } }),
    onSuccess: (res) => {
      toast.success(res.enabled ? "Đã bật giao ban tự động" : "Đã tắt giao ban tự động");
      void qc.invalidateQueries({ queryKey: ["ceo", "auto-standup"] });
    },
    onError: () => toast.error("Không lưu được cài đặt"),
  });

  const changeHour = useMutation({
    mutationFn: (hourVn: number) => setHour({ data: { hourVn } }),
    onSuccess: (res) => {
      toast.success(`Giao ban tự động sẽ chạy lúc ${String(res.hourVn).padStart(2, "0")}:30`);
      void qc.invalidateQueries({ queryKey: ["ceo", "auto-standup"] });
    },
    onError: () => toast.error("Không lưu được giờ chạy"),
  });

  const enabled = data?.enabled ?? true;
  const hourVn = data?.hourVn ?? 6;
  const s = data?.snapshot;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Giao ban tự động mỗi sáng
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Mỗi sáng hệ thống tự ghi nhận kết quả 24 giờ qua vào nhật ký công việc và làm mới KPI,
            không cần bấm thủ công.
          </p>
          <div className="mt-2 text-xs text-muted-foreground">
            Lần chạy gần nhất: {fmt(data?.lastRunAt ?? null)}
            {s
              ? ` · ${s.tasksTouched ?? 0} việc, ${s.done ?? 0} hoàn thành, ${s.overdue ?? 0} quá hạn, ${s.notes ?? 0} ghi chú`
              : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? "Đang bật" : "Đã tắt"}
          </Badge>
          <Button
            size="sm"
            variant={enabled ? "outline" : "default"}
            className="min-h-11"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!enabled)}
          >
            {toggle.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {enabled ? "Tắt" : "Bật"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StandupPage() {
  const [open, setOpen] = useState(false);
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();
  const boardFn = useServerFn(getStandupBoard);
  const [meetingId, setMeetingId] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "open" | "overdue">("open");

  const { data, isLoading } = useQuery({
    queryKey: ["ceo", "standup", workspaceId ?? ""],
    queryFn: () => boardFn({ data: { workspaceId: workspaceId ?? null } }),
  });

  const meeting = data?.meetings.find((m) => m.id === meetingId) ?? null;

  const tasks = useMemo(() => {
    const all = data?.tasks ?? [];
    if (filter === "overdue") return all.filter((t) => t.overdue);
    if (filter === "open") return all.filter((t) => t.status !== "done");
    return all;
  }, [data, filter]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ceo"] });
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    void qc.invalidateQueries({ queryKey: ["project"] });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ceo" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to="/ceo"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> CEO Command Center
              </Link>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Giao ban thực tế</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ghi nhận kết quả từng việc ngay trong buổi họp. KPI và nhật ký tự cập nhật.
              </p>
            </div>
          </div>

          {isLoading || !data ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dữ liệu giao ban…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: "Việc theo dõi", value: `${data.summary.total}` },
                  { label: "Hoàn thành", value: `${data.summary.done}` },
                  { label: "Quá hạn", value: `${data.summary.overdue}` },
                  { label: "Tiến độ TB", value: `${data.summary.avgProgress}%` },
                ].map((c) => (
                  <div key={c.label} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">{c.value}</div>
                  </div>
                ))}
              </div>

              <AutoStandupCard />

              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4" /> Cuộc họp giao ban
                </div>
                <select
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  aria-label="Chọn cuộc họp"
                >
                  <option value="">Không gắn cuộc họp</option>
                  {data.meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — {fmt(m.startAt)}
                    </option>
                  ))}
                </select>
                {meeting?.location ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Địa điểm: {meeting.location}
                  </div>
                ) : null}
              </div>

              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="flex min-w-max gap-1 rounded-xl border border-border bg-surface p-1">
                  {(
                    [
                      { id: "open", label: "Chưa xong" },
                      { id: "overdue", label: "Quá hạn" },
                      { id: "all", label: "Tất cả" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={`min-h-11 rounded-lg px-4 text-sm font-medium transition-colors ${
                        filter === f.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" /> Không có công việc nào trong bộ lọc này.
                  </div>
                ) : (
                  tasks.map((t) => (
                    <TaskRow
                      key={`${t.id}-${t.status}-${t.progressPct ?? 0}`}
                      task={t}
                      meetingTitle={meeting?.title ?? null}
                      onSaved={refresh}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
