import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listMeetingHistory } from "@/lib/api/meeting-rooms.functions";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_authenticated/m/meet_/history")({
  component: MobileMeetingHistory,
});

function MobileMeetingHistory() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const result = useQuery({
    queryKey: ["mobile-meeting-history", search.trim(), page],
    queryFn: () =>
      listMeetingHistory({
        data: { search: search.trim() || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  });
  const rows = result.data?.items ?? [];
  const total = result.data?.total ?? 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => void navigate({ to: "/m/meet" })}
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{t("mtg.room.back")}</span>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{t("mtg.home.history")}</h1>
      </header>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          className="h-11 pl-9"
          placeholder={t("mtg.m.search")}
        />
      </div>
      {result.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : result.isError ? (
        <div className="rounded-xl border border-border p-4 text-sm">
          <p>{t("mtg.loadError")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void result.refetch()}>
            {t("mtg.retry")}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          {t("mtg.h.empty")}
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((meeting) => (
            <MobileListItem
              key={meeting.id}
              title={meeting.title}
              subtitle={new Date(meeting.startAt).toLocaleString(localeTag(lang))}
              meta={`${fmt(t("mtg.dur.min"), { m: meeting.durationMinutes })} · ${fmt(t("mtg.m.participants"), { n: meeting.participantCount })}`}
              icon={<CalendarClock className="h-5 w-5" />}
              badge={
                <Badge variant="secondary">
                  {meeting.status === "canceled" ? t("mtg.status.canceled") : t("mtg.status.ended")}
                </Badge>
              }
              onClick={() => void navigate({ to: "/m/meet/$id", params: { id: meeting.id } })}
            />
          ))}
        </div>
      )}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} / {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
