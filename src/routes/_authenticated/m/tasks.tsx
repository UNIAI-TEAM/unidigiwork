import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { createTask, listTasks } from "@/lib/api/tasks.functions";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";

const statusLabel: Record<string, string> = {
  todo: "Chưa làm",
  in_progress: "Đang làm",
  blocked: "Bị chặn",
  done: "Hoàn tất",
  canceled: "Đã hủy",
};

const priorityLabel: Record<string, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
};

export const Route = createFileRoute("/_authenticated/m/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · UNIWORK" },
      { name: "description", content: "Quản lý công việc trên UNIWORK mobile." },
      { property: "og:title", content: "Tasks · UNIWORK" },
      { property: "og:description", content: "Quản lý công việc trên UNIWORK mobile." },
    ],
  }),
  component: MobileTasksPage,
});

function MobileTasksPage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const { data: tasks } = useQuery({
    queryKey: ["mobile-tasks", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      return listTasks({ data: { workspaceId, limit: 200 } });
    },
    enabled: Boolean(workspaceId),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          workspaceId: workspaceId as string,
          title: title.trim(),
          description: description.trim() || undefined,
          priority: "normal",
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-tasks", workspaceId] });
      setTitle("");
      setDescription("");
      setCreateOpen(false);
      toast.success("Đã tạo công việc");
    },
    onError: () => toast.error("Không thể tạo công việc"),
  });

  const filtered = (tasks ?? []).filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || t.status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 pb-24">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm công việc..."
          className="h-11 pl-9 pr-11"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground"
            aria-label="Xóa"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {["all", "todo", "in_progress", "blocked", "done"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm font-medium ${
              status === s
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-muted-foreground"
            }`}
          >
            {s === "all" ? "Tất cả" : statusLabel[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {search || status !== "all" ? "Không tìm thấy công việc." : "Chưa có công việc nào."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <MobileListItem
              key={t.id}
              title={t.title}
              subtitle={`${statusLabel[t.status]} · ${priorityLabel[t.priority]}`}
              meta={
                t.due_at ? `Hạn: ${new Date(t.due_at).toLocaleDateString("vi-VN")}` : "Không hạn"
              }
              priorityBar={t.priority}
              badge={
                t.status === "done" ? (
                  <Badge variant="secondary">Xong</Badge>
                ) : t.status === "blocked" ? (
                  <Badge variant="destructive">Bị chặn</Badge>
                ) : null
              }
              onClick={() => navigate({ to: "/m/tasks/$id", params: { id: t.id } })}
            />
          ))}
        </div>
      )}

      <MobileFAB label="Tạo công việc" onClick={() => setCreateOpen(true)} />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tạo công việc</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Tên công việc"
              className="h-11"
              autoFocus
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Mô tả"
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button
              className="min-h-11"
              disabled={!workspaceId || !title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Tạo công việc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
