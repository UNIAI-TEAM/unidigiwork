import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, BellOff, CalendarDays, CheckCircle2, Download, FileText, Loader2, Paperclip, Pencil, Plus, Send, Share2, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AiTaskExecutionPanel } from "@/components/ai/ai-task-execution-panel";
import { TaskChatSummary } from "@/components/mobile/task-chat-summary";
import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { assignTask, addTaskAttachment, commentTask, createSubtask, deleteTaskAttachment, getTaskDetail, getTaskFollowState, setTaskDueAt, setTaskTags, toggleTaskFollow, transitionTask, updateTask } from "@/lib/api/tasks.functions";
import { listWorkspaceMembers } from "@/lib/api/workspaces.functions";
import { useI18n } from "@/lib/i18n";
import { formatBytes, getTaskAttachmentUrl, removeTaskAttachmentObject, uploadTaskAttachment } from "@/lib/tasks-storage";

type Status = "todo" | "in_progress" | "blocked" | "done" | "canceled";
type Priority = "low" | "normal" | "high" | "urgent";

export function MobileTaskDetail({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const detail = useQuery({ queryKey: ["task-detail", id], queryFn: () => getTaskDetail({ data: { taskId: id } }), retry: false });
  const follow = useQuery({ queryKey: ["task-follow", id], queryFn: () => getTaskFollowState({ data: { taskId: id } }) });
  const task = detail.data?.task;
  const members = useQuery({ queryKey: ["workspace-members", task?.workspace_id], queryFn: () => listWorkspaceMembers({ data: { workspaceId: task?.workspace_id ?? "" } }), enabled: Boolean(task?.workspace_id) });
  const invalidate = async () => Promise.all([qc.invalidateQueries({ queryKey: ["task-detail", id] }), qc.invalidateQueries({ queryKey: ["task-ops-board"] }), qc.invalidateQueries({ queryKey: ["m-work-graph"] })]);
  const notifyError = (error: unknown) => toast.error(error instanceof Error ? error.message : t("m.tasks.actionError"));

  const followMutation = useMutation({ mutationFn: (value: boolean) => toggleTaskFollow({ data: { taskId: id, follow: value } }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["task-follow", id] }); }, onError: notifyError });
  const editMutation = useMutation({ mutationFn: (patch: { title?: string; description?: string; priority?: Priority }) => updateTask({ data: { taskId: id, ...patch, expectedRowVersion: task?.row_version, idempotencyKey: crypto.randomUUID() } }), onSuccess: async () => { setEditOpen(false); await invalidate(); toast.success(t("m.tasks.saved")); }, onError: notifyError });
  const statusMutation = useMutation({ mutationFn: ({ taskId, status, rowVersion }: { taskId: string; status: Status; rowVersion?: number }) => transitionTask({ data: { taskId, toStatus: status, expectedRowVersion: rowVersion, idempotencyKey: crypto.randomUUID() } }), onSuccess: invalidate, onError: notifyError });
  const dueMutation = useMutation({ mutationFn: (dueAt: string | null) => setTaskDueAt({ data: { taskId: id, dueAt, idempotencyKey: crypto.randomUUID() } }), onSuccess: invalidate, onError: notifyError });
  const assignMutation = useMutation({ mutationFn: (assigneeId: string) => assignTask({ data: { taskId: id, assigneeId, role: "assignee", idempotencyKey: crypto.randomUUID() } }), onSuccess: async () => { await invalidate(); toast.success(t("m.tasks.assigned")); }, onError: notifyError });
  const tagsMutation = useMutation({ mutationFn: (tags: string[]) => setTaskTags({ data: { taskId: id, tags } }), onSuccess: invalidate, onError: notifyError });
  const commentMutation = useMutation({ mutationFn: (body: string) => commentTask({ data: { taskId: id, body, idempotencyKey: crypto.randomUUID() } }), onSuccess: async () => { setComment(""); await invalidate(); }, onError: notifyError });
  const subtaskMutation = useMutation({ mutationFn: (title: string) => createSubtask({ data: { parentTaskId: id, title, priority: "normal", idempotencyKey: crypto.randomUUID() } }), onSuccess: async () => { setSubtaskTitle(""); await invalidate(); }, onError: notifyError });
  const removeAttachment = useMutation({ mutationFn: async ({ attachmentId, storagePath }: { attachmentId: string; storagePath: string }) => { await deleteTaskAttachment({ data: { attachmentId } }); await removeTaskAttachmentObject(storagePath); }, onSuccess: invalidate, onError: notifyError });

  useEffect(() => { if (task) { setTitleDraft(task.title); setDescriptionDraft(task.description ?? ""); } }, [task?.id, task?.title, task?.description]);

  if (detail.isLoading) return <div className="grid gap-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (detail.isError || !task) return <main className="p-4"><p className="text-sm text-muted-foreground">{t("m.tasks.notFound")}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => navigate({ to: "/m/tasks" })}>{t("m.tasks.back")}</Button></main>;

  const subtasks = (detail.data?.subtasks ?? []) as Array<{ id: string; title: string; status: Status; row_version?: number }>;
  const comments = (detail.data?.comments ?? []) as Array<{ id: string; body: string; created_at: string; author_name: string | null }>;
  const attachments = (detail.data?.attachments ?? []) as Array<{ id: string; file_name: string; storage_path: string; size_bytes: number | null }>;
  const assignees = (detail.data?.assignees ?? []) as Array<{ user_id: string; role: string | null }>;
  const done = subtasks.filter((item) => item.status === "done").length;
  const progress = subtasks.length ? Math.round((done / subtasks.length) * 100) : task.status === "done" ? 100 : task.status === "in_progress" ? 50 : task.status === "blocked" ? 40 : 0;
  const overdue = Boolean(task.due_at && !["done", "canceled"].includes(task.status) && new Date(task.due_at).getTime() < Date.now());
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const nameFor = (userId: string) => members.data?.find((member) => member.userId === userId)?.name ?? userId.slice(0, 8);
  const localDue = task.due_at ? new Date(new Date(task.due_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadTaskAttachment({ workspaceId: task.workspace_id, taskId: id, file });
      await addTaskAttachment({ data: { taskId: id, fileName: file.name, storagePath: result.storagePath, mimeType: result.mimeType, sizeBytes: result.sizeBytes } });
      await invalidate();
      toast.success(t("m.tasks.fileUploaded"));
    } catch (error) { notifyError(error); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const share = async () => {
    const url = `${window.location.origin}/m/tasks/${id}`;
    try { if (navigator.share) await navigator.share({ title: task.title, url }); else { await navigator.clipboard.writeText(url); toast.success(t("m.tasks.linkCopied")); } } catch { /* share dismissed */ }
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col overflow-x-hidden pb-24">
      <header className="sticky top-0 z-20 flex min-w-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={() => navigate({ to: "/m/tasks" })} aria-label={t("m.tasks.back")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{task.title}</h1><p className="truncate text-xs text-muted-foreground">{t(`m.tasks.status.${task.status}` as never)} · {t(`m.tasks.priority.${task.priority}` as never)}</p></div>
        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => followMutation.mutate(!follow.data?.following)} aria-label={t("m.tasks.follow")}>{follow.data?.following ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={share} aria-label={t("m.tasks.share")}><Share2 className="h-5 w-5" /></Button>
      </header>

      <div className="grid gap-4 px-4 pt-4">
        <section className="border-b border-border pb-4">
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">{t(`m.tasks.status.${task.status}` as never)}</Badge><Badge variant="outline">{t(`m.tasks.priority.${task.priority}` as never)}</Badge>{overdue ? <Badge variant="destructive">{t("m.tasks.due.overdue")}</Badge> : null}</div>
          <div className="mt-4 flex items-center justify-between text-sm"><span className="font-medium">{t("m.tasks.progress")}</span><span className="text-muted-foreground">{subtasks.length ? `${done}/${subtasks.length}` : `${progress}%`}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
          <Button className="mt-4 min-h-11 w-full" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />{t("m.tasks.edit")}</Button>
        </section>

        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList className="-mx-4 flex h-12 w-auto justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent px-4">
            {["overview", "chat", "subtasks", "files", "related"].map((tab) => <TabsTrigger key={tab} value={tab} className="min-h-11 shrink-0 rounded-lg px-3 data-[state=active]:bg-muted">{t(`m.tasks.tab.${tab}` as never)}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-5">
            <section><h2 className="text-sm font-semibold">{t("m.tasks.description")}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{task.description || t("m.tasks.noDescription")}</p></section>
            <section className="grid gap-3 border-y border-border py-4">
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{t("m.tasks.deadline")}</span><Input type="datetime-local" defaultValue={localDue} className="h-11" disabled={dueMutation.isPending} onChange={(event) => dueMutation.mutate(event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-2"><UserRound className="h-4 w-4" />{t("m.tasks.assignee")}</span><select defaultValue="" className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground" disabled={assignMutation.isPending || members.isLoading} onChange={(event) => event.target.value && assignMutation.mutate(event.target.value)}><option value="">{assignees.length ? assignees.map((item) => nameFor(item.user_id)).join(", ") : t("tops.unassigned")}</option>{(members.data ?? []).filter((member) => !assignees.some((item) => item.user_id === member.userId)).map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
            </section>
            <section><h2 className="text-sm font-semibold">{t("m.tasks.tags")}</h2><div className="mt-2 flex flex-wrap gap-2">{(task.tags ?? []).map((tag) => <Badge key={tag} variant="outline" className="min-h-8 gap-1 pl-3">{tag}<Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={t("m.tasks.removeTag")} onClick={() => tagsMutation.mutate((task.tags ?? []).filter((value) => value !== tag))}><X className="h-3 w-3" /></Button></Badge>)}</div><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const next = tagDraft.trim(); if (next && !(task.tags ?? []).includes(next)) tagsMutation.mutate([...(task.tags ?? []), next]); setTagDraft(""); }}><Input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("m.tasks.addTag")} className="h-11 min-w-0" maxLength={40} /><Button type="submit" variant="outline" className="min-h-11" disabled={!tagDraft.trim()}><Plus className="h-4 w-4" /></Button></form></section>
            <AiTaskExecutionPanel task={task as never} onChanged={() => void invalidate()} />
          </TabsContent>

          <TabsContent value="chat" className="mt-4"><TaskChatSummary taskId={id} taskTitle={task.title} /></TabsContent>

          <TabsContent value="subtasks" className="mt-4 grid gap-3">
            {subtasks.length ? subtasks.map((subtask) => <div key={subtask.id} className="flex min-h-14 items-center gap-2 border-b border-border py-2"><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ taskId: subtask.id, status: subtask.status === "done" ? "todo" : "done", rowVersion: subtask.row_version })} aria-label={t("m.tasks.toggleSubtask")}><CheckCircle2 className={subtask.status === "done" ? "h-5 w-5 text-success" : "h-5 w-5 text-muted-foreground"} /></Button><Link to="/m/tasks/$id" params={{ id: subtask.id }} className={`min-w-0 flex-1 break-words text-sm ${subtask.status === "done" ? "text-muted-foreground line-through" : ""}`}>{subtask.title}</Link></div>) : <p className="py-8 text-center text-sm text-muted-foreground">{t("m.tasks.noSubtasks")}</p>}
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (subtaskTitle.trim()) subtaskMutation.mutate(subtaskTitle.trim()); }}><Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder={t("m.tasks.addSubtask")} className="h-11 min-w-0" /><Button type="submit" className="min-h-11" disabled={!subtaskTitle.trim() || subtaskMutation.isPending}>{t("m.tasks.add")}</Button></form>
            <section className="mt-3 border-t border-border pt-4"><h2 className="text-sm font-semibold">{t("m.tasks.comments").replace("{n}", String(comments.length))}</h2><div className="mt-3 grid max-h-80 gap-4 overflow-y-auto">{comments.length ? comments.map((item) => <article key={item.id}><p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.author_name ?? t("m.taskChat.member")}</span> · {new Date(item.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p></article>) : <p className="text-sm text-muted-foreground">{t("m.tasks.noComments")}</p>}</div><form className="mt-3 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) commentMutation.mutate(comment.trim()); }}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("m.tasks.addComment")} className="min-w-0" rows={2} /><Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!comment.trim() || commentMutation.isPending} aria-label={t("m.tasks.sendComment")}><Send className="h-4 w-4" /></Button></form></section>
          </TabsContent>

          <TabsContent value="files" className="mt-4 grid gap-2">
            {attachments.length ? attachments.map((attachment) => <div key={attachment.id} className="flex min-h-14 min-w-0 items-center gap-2 border-b border-border py-2"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.file_name}</span><span className="text-xs text-muted-foreground">{formatBytes(attachment.size_bytes)}</span></span><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("m.tasks.downloadFile")} onClick={async () => window.open(await getTaskAttachmentUrl(attachment.storage_path, true), "_blank")}><Download className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-destructive" aria-label={t("m.tasks.deleteFile")} onClick={() => removeAttachment.mutate({ attachmentId: attachment.id, storagePath: attachment.storage_path })}><Trash2 className="h-4 w-4" /></Button></div>) : <p className="py-8 text-center text-sm text-muted-foreground">{t("m.tasks.noFiles")}</p>}
            <Button variant="outline" className="mt-2 min-h-11" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{t("m.tasks.addFile")}</Button><input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          </TabsContent>

          <TabsContent value="related" className="mt-4"><Button asChild variant="outline" className="mb-4 min-h-11 w-full"><Link to="/m/work-graph" search={{ task: id }}>{t("m.tasks.openGraph")}</Link></Button><RelatedWorkPanel entityType="TASK" entityId={id} className="min-w-0" collapsible={false} mobileLinks /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl"><DialogHeader><DialogTitle>{t("m.tasks.edit")}</DialogTitle></DialogHeader><div className="grid gap-3"><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("m.tasks.taskTitle")}<Input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} className="h-11" /></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("m.tasks.description")}<Textarea value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} rows={5} /></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("m.tasks.priority")}<select value={task.priority} className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground" onChange={(event) => editMutation.mutate({ priority: event.target.value as Priority })}>{["low", "normal", "high", "urgent"].map((value) => <option key={value} value={value}>{t(`m.tasks.priority.${value}` as never)}</option>)}</select></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("m.tasks.statusLabel")}<select value={task.status} className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground" onChange={(event) => statusMutation.mutate({ taskId: id, status: event.target.value as Status, rowVersion: task.row_version })}>{["todo", "in_progress", "blocked", "done", "canceled"].map((value) => <option key={value} value={value}>{t(`m.tasks.status.${value}` as never)}</option>)}</select></label></div><DialogFooter><Button className="min-h-11 w-full" disabled={!titleDraft.trim() || editMutation.isPending} onClick={() => editMutation.mutate({ title: titleDraft.trim(), description: descriptionDraft })}>{editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("m.tasks.save")}</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
