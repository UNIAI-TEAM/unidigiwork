import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Video } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { getConsultationBooking } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";

export const Route = createFileRoute("/tu-van/$token")({
  head: () => ({
    meta: [
      { title: "Theo dõi yêu cầu tư vấn — UniWork" },
      { name: "description", content: "Xem trạng thái yêu cầu tư vấn và vào phòng họp online với chuyên viên UniWork." },
      { property: "og:title", content: "Theo dõi yêu cầu tư vấn — UniWork" },
      { property: "og:description", content: "Trạng thái yêu cầu và lịch hẹn tư vấn online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { token } = Route.useParams();
  const { lang } = useI18n();
  const t = mk(lang).track;
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ["consult-booking", token],
    queryFn: () => getConsultationBooking({ data: { token } }),
    refetchInterval: 30_000,
    retry: false,
  });
  const b = q.data;
  const fmt = (d: string) =>
    new Date(d).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", { dateStyle: "full", timeStyle: "short" });
  const status = !b
    ? ""
    : b.meeting_status === "canceled"
      ? t.canceled
      : b.task_status === "done"
        ? t.done
        : b.task_status === "in_progress"
          ? t.inProgress
          : t.received;

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.sub}</p>
        {q.isLoading ? (
          <div className="mt-8 h-48 animate-pulse rounded-2xl bg-muted" />
        ) : !b ? (
          <p className="mt-8 rounded-2xl border border-border p-6">{t.notFound}</p>
        ) : (
          <div className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Row label={t.service} value={b.service} />
            <Row label={t.customer} value={b.name} />
            <Row label={t.status} value={status} />
            <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
              <CalendarClock className="mt-0.5 size-5 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">{t.schedule}</div>
                <div className="font-medium">{fmt(b.start_at)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" />
              {b.assigned ? t.assigned : t.waiting}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {b.invite && b.meeting_id ? (
                <Button asChild className="h-11">
                  <Link to="/meeting/$id/guest" params={{ id: b.meeting_id }} search={{ invite: b.invite }}>
                    <Video className="mr-2 size-4" />
                    {t.join}
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  void navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                }}
              >
                {copied ? t.copied : t.copy}
              </Button>
            </div>
          </div>
        )}
        <Button asChild variant="ghost" className="mt-6 h-11">
          <Link to="/dich-vu">{t.back}</Link>
        </Button>
      </section>
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border pb-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
