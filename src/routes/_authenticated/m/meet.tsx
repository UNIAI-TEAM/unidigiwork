import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, Video } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Meeting = Database["public"]["Tables"]["meetings"]["Row"];

const statusLabel: Record<string, string> = {
  scheduled: "Sắp diễn ra",
  live: "Đang diễn ra",
  ended: "Đã kết thúc",
  canceled: "Đã hủy",
};

export const Route = createFileRoute("/_authenticated/m/meet")({
  head: () => ({
    meta: [
      { title: "Meet · UNIWORK" },
      { name: "description", content: "Quản lý cuộc họp trên UNIWORK mobile." },
      { property: "og:title", content: "Meet · UNIWORK" },
      { property: "og:description", content: "Quản lý cuộc họp trên UNIWORK mobile." },
    ],
  }),
  component: MobileMeetPage,
});

function MobileMeetPage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: meetings } = useSuspenseQuery({
    queryKey: ["mobile-meetings", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("meetings")
        .select("id, title, start_at, end_at, status, location")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("start_at", { ascending: true });
      return data ?? [];
    },
  });

  const filtered = (meetings ?? []).filter((m) => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || m.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 pb-24">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm cuộc họp..."
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
        {["all", "scheduled", "live", "ended"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              filter === s
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
          {search || filter !== "all" ? "Không tìm thấy cuộc họp." : "Chưa có cuộc họp nào."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MobileListItem
              key={m.id}
              title={m.title}
              subtitle={formatDateRange(m.start_at, m.end_at)}
              meta={m.location ?? "Họp trực tuyến"}
              icon={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Video className="h-4 w-4" />
                </span>
              }
              badge={
                m.status === "live" ? (
                  <Badge variant="default">Đang diễn ra</Badge>
                ) : m.status === "scheduled" ? (
                  <Badge variant="outline">{statusLabel[m.status]}</Badge>
                ) : null
              }
              onClick={() => navigate({ to: `/meetings` as any })}
            />
          ))}
        </div>
      )}

      <MobileFAB label="Tạo cuộc họp" to="/meetings" />
    </div>
  );
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (isToday(s)) return `Hôm nay, ${format(s, "HH:mm", { locale: vi })} - ${format(e, "HH:mm", { locale: vi })}`;
  if (isTomorrow(s)) return `Ngày mai, ${format(s, "HH:mm", { locale: vi })}`;
  return `${format(s, "dd/MM HH:mm", { locale: vi })} - ${format(e, "HH:mm", { locale: vi })}`;
}
