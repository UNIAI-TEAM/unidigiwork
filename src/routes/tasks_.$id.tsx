import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { AskUniPanel } from "@/components/ai/ask-uni-panel";
import { AiTaskExecutionPanel } from "@/components/ai/ai-task-execution-panel";
import { AiCandidateSuggest } from "@/components/ai/ai-candidate-suggest";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, Download, Flag, Link2,
  Loader2, MessageSquare, Paperclip, Plus, Send, Tag, Trash2, User, X,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import {
  getTaskDetail, commentTask, createSubtask, transitionTask,
  addTaskAttachment, deleteTaskAttachment, updateTask, setTaskTags, assignTask,
} from "@/lib/api/tasks.functions";
import { listWorkspaceMembers } from "@/lib/api/workspaces.functions";
import {
  uploadTaskAttachment, getTaskAttachmentUrl, removeTaskAttachmentObject, formatBytes,
} from "@/lib/tasks-storage";
import { parseChatSource, stripChatSource } from "@/lib/chat-task-link";

export const Route = createFileRoute("/tasks_/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết công việc · UNIWORK" },
      { name: "description", content: "Quản lý bình luận, tệp đính kèm, công việc con và hạn chót của công việc." },
      { property: "og:title", content: "Chi tiết công việc · UNIWORK" },
      { property: "og:description", content: "Bình luận, tệp đính kèm, subtask và nhắc hạn cho từng công việc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskDetailPage,
});

type Status = "todo" | "in_progress" | "blocked" | "done" | "canceled";

const STATUS_LABEL: Record<Status, string> = {
  todo: "Cần làm", in_progress: "Đang thực hiện", blocked: "Bị chặn",
  done: "Hoàn thành", canceled: "Đã huỷ",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn cấp",
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}
function relative(v: string) {
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return fmtDate(v);
}

function TaskDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [assigneeDraft, setAssigneeDraft] = useState("");

  const detail = useQuery({
    queryKey: ["task-detail", id],
    queryFn: () => getTaskDetail({ data: { taskId: id } }),
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task-detail", id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  // Sửa mức ưu tiên ngay tại trang chi tiết, lưu tức thì
  const savePriority = useMutation({
    mutationFn: (priority: "low" | "normal" | "high" | "urgent") =>
      updateTask({ data: { taskId: id, priority, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => { invalidate(); toast.success("Đã cập nhật mức ưu tiên"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sửa nhãn (tags) ngay tại trang chi tiết, lưu tức thì
  const saveTags = useMutation({
    mutationFn: (tags: string[]) => setTaskTags({ data: { taskId: id, tags } }),
    onSuccess: () => { invalidate(); toast.success("Đã cập nhật nhãn"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      commentTask({ data: { taskId: id, body, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => { setComment(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSubtask = useMutation({
    mutationFn: (title: string) =>
      createSubtask({ data: { parentTaskId: id, title, priority: "normal", idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => { setSubtaskTitle(""); invalidate(); toast.success("Đã thêm công việc con"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (toStatus: Status) =>
      transitionTask({ data: { taskId: id, toStatus, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSubtask = useMutation({
    mutationFn: (p: { taskId: string; toStatus: Status }) =>
      transitionTask({ data: { taskId: p.taskId, toStatus: p.toStatus, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Giao việc cho thành viên workspace qua server function assignTask
  const assign = useMutation({
    mutationFn: (assigneeId: string) =>
      assignTask({ data: { taskId: id, assigneeId, role: "assignee", idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => { setAssigneeDraft(""); invalidate(); toast.success("Đã giao việc"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAttachment = useMutation({
    mutationFn: async (p: { attachmentId: string; storagePath: string }) => {
      await deleteTaskAttachment({ data: { attachmentId: p.attachmentId } });
      await removeTaskAttachmentObject(p.storagePath);
    },
    onSuccess: () => { invalidate(); toast.success("Đã xoá tệp"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const task = detail.data?.task as
    | { id: string; title: string; description: string | null; status: Status; priority: string; due_at: string | null; workspace_id: string; created_at: string; tags: string[] | null }
    | undefined;
  const subtasks = (detail.data?.subtasks ?? []) as Array<{ id: string; title: string; status: Status }>;
  const comments = (detail.data?.comments ?? []) as Array<{ id: string; body: string; created_at: string; author_id: string | null; author_name: string | null }>;
  const attachments = (detail.data?.attachments ?? []) as Array<{ id: string; file_name: string; storage_path: string; size_bytes: number | null }>;
  const parent = detail.data?.parent as { id: string; title: string } | null | undefined;
  const assignees = (detail.data?.assignees ?? []) as Array<{ user_id: string; role: string | null }>;

  const membersQ = useQuery({
    queryKey: ["workspace-members", task?.workspace_id],
    queryFn: () => listWorkspaceMembers({ data: { workspaceId: task!.workspace_id } }),
    enabled: !!task?.workspace_id,
  });
  const memberName = (uid: string) =>
    membersQ.data?.find((m) => m.userId === uid)?.name ?? uid.slice(0, 8);

  const dueState = useMemo(() => {
    if (!task?.due_at || task.status === "done" || task.status === "canceled") return null;
    const diff = new Date(task.due_at).getTime() - Date.now();
    if (diff < 0) return { tone: "text-destructive", text: "Đã quá hạn" };
    if (diff < 24 * 3600 * 1000) return { tone: "text-amber-500", text: "Sắp đến hạn (dưới 24 giờ)" };
    return null;
  }, [task?.due_at, task?.status]);

  async function onPickFile(file: File) {
    if (!task) return;
    setUploading(true);
    try {
      const up = await uploadTaskAttachment({ workspaceId: task.workspace_id, taskId: task.id, file });
      await addTaskAttachment({
        data: {
          taskId: task.id, fileName: file.name, storagePath: up.storagePath,
          mimeType: up.mimeType, sizeBytes: up.sizeBytes,
        },
      });
      invalidate();
      toast.success("Đã tải tệp lên");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tải tệp thất bại");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(path: string) {
    try {
      window.open(await getTaskAttachmentUrl(path, true), "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được tệp");
    }
  }

  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="tasks" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-none px-4 py-6 sm:px-6 lg:px-8">
            <Link to="/tasks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Quay lại Bảng công việc
            </Link>

            {detail.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải công việc…
              </div>
            ) : detail.isError || !task ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center">
                <p className="text-sm text-muted-foreground">Không tìm thấy công việc hoặc bạn không có quyền xem.</p>
                <button onClick={() => navigate({ to: "/tasks" })} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Về bảng công việc
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{task.id.slice(0, 8)}</span>
                      {parent ? (
                        <>
                          <span>·</span>
                          <Link to="/tasks/$id" params={{ id: parent.id }} className="text-primary hover:underline">
                            {parent.title}
                          </Link>
                        </>
                      ) : null}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge>{STATUS_LABEL[task.status]}</Badge>
                      <Badge>Ưu tiên: {PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
                      {dueState ? <span className={`text-xs font-medium ${dueState.tone}`}>{dueState.text}</span> : null}
                    </div>
                  </div>

                  <Section title="Mô tả">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {stripChatSource(task.description) || "Chưa có mô tả."}
                    </p>
                    {(() => {
                      const src = parseChatSource(task.description);
                      if (!src) return null;
                      return (
                        <Link
                          to="/chat/$channelId"
                          params={{ channelId: src.channelId }}
                          search={{ m: src.messageId }}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-2"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Quay lại tin nhắn trong chat
                        </Link>
                      );
                    })()}
                  </Section>

                  <AiTaskExecutionPanel task={task as never} onChanged={invalidate} />

                  <Section title={`Công việc con (${doneSubtasks}/${subtasks.length})`}>
                    <ul className="space-y-2 text-sm">
                      {subtasks.map((s) => (
                        <li key={s.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.status === "done"}
                            onChange={() => toggleSubtask.mutate({ taskId: s.id, toStatus: s.status === "done" ? "todo" : "done" })}
                            className="h-4 w-4 rounded border-border bg-surface-2"
                          />
                          <Link
                            to="/tasks/$id" params={{ id: s.id }}
                            className={s.status === "done" ? "text-muted-foreground line-through" : "hover:underline"}
                          >
                            {s.title}
                          </Link>
                        </li>
                      ))}
                      {subtasks.length === 0 ? (
                        <li className="text-sm text-muted-foreground">Chưa có công việc con.</li>
                      ) : null}
                    </ul>
                    <form
                      onSubmit={(e) => { e.preventDefault(); if (subtaskTitle.trim()) addSubtask.mutate(subtaskTitle.trim()); }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        value={subtaskTitle}
                        onChange={(e) => setSubtaskTitle(e.target.value)}
                        placeholder="Thêm công việc con…"
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="submit"
                        disabled={addSubtask.isPending || !subtaskTitle.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {addSubtask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Thêm
                      </button>
                    </form>
                  </Section>

                  <Section title={`Tệp đính kèm (${attachments.length})`}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {attachments.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm hover:bg-surface-2">
                          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{a.file_name}</span>
                          <span className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                          <button onClick={() => download(a.storage_path)} aria-label="Tải xuống" className="text-muted-foreground hover:text-foreground">
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeAttachment.mutate({ attachmentId: a.id, storagePath: a.storage_path })}
                            aria-label="Xoá tệp"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
                      >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        {uploading ? "Đang tải…" : "Thêm tệp"}
                      </button>
                      <input
                        ref={fileRef} type="file" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickFile(f); }}
                      />
                    </div>
                  </Section>

                  <Section title={`Bình luận (${comments.length})`}>
                    <div className="space-y-4">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <img src={avatar(c.author_id ?? "user")} alt="" className="h-8 w-8 rounded-full" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{c.author_name ?? "Thành viên"}</span>
                              <span>{relative(c.created_at)}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                          </div>
                        </div>
                      ))}
                      {comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p>
                      ) : null}
                      <div className="flex gap-3">
                        <img src={avatar("me")} alt="" className="h-8 w-8 rounded-full" />
                        <div className="flex flex-1 items-end gap-2 rounded-lg border border-border bg-surface p-2">
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={2}
                            placeholder="Viết bình luận…"
                            className="flex-1 resize-none bg-transparent text-sm focus:outline-none"
                          />
                          <button
                            onClick={() => comment.trim() && addComment.mutate(comment.trim())}
                            disabled={addComment.isPending || !comment.trim()}
                            aria-label="Gửi bình luận"
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>

                <aside className="space-y-4">
                  <Field icon={User} label="Người thực hiện">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {assignees.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Chưa giao</span>
                        ) : (
                          assignees.map((a) => (
                            <span
                              key={a.user_id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium"
                            >
                              <img src={avatar(a.user_id)} alt="" className="h-4 w-4 rounded-full" />
                              {memberName(a.user_id)}
                            </span>
                          ))
                        )}
                      </div>
                      <select
                        aria-label="Giao việc cho thành viên"
                        value={assigneeDraft}
                        disabled={assign.isPending || membersQ.isLoading}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAssigneeDraft(v);
                          if (v) assign.mutate(v);
                        }}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      >
                        <option value="">+ Giao cho…</option>
                        {(membersQ.data ?? [])
                          .filter((m) => !assignees.some((a) => a.user_id === m.userId))
                          .map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.name}
                              {m.isMe ? " (tôi)" : ""}
                            </option>
                          ))}
                      </select>
                    </div>
                  </Field>
                  <Field icon={Flag} label="Mức ưu tiên">
                    <select
                      aria-label="Đổi mức ưu tiên"
                      value={task.priority}
                      disabled={savePriority.isPending}
                      onChange={(e) =>
                        savePriority.mutate(e.target.value as "low" | "normal" | "high" | "urgent")
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="low">Thấp</option>
                      <option value="normal">Bình thường</option>
                      <option value="high">Cao</option>
                      <option value="urgent">Khẩn cấp</option>
                    </select>
                  </Field>
                  <Field icon={Tag} label="Nhãn">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(task.tags ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">Chưa có nhãn</span>
                        ) : (
                          (task.tags ?? []).map((tg) => (
                            <span
                              key={tg}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium"
                            >
                              {tg}
                              <button
                                aria-label={`Xoá nhãn ${tg}`}
                                disabled={saveTags.isPending}
                                onClick={() =>
                                  saveTags.mutate((task.tags ?? []).filter((x) => x !== tg))
                                }
                                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = tagDraft.trim();
                          if (!v) return;
                          const current = task.tags ?? [];
                          if (current.includes(v)) { setTagDraft(""); return; }
                          saveTags.mutate([...current, v]);
                          setTagDraft("");
                        }}
                        className="flex gap-1.5"
                      >
                        <input
                          value={tagDraft}
                          onChange={(e) => setTagDraft(e.target.value)}
                          placeholder="Thêm nhãn…"
                          aria-label="Thêm nhãn"
                          maxLength={40}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="submit"
                          disabled={saveTags.isPending || !tagDraft.trim()}
                          className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {saveTags.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Thêm"}
                        </button>
                      </form>
                    </div>
                  </Field>
                  <Field icon={Calendar} label="Hạn chót">
                    <span className={`text-sm ${dueState?.tone ?? ""}`}>{fmtDate(task.due_at)}</span>
                  </Field>
                  <Field icon={Clock} label="Tạo lúc">
                    <span className="text-sm">{fmtDate(task.created_at)}</span>
                  </Field>
                  {parent ? (
                    <Field icon={Link2} label="Công việc cha">
                      <Link to="/tasks/$id" params={{ id: parent.id }} className="text-sm text-primary hover:underline">
                        {parent.title}
                      </Link>
                    </Field>
                  ) : null}
                  <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                    Hệ thống tự gửi thông báo nhắc hạn trước 24 giờ và khi công việc quá hạn.
                  </p>
                  <button
                    onClick={() => setStatus.mutate(task.status === "done" ? "in_progress" : "done")}
                    disabled={setStatus.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-success/20 px-3 py-2 text-sm font-medium text-success hover:bg-success/30 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {task.status === "done" ? "Mở lại công việc" : "Đánh dấu hoàn thành"}
                  </button>
                  <AskUniPanel
                    rootEntity={{ type: "TASK", id }}
                    label="Hỏi UNI về công việc này"
                    suggestions={["Công việc này liên quan đến gì?", "Đang vướng gì?", "Tóm tắt tiến độ"]}
                  />
                  <AiCandidateSuggest taskId={id} />
                  <RelatedWorkPanel
                    entityType="TASK"
                    entityId={id}
                    className="rounded-xl border border-border bg-surface p-4"
                  />
                </aside>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function Field({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {children}
    </div>
  );
}
