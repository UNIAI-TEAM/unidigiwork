import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getTaskDetail,
  commentTask,
  createSubtask,
  transitionTask,
  updateTask,
  getTaskFollowState,
  toggleTaskFollow,
} from "@/lib/api/tasks.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Pencil,
  Send,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

type Status = "todo" | "in_progress" | "blocked" | "done" | "canceled";

const STATUS_LABEL: Record<Status, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  blocked: "Bị vướng",
  done: "Hoàn thành",
  canceled: "Đã hủy",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
};

export const Route = createFileRoute("/_authenticated/m/tasks_/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết công việc · UNIWORK" },
      { name: "description", content: "Theo dõi tiến độ, chỉnh sửa và chia sẻ công việc." },
      { property: "og:title", content: "Chi tiết công việc · UNIWORK" },
      { property: "og:description", content: "Theo dõi tiến độ, chỉnh sửa và chia sẻ công việc." },
    ],
  }),
  component: MobileTaskDetail,
});

function MobileTaskDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const detail = useQuery({
    queryKey: ["m-task-detail", id],
    queryFn: () => getTaskDetail({ data: { taskId: id } }),
    retry: false,
  });

  const follow = useQuery({
    queryKey: ["m-task-follow", id],
    queryFn: () => getTaskFollowState({ data: { taskId: id } }),
  });

  const followMut = useMutation({
    mutationFn: (next: boolean) => toggleTaskFollow({ data: { taskId: id, follow: next } }),
    onSuccess: (res) => {
      toast.success(res.following ? "Đang theo dõi công việc." : "Đã tắt theo dõi.");
      void qc.invalidateQueries({ queryKey: ["m-task-follow", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: (p: {
      title?: string;
      description?: string;
      priority?: "low" | "normal" | "high" | "urgent";
    }) => updateTask({ data: { taskId: id, ...p, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => {
      setEditOpen(false);
      toast.success("Đã lưu thay đổi.");
      void qc.invalidateQueries({ queryKey: ["m-task-detail", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (p: { taskId: string; to: Status }) =>
      transitionTask({ data: { taskId: p.taskId, toStatus: p.to, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["m-task-detail", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCommentMut = useMutation({
    mutationFn: (body: string) =>
      commentTask({ data: { taskId: id, body, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => {
      setComment("");
      void qc.invalidateQueries({ queryKey: ["m-task-detail", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSubtaskMut = useMutation({
    mutationFn: (title: string) =>
      createSubtask({
        data: { parentTaskId: id, title, priority: "normal", idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => {
      setSubtaskTitle("");
      void qc.invalidateQueries({ queryKey: ["m-task-detail", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const task = detail.data?.task;
  const subtasks = (detail.data?.subtasks ?? []) as Array<{
    id: string;
    title: string;
    status: Status;
  }>;
  const comments = (detail.data?.comments ?? []) as unknown as Array<{
    id: string;
    body: string;
    created_at: string;
    author_name: string | null;
  }>;
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;

  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description ?? "");
    }
  }, [task?.id, task?.title, task?.description, task]);

  if (detail.isLoading)
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải công việc…
      </p>
    );
  if (detail.isError || !task)
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Không mở được công việc này.</p>
        <Button className="mt-3 min-h-11" variant="outline" onClick={() => navigate({ to: "/m/tasks" })}>
          Quay lại danh sách
        </Button>
      </div>
    );

  const progress =
    subtasks.length > 0
      ? Math.round((doneSubtasks / subtasks.length) * 100)
      : task.status === "done"
        ? 100
        : task.status === "in_progress"
          ? 50
          : task.status === "canceled"
            ? 0
            : task.status === "blocked"
              ? 40
              : 0;
  const overdue =
    task.due_at && task.status !== "done" && task.status !== "canceled"
      ? new Date(task.due_at).getTime() < Date.now()
      : false;

  const share = async () => {
    const url = `${window.location.origin}/tasks/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: task.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết.");
      }
    } catch {
      /* người dùng hủy chia sẻ */
    }
  };

  return (
    <div className="flex min-h-full w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden px-4 pb-28 pt-4">
      <header className="flex min-w-0 items-start gap-2">
        <button
          onClick={() => navigate({ to: "/m/tasks" })}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-lg font-semibold leading-tight">{task.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="max-w-full">
              {STATUS_LABEL[task.status] ?? task.status}
            </Badge>
            <Badge variant="outline" className="shrink-0">
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </Badge>
            {overdue && <Badge variant="destructive">Quá hạn</Badge>}
          </div>
        </div>
      </header>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Tiến độ</span>
          <span className="text-muted-foreground">
            {subtasks.length > 0 ? `${doneSubtasks}/${subtasks.length} việc con` : `${progress}%`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-2 gap-2">
        <Button className="min-h-11 w-full min-w-0" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
        </Button>
        <Button variant="outline" className="min-h-11 w-full min-w-0" onClick={share}>
          <Share2 className="mr-2 h-4 w-4" /> Chia sẻ
        </Button>
      </div>

      <Button
        variant={follow.data?.following ? "secondary" : "outline"}
        className="min-h-11 w-full min-w-0"
        disabled={followMut.isPending}
        onClick={() => followMut.mutate(!follow.data?.following)}
      >
        {follow.data?.following ? (
          <BellOff className="mr-2 h-4 w-4" />
        ) : (
          <Bell className="mr-2 h-4 w-4" />
        )}
        {follow.data?.following ? "Đang theo dõi" : "Theo dõi công việc"}
        {(follow.data?.followerCount ?? 0) > 0 && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            {follow.data?.followerCount}
          </Badge>
        )}
      </Button>

      {task.description && (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Mô tả</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        </section>
      )}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Công việc con</h2>
        {subtasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có công việc con.</p>
        ) : (
          <ul className="grid min-w-0 gap-1">
            {subtasks.map((s) => (
              <li key={s.id} className="flex min-h-11 min-w-0 items-center gap-2">
                <button
                  aria-label={s.status === "done" ? `Mở lại ${s.title}` : `Hoàn tất ${s.title}`}
                  className="grid h-11 w-11 shrink-0 place-items-center text-muted-foreground"
                  disabled={changeStatus.isPending}
                  onClick={() =>
                    changeStatus.mutate({ taskId: s.id, to: s.status === "done" ? "todo" : "done" })
                  }
                >
                  <CheckCircle2
                    className={`h-5 w-5 ${s.status === "done" ? "text-success" : ""}`}
                  />
                </button>
                <span
                  className={`min-w-0 flex-1 break-words text-sm ${
                    s.status === "done" ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {s.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (subtaskTitle.trim()) addSubtaskMut.mutate(subtaskTitle.trim());
          }}
          className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
        >
          <Input
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder="Thêm việc con…"
            className="h-11 min-w-0"
          />
          <Button type="submit" className="min-h-11 shrink-0" disabled={!subtaskTitle.trim() || addSubtaskMut.isPending}>
            Thêm
          </Button>
        </form>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Bình luận ({comments.length})</h2>
        <ul className="grid min-w-0 gap-3">
          {comments.map((c) => (
            <li key={c.id} className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author_name ?? "Thành viên"}</span>
                <span>{new Date(c.created_at).toLocaleDateString("vi-VN")}</span>
              </div>
              <p className="mt-0.5 break-words text-sm">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-xs text-muted-foreground">Chưa có bình luận nào.</li>
          )}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) addCommentMut.mutate(comment.trim());
          }}
          className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
        >
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Viết bình luận…"
            className="min-w-0"
          />
          <Button
            type="submit"
            className="min-h-11 shrink-0"
            disabled={!comment.trim() || addCommentMut.isPending}
            aria-label="Gửi bình luận"
          >
            {addCommentMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa công việc</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Tiêu đề
              <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="h-11" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Mô tả
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={4}
                className="min-w-0"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Mức ưu tiên
              <select
                value={task.priority}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                onChange={(e) =>
                  saveEdit.mutate({ priority: e.target.value as "low" | "normal" | "high" | "urgent" })
                }
              >
                <option value="low">Thấp</option>
                <option value="normal">Bình thường</option>
                <option value="high">Cao</option>
                <option value="urgent">Khẩn cấp</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Trạng thái
              <select
                value={task.status}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                disabled={changeStatus.isPending}
                onChange={(e) =>
                  changeStatus.mutate({ taskId: id, to: e.target.value as Status })
                }
              >
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button
              className="min-h-11 w-full"
              disabled={saveEdit.isPending || !titleDraft.trim()}
              onClick={() => {
                const patch: Record<string, string> = {};
                if (titleDraft.trim() && titleDraft !== task.title) patch.title = titleDraft.trim();
                if (descDraft !== (task.description ?? "")) patch.description = descDraft;
                if (Object.keys(patch).length === 0) {
                  setEditOpen(false);
                  return;
                }
                saveEdit.mutate(patch as never);
              }}
            >
              {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
