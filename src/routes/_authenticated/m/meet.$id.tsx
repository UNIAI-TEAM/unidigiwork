import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, MapPin, Users, Video } from "lucide-react";
import { getMeeting } from "@/lib/api/meetings.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/i18n-interpolate";
import { localeTag, useI18n } from "@/lib/i18n";

const STATUS_KEY = {
  scheduled: "mtg.status.scheduled",
  live: "mtg.status.live",
  ended: "mtg.status.ended",
  canceled: "mtg.status.canceled",
} as const;

export const Route = createFileRoute("/_authenticated/m/meet/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết cuộc họp — UNIWORK" },
      { name: "description", content: "Thông tin và nội dung cuộc họp trên điện thoại." },
      { property: "og:title", content: "Chi tiết cuộc họp — UNIWORK" },
      { property: "og:description", content: "Thông tin và nội dung cuộc họp trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileMeetingDetail,
});

function MobileMeetingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const detail = useQuery({
    queryKey: ["m-meeting", id],
    queryFn: () => getMeeting({ data: { meetingId: id } }),
    retry: false,
  });
  if (detail.isLoading)
    return (
      <div className="p-4">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  const meeting = detail.data;
  if (!meeting)
    return <p className="p-6 text-center text-sm text-muted-foreground">{t("mtg.m.openError")}</p>;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => void navigate({ to: "/m/meet" })}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">{t("mtg.back")}</span>
        </Button>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold">{meeting.title}</h1>
          <Badge variant="secondary" className="mt-2">
            {t(STATUS_KEY[meeting.status as keyof typeof STATUS_KEY] ?? "mtg.status.scheduled")}
          </Badge>
        </div>
      </header>
      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {new Date(meeting.start_at).toLocaleString(locale)} –{" "}
            {new Date(meeting.end_at).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
        <p className="flex items-center gap-3">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span>{meeting.location || t("mtg.m.online")}</span>
        </p>
        <p className="flex items-center gap-3">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span>
            {fmt(t("mtg.m.participants"), { n: meeting.meeting_participants?.length ?? 0 })}
          </span>
        </p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("mtg.m.detailAgenda")}</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
          {meeting.agenda || t("mtg.m.noAgenda")}
        </p>
      </section>
      <Button
        className="min-h-11 w-full"
        onClick={() => void navigate({ to: "/m/meet/$id/room", params: { id } })}
      >
        <Video className="mr-2 h-4 w-4" />
        {t("mtg.m.join")}
      </Button>
    </div>
  );
}
