// Bảng điều khiển ghi hình + thống kê phút họp cho trang chi tiết phòng họp.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Circle, Download, Loader2, Video } from "lucide-react";
import {
  getMeetingStats,
  getMeetingRecordingDownloadUrl,
  startMeetingRecording,
  stopMeetingRecording,
  type MeetingStatsDTO,
} from "@/lib/api/meeting-recordings.functions";
import { listMeetingParticipants } from "@/lib/api/meeting-rooms.functions";
import { ApiError } from "@/contracts/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

function fmtBytes(bytes: number | null) {
  if (!bytes) return null;
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const RECORDING_STATUS_KEY: Record<string, Key> = {
  starting: "mtg.rec.status.starting",
  pending: "mtg.rec.status.starting",
  recording: "mtg.rec.status.recording",
  active: "mtg.rec.status.recording",
  processing: "mtg.rec.status.processing",
  ready: "mtg.rec.status.ready",
  completed: "mtg.rec.status.ready",
  stopped: "mtg.rec.status.stopped",
  failed: "mtg.rec.status.failed",
};

export function MeetingRecordingPanel({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const qc = useQueryClient();
  const key = ["meeting-stats", meetingId];

  const { data, isLoading, isError, refetch } = useQuery<MeetingStatsDTO>({
    queryKey: key,
    queryFn: () => getMeetingStats({ data: { meetingId } }),
    refetchInterval: 15_000,
  });

  // Dùng chung cache danh sách người tham gia của trang để hiện tên thay vì mã người dùng.
  const participantsQuery = useQuery({
    queryKey: ["meeting-participants", meetingId],
    staleTime: 30_000,
    queryFn: () => listMeetingParticipants({ data: { meetingId } }),
  });
  const nameByUser = new Map(
    (participantsQuery.data ?? []).map((p) => [p.userId, p.name ?? p.email ?? null] as const),
  );

  const fmtTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })
      : "—";

  function onError(e: unknown, fallback: Key) {
    const code = e instanceof ApiError ? e.code : "";
    toast.error(t(code === "MEETING_ACCESS_DENIED" ? "mtg.rec.denied" : fallback));
  }

  const startMut = useMutation({
    mutationFn: () =>
      startMeetingRecording({ data: { meetingId, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success(t("mtg.rec.started"));
    },
    onError: (e) => onError(e, "mtg.rec.startError"),
  });

  const stopMut = useMutation({
    mutationFn: () =>
      stopMeetingRecording({ data: { meetingId, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success(t("mtg.rec.stopped"));
    },
    onError: (e) => onError(e, "mtg.rec.stopError"),
  });

  const downloadMut = useMutation({
    mutationFn: (recordingId: string) => getMeetingRecordingDownloadUrl({ data: { recordingId } }),
    onSuccess: (res) => window.open(res.url, "_blank", "noopener"),
    onError: () => toast.error(t("mtg.rec.downloadError")),
  });

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-foreground">{t("mtg.rec.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t("mtg.retry")}
        </Button>
      </div>
    );
  }

  const busy = startMut.isPending || stopMut.isPending;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold">
            <Video className="h-3.5 w-3.5" aria-hidden="true" /> {t("mtg.rec.title")}
          </h3>
          {data.is_recording && (
            <span
              role="status"
              className="flex items-center gap-1 text-[11px] font-medium text-destructive"
            >
              <Circle className="h-2 w-2 animate-pulse fill-current" aria-hidden="true" />{" "}
              {t("mtg.rec.recording")}
            </span>
          )}
        </div>
        <Button
          className="w-full"
          variant={data.is_recording ? "destructive" : "default"}
          onClick={() => (data.is_recording ? stopMut.mutate() : startMut.mutate())}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Circle />}
          {data.is_recording ? t("mtg.rec.stop") : t("mtg.rec.start")}
        </Button>
      </section>

      <dl
        aria-label={t("mtg.rec.stats")}
        className="divide-y divide-border rounded-lg border border-border text-xs"
      >
        <StatRow
          label={t("mtg.rec.stat.minutes")}
          value={fmt(t("mtg.dur.min"), { m: data.total_participant_minutes })}
        />
        <StatRow label={t("mtg.rec.stat.unique")} value={String(data.unique_participants)} />
        <StatRow label={t("mtg.rec.stat.active")} value={String(data.active_participants)} />
        <StatRow label={t("mtg.rec.stat.duration")} value={fmtDuration(data.recording_seconds)} />
      </dl>

      <section>
        <h3 className="mb-2 text-xs font-semibold">
          {fmt(t("mtg.rec.recordings"), { n: data.recording_count })}
        </h3>
        {data.recordings.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mtg.rec.noRecordings")}</p>
        ) : (
          <ul className="space-y-2">
            {data.recordings.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{fmtTime(r.started_at)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {RECORDING_STATUS_KEY[r.status] ? t(RECORDING_STATUS_KEY[r.status]!) : r.status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {fmtDuration(r.duration_seconds)}
                  {fmtBytes(r.file_size_bytes) ? ` · ${fmtBytes(r.file_size_bytes)}` : ""}
                  {` · ${r.provider}`}
                </div>
                {r.error_message && (
                  <p className="mt-1 text-[11px] text-destructive">{r.error_message}</p>
                )}
                {r.file_url && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-8 px-0"
                    onClick={() => downloadMut.mutate(r.id)}
                    disabled={downloadMut.isPending}
                  >
                    {downloadMut.isPending && downloadMut.variables === r.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {t("mtg.rec.download")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">{t("mtg.rec.attendance")}</h3>
        {data.attendance.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mtg.rec.noAttendance")}</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {data.attendance.map((a) => {
              const name = nameByUser.get(a.user_id);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {name ?? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {a.user_id.slice(0, 8)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {fmtTime(a.joined_at)} →{" "}
                    {a.left_at ? fmtTime(a.left_at) : t("mtg.rec.inProgress")}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {fmt(t("mtg.dur.min"), { m: a.minutes })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
