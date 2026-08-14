import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

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

  const { data: tasks } = useSuspenseQuery({
    queryKey: ["mobile-tasks", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, tags")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
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
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label="Xóa"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all", "todo", "in_progress", "blocked", "done"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
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
              meta={t.due_at ? `Hạn: ${new Date(t.due_at).toLocaleDateString("vi-VN")}` : "Không hạn"}
              priorityBar={t.priority}
              badge={
                t.status === "done" ? (
                  <Badge variant="secondary">Xong</Badge>
                ) : t.status === "blocked" ? (
                  <Badge variant="destructive">Bị chặn</Badge>
                ) : null
              }
              onClick={() => navigate({ to: "/tasks" as any })}
            />
          ))}
        </div>
      )}

      <MobileFAB label="Tạo công việc" to="/tasks" />
    </div>
  );
}
