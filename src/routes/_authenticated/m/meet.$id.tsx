import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, MapPin, Users, Video } from "lucide-react";
import { getMeeting } from "@/lib/api/meetings.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">Không thể mở cuộc họp này.</p>
    );
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
          <span className="sr-only">Quay lại</span>
        </Button>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold">{meeting.title}</h1>
          <Badge variant="secondary" className="mt-2">
            {meeting.status}
          </Badge>
        </div>
      </header>
      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {new Date(meeting.start_at).toLocaleString("vi-VN")} –{" "}
            {new Date(meeting.end_at).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
        <p className="flex items-center gap-3">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span>{meeting.location || "Trực tuyến"}</span>
        </p>
        <p className="flex items-center gap-3">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span>{meeting.meeting_participants?.length ?? 0} người tham dự</span>
        </p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Nội dung cuộc họp</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
          {meeting.agenda || "Chưa có nội dung."}
        </p>
      </section>
      <Button className="min-h-11 w-full" onClick={() => void navigate({ href: `/meeting/${id}` })}>
        <Video className="mr-2 h-4 w-4" />
        Vào phòng họp
      </Button>
    </div>
  );
}
