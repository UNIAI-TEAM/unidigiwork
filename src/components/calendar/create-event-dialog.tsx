import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Video, ListChecks } from "lucide-react";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import { createTask } from "@/lib/api/tasks.functions";
import { scheduleMeeting } from "@/lib/api/meetings.functions";

type Mode = "task" | "meeting";
type Priority = "low" | "normal" | "high" | "urgent";

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Ưu tiên cao",
  urgent: "Khẩn cấp",
};

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function CreateEventDialog({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: Date;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [workspaceId, setWorkspaceId] = useState("");
  const [location, setLocation] = useState("");

  const base = useMemo(() => {
    const d = defaultDate ? new Date(defaultDate) : new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  }, [defaultDate]);
  const [startAt, setStartAt] = useState(toLocalInput(base));
  const [endAt, setEndAt] = useState(toLocalInput(new Date(base.getTime() + 60 * 60 * 1000)));

  useEffect(() => {
    if (!open) return;
    setStartAt(toLocalInput(base));
    setEndAt(toLocalInput(new Date(base.getTime() + 60 * 60 * 1000)));
  }, [open, base]);

  const fetchWorkspaces = useServerFn(listMyWorkspaces);
  const wsQ = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const workspaces = wsQ.data ?? [];
  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) setWorkspaceId(workspaces[0]!.id);
  }, [workspaces, workspaceId]);

  const runCreateTask = useServerFn(createTask);
  const runScheduleMeeting = useServerFn(scheduleMeeting);

  const mutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      if (mode === "task") {
        return runCreateTask({
          data: {
            idempotencyKey,
            workspaceId,
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
            dueAt: new Date(startAt).toISOString(),
          },
        });
      }
      return runScheduleMeeting({
        data: {
          idempotencyKey,
          workspaceId,
          title: title.trim(),
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          agenda: description.trim() || undefined,
          location: location.trim() || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      });
    },
    onSuccess: () => {
      toast.success(mode === "task" ? "Đã tạo công việc" : "Đã tạo cuộc họp");
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      setTitle("");
      setDescription("");
      setLocation("");
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Không thể tạo sự kiện");
    },
  });

  if (!open) return null;

  const invalid =
    !title.trim() ||
    !workspaceId ||
    (mode === "meeting" && new Date(endAt) <= new Date(startAt));

  const fieldCls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="text-base font-semibold">Tạo sự kiện</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "task" as Mode, label: "Công việc / hạn chót", icon: ListChecks },
              { key: "meeting" as Mode, label: "Cuộc họp", icon: Video },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  mode === key
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-surface-2"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tiêu đề</label>
            <input
              className={fieldCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "task" ? "Ví dụ: Hoàn thiện báo cáo tuần" : "Ví dụ: Họp kickoff dự án"}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Workspace</label>
            <select className={fieldCls} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
              {workspaces.length === 0 && <option value="">Đang tải…</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {mode === "task" ? "Hạn chót" : "Bắt đầu"}
              </label>
              <input
                type="datetime-local"
                className={fieldCls}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            {mode === "meeting" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Kết thúc</label>
                <input
                  type="datetime-local"
                  className={fieldCls}
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Mức độ</label>
                <select
                  className={fieldCls}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {mode === "meeting" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Địa điểm (tuỳ chọn)</label>
              <input className={fieldCls} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {mode === "task" ? "Mô tả (tuỳ chọn)" : "Agenda (tuỳ chọn)"}
            </label>
            <textarea
              rows={3}
              className={fieldCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2"
          >
            Huỷ
          </button>
          <button
            disabled={invalid || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Tạo
          </button>
        </div>
      </div>
    </div>
  );
}
