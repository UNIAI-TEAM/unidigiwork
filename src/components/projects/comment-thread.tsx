// Luồng thảo luận dùng chung cho ghi chú dự án và từng công việc.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addProjectComment,
  addTaskComment,
  listProjectComments,
  listTaskComments,
} from "@/lib/api/projects.functions";

type Props =
  | { kind: "project"; projectId: string; compact?: boolean }
  | { kind: "task"; taskId: string; compact?: boolean };

export function CommentThread(props: Props) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const isProject = props.kind === "project";
  const queryKey = isProject
    ? ["project-comments", props.projectId]
    : ["task-comments", props.taskId];

  const query = useQuery({
    queryKey,
    queryFn: () =>
      isProject
        ? listProjectComments({ data: { projectId: props.projectId } })
        : listTaskComments({ data: { taskId: props.taskId } }),
  });

  const send = useMutation({
    mutationFn: async () =>
      isProject
        ? addProjectComment({ data: { projectId: props.projectId, body } })
        : addTaskComment({ data: { taskId: props.taskId, body } }),
    onSuccess: () => {
      setBody("");
      toast.success("Đã gửi bình luận");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) =>
      toast.error((e as { message?: string })?.message ?? "Không gửi được bình luận"),
  });

  const items = query.data ?? [];

  return (
    <div className="space-y-3">
      {query.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bình luận…
        </p>
      )}
      {!query.isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p>
      )}
      {items.length > 0 && (
        <ul className={`space-y-2 overflow-y-auto pr-1 ${props.compact ? "max-h-56" : "max-h-80"}`}>
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-background p-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{c.authorName}</span>
                <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {new Date(c.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        rows={props.compact ? 2 : 3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Viết bình luận để thảo luận với đồng đội…"
      />
      <Button
        className="min-h-11 w-full"
        disabled={!body.trim() || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-1.5 h-4 w-4" />
        )}
        Gửi bình luận
      </Button>
    </div>
  );
}

export function CommentCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MessageSquare className="h-3 w-3" />
      {count}
    </span>
  );
}
