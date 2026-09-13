import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isToday, isTomorrow } from "date-fns";
import { Search, X, Video } from "lucide-react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listMeetings } from "@/lib/api/meetings.functions";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_KEY = {
  scheduled: "mtg.status.scheduled",
  live: "mtg.status.live",
  ended: "mtg.status.ended",
  canceled: "mtg.status.canceled",
} as const;

type Filter = "all" | "scheduled" | "live" | "ended";
const FILTERS: Filter[] = ["all", "scheduled", "live", "ended"];

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
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const {
    workspaceId: selectedWorkspaceId,
    workspaces,
    ready,
    isLoading: workspacesLoading,
  } = useActiveWorkspace();
  // "Tất cả workspace" không có truy vấn gộp — dùng workspace đầu tiên như trang Họp trên desktop.
  const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id ?? null;
  const resolvingWorkspace = !ready || (workspacesLoading && !workspaceId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Đọc qua server function (RLS theo JWT người dùng), không gọi thẳng bảng từ client.
  const meetingsQuery = useQuery({
    queryKey: ["mobile-meetings", workspaceId],
    enabled: !!workspaceId,
    queryFn: () =>
      listMeetings({ data: { workspaceId: workspaceId as string, sort: "asc", limit: 200 } }),
  });

  const term = search.trim().toLowerCase();
  const filtered = (meetingsQuery.data ?? []).filter((m) => {
    const matchesSearch = !term || m.title.toLowerCase().includes(term);
    const matchesFilter =
      filter === "all" ||
      (filter === "scheduled"
        ? m.status === "scheduled" && new Date(m.start_at).getTime() > Date.now()
        : m.status === filter);
    return matchesSearch && matchesFilter;
  });

  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const formatRange = (startIso: string, endIso: string) => {
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (isToday(s)) return fmt(t("mtg.m.today"), { start: time(s), end: time(e) });
    if (isTomorrow(s)) return fmt(t("mtg.m.tomorrow"), { start: time(s) });
    return `${s.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} ${time(s)} – ${time(e)}`;
  };

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 pb-24">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("mtg.m.search")}
          aria-label={t("mtg.m.search")}
          className="h-11 pl-9 pr-11"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label={t("mtg.m.clearSearch")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label={t("mtg.m.filterLabel")}
      >
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? t("mtg.filter.all") : t(STATUS_KEY[s])}
          </button>
        ))}
      </div>

      {!resolvingWorkspace && !workspaceId ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {t("mtg.m.noWorkspace")}
        </p>
      ) : resolvingWorkspace || meetingsQuery.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : meetingsQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-foreground">{t("mtg.loadError")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void meetingsQuery.refetch()}
          >
            {t("mtg.retry")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {term || filter !== "all" ? t("mtg.m.noMatch") : t("mtg.m.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MobileListItem
              key={m.id}
              title={m.title}
              subtitle={formatRange(m.start_at, m.end_at)}
              meta={m.location ?? t("mtg.m.online")}
              icon={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Video className="h-4 w-4" />
                </span>
              }
              badge={
                m.status === "live" ? (
                  <Badge variant="destructive">{t("mtg.status.live")}</Badge>
                ) : m.status === "scheduled" ? (
                  // Đã lên lịch nhưng quá giờ: không được hiện là "Sắp diễn ra" (khớp trang Họp desktop).
                  <Badge variant="outline">
                    {t(
                      new Date(m.end_at).getTime() < Date.now()
                        ? "mtg.chip.overdue"
                        : new Date(m.start_at).getTime() <= Date.now()
                          ? "mtg.chip.late"
                          : "mtg.status.scheduled",
                    )}
                  </Badge>
                ) : null
              }
              onClick={() => void navigate({ to: "/meeting/$id", params: { id: m.id } })}
            />
          ))}
        </div>
      )}

      <MobileFAB label={t("mtg.m.create")} onClick={() => void navigate({ to: "/meeting" })} />
    </div>
  );
}
