import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCog, ChevronLeft, Search, Users } from "lucide-react";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listTenantMeetings } from "@/lib/api/meetings-admin.functions";
import { fmt } from "@/lib/i18n-interpolate";
import { localeTag, useI18n } from "@/lib/i18n";

const STATUS_KEY = {
  scheduled: "mtg.status.scheduled",
  live: "mtg.status.live",
  ended: "mtg.status.ended",
  canceled: "mtg.status.canceled",
} as const;

export const Route = createFileRoute("/_authenticated/m/meetings-manage")({
  component: MobileMeetingsManage,
});

function MobileMeetingsManage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { workspaceId: selectedWorkspaceId, workspaces } = useActiveWorkspace();
  const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id ?? "";
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["mobile-meetings-manage", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listTenantMeetings({ data: { workspaceId, limit: 200 } }),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((meeting) =>
      `${meeting.title} ${meeting.department ?? ""} ${meeting.projectName ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [query.data, search]);

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
          <span className="sr-only">{t("mtg.back")}</span>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{t("mtg.m.manage")}</h1>
          <p className="truncate text-xs text-muted-foreground">{t("mtg.m.manageDesc")}</p>
        </div>
      </header>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 pl-9"
          placeholder={t("mtg.m.manageSearch")}
        />
      </div>
      {!workspaceId ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {t("m.doc.noWorkspace")}
        </p>
      ) : query.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border p-4 text-sm">
          <p>{query.error instanceof Error ? query.error.message : t("mtg.loadError")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void query.refetch()}>
            {t("mtg.retry")}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("mtg.m.noMatch")}
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((meeting) => (
            <MobileListItem
              key={meeting.id}
              title={meeting.title}
              subtitle={new Date(meeting.startAt).toLocaleString(localeTag(lang))}
              meta={[
                meeting.department,
                meeting.projectName,
                fmt(t("mtg.m.participants"), { n: meeting.participants.length }),
              ]
                .filter(Boolean)
                .join(" · ")}
              icon={<CalendarCog className="h-5 w-5" />}
              badge={
                <Badge variant="outline">
                  {t(
                    STATUS_KEY[meeting.status as keyof typeof STATUS_KEY] ?? "mtg.status.scheduled",
                  )}
                </Badge>
              }
              onClick={() => void navigate({ to: "/m/meet/$id", params: { id: meeting.id } })}
            />
          ))}
        </div>
      )}
      {rows.length > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-4 w-4" />
          {fmt(t("mtg.m.count"), { n: rows.length })}
        </p>
      ) : null}
    </div>
  );
}
