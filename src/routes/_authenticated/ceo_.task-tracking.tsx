// THEO DÕI TỪNG VIỆC — lịch sử trạng thái, tiến độ và ảnh hưởng KPI, tự cập nhật mỗi sáng.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Loader2, Minus } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveWorkspace } from "@/lib/active-workspace";
import {
  canManageTaskTracking,
  listTaskTracking,
  updateTaskTrackingProgress,
  type TaskTrackingRow,
} from "@/lib/api/task-tracking.functions";

export const Route = createFileRoute("/_authenticated/ceo_/task-tracking")({
  head: () => ({
    meta: [
      { title: "Theo dõi từng việc — CEO Command Center" },
      {
        name: "description",
        content:
          "Lịch sử trạng thái, tiến độ và mức ảnh hưởng KPI của từng việc, tự cập nhật mỗi sáng.",
      },
      { property: "og:title", content: "Theo dõi từng việc — CEO Command Center" },
      {
        property: "og:description",
        content: "Xem lịch sử trạng thái, tiến độ và ảnh hưởng KPI của từng việc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskTrackingPage,
});

const STATUS_LABEL: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  blocked: "Vướng mắc",
  done: "Hoàn thành",
  canceled: "Đã huỷ",
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Delta({ value }: { value: number | null }) {
  if (value === null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (value === 0) return <span className="text-xs text-muted-foreground">±0</span>;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        value > 0 ? "text-emerald-600" : "text-destructive"
      }`}
    >
      {value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}
    </span>
  );
}

const EDIT_STATUS = ["todo", "in_progress", "blocked", "done"] as const;

function ProgressEditor({
  row,
  workspaceId,
}: {
  row: TaskTrackingRow;
  workspaceId: string | null;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateTaskTrackingProgress);
  const [pct, setPct] = useState(String(row.progressPct));
  const [status, setStatus] = useState<string>(row.status);
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: () =>
      update({
        data: {
          workspaceId,
          taskId: row.id,
          progressPct: Math.max(0, Math.min(100, Number(pct) || 0)),
          status: status as (typeof EDIT_STATUS)[number],
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.kpi?.score !== null && res.kpi
          ? `Đã cập nhật tiến độ. Điểm KPI hiện tại ${res.kpi.score}.`
          : "Đã cập nhật tiến độ và làm mới KPI.",
      );
      setNote("");
      void qc.invalidateQueries({ queryKey: ["ceo"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.includes("FORBIDDEN")
          ? "Chỉ quản trị viên tổ chức được cập nhật tiến độ."
          : "Không cập nhật được tiến độ.",
      );
    },
  });

  return (
    <div className="mb-3 grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-[7rem_11rem_1fr_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor={`pct-${row.id}`} className="text-xs">
          Tiến độ (%)
        </Label>
        <Input
          id={`pct-${row.id}`}
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Trạng thái</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDIT_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`note-${row.id}`} className="text-xs">
          Ghi chú (tuỳ chọn)
        </Label>
        <Input
          id={`note-${row.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Lý do thay đổi tiến độ…"
          className="h-11"
        />
      </div>
      <Button
        type="button"
        className="h-11 min-h-[44px]"
        disabled={m.isPending}
        onClick={() => m.mutate()}
      >
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu"}
      </Button>
    </div>
  );
}

function TaskCard({
  row,
  canManage,
  workspaceId,
}: {
  row: TaskTrackingRow;
  canManage: boolean;
  workspaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{STATUS_LABEL[row.status] ?? row.status}</Badge>
            <span>Tiến độ {row.progressPct}%</span>
            <Delta value={row.progressDelta} />
            <span>Hạn {fmt(row.dueAt)}</span>
            {row.isAi ? <Badge variant="outline">AI</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.kpi.countsOverdue ? (
              <Badge variant="destructive">Tính vào KPI quá hạn</Badge>
            ) : null}
            {row.kpi.countsCompleted ? <Badge variant="outline">Tính vào hoàn thành</Badge> : null}
            {row.kpi.countsAiShare ? <Badge variant="outline">Tính vào tỷ lệ AI</Badge> : null}
            {!row.kpi.inWindow && !row.kpi.countsOverdue && !row.kpi.countsCompleted ? (
              <span className="text-[11px] text-muted-foreground">Ngoài kỳ KPI 7 ngày</span>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3">
          {canManage ? <ProgressEditor row={row} workspaceId={workspaceId} /> : null}
          {row.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có ghi nhận nào. Hệ thống sẽ tự ghi mỗi sáng.
            </p>
          ) : (
            <ol className="space-y-2">
              {row.history.map((e) => (
                <li key={`${row.id}-${e.at}`} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmt(e.at)}</span>
                  <span className="min-w-0 flex-1">
                    {e.body}
                    {e.auto ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">(tự động)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaskTrackingPage() {
  const [nav, setNav] = useState(false);
  const { workspaceId } = useActiveWorkspace();
  const fn = useServerFn(listTaskTracking);
  const canFn = useServerFn(canManageTaskTracking);

  const q = useQuery({
    queryKey: ["ceo", "task-tracking", workspaceId ?? ""],
    queryFn: () => fn({ data: { workspaceId: workspaceId ?? null, limit: 30 } }),
  });
  const canQ = useQuery({
    queryKey: ["ceo", "task-tracking-can-manage", workspaceId ?? ""],
    queryFn: () => canFn({ data: { workspaceId: workspaceId ?? null } }),
  });
  const canManage = canQ.data === true;

  const rows = q.data ?? [];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ceo" open={nav} onClose={() => setNav(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setNav(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6 sm:px-6">
          <div className="min-w-0">
            <Link
              to="/ceo"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> CEO Command Center
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Theo dõi từng việc</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lịch sử trạng thái và tiến độ của từng việc do hệ thống ghi tự động mỗi sáng, kèm mức
              ảnh hưởng lên KPI trong kỳ 7 ngày.
            </p>
          </div>

          {q.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách việc…
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-sm text-muted-foreground">
              Chưa có việc nào để theo dõi.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <TaskCard
                  key={r.id}
                  row={r}
                  canManage={canManage}
                  workspaceId={workspaceId ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
