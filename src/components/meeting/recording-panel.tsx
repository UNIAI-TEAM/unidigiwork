// Bảng điều khiển ghi hình + thống kê phút họp cho trang chi tiết phòng họp.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Circle, Loader2, Download, Timer, Users, Video } from "lucide-react";
import {
  getMeetingStats,
  getMeetingRecordingDownloadUrl,
  startMeetingRecording,
  stopMeetingRecording,
  type MeetingStatsDTO,
} from "@/lib/api/meeting-recordings.functions";
import { ApiError } from "@/contracts/errors";

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${m}m ${String(sec).padStart(2, "0")}s`;
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

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function MeetingRecordingPanel({ meetingId }: { meetingId: string }) {
  const qc = useQueryClient();
  const key = ["meeting-stats", meetingId];

  const { data, isLoading, error } = useQuery<MeetingStatsDTO>({
    queryKey: key,
    queryFn: () => getMeetingStats({ data: { meetingId } }),
    refetchInterval: 15_000,
  });

  function onError(e: unknown, fallback: string) {
    const code = e instanceof ApiError ? e.code : "";
    toast.error(
      code === "MEETING_ACCESS_DENIED"
        ? "Chỉ người chủ trì hoặc điều hành mới bật/tắt được ghi hình."
        : fallback,
    );
  }

  const startMut = useMutation({
    mutationFn: () =>
      startMeetingRecording({ data: { meetingId, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Đã bắt đầu ghi hình cuộc họp.");
    },
    onError: (e) => onError(e, "Không bắt đầu được ghi hình."),
  });

  const stopMut = useMutation({
    mutationFn: () =>
      stopMeetingRecording({ data: { meetingId, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Đã dừng ghi hình và lưu thống kê.");
    },
    onError: (e) => onError(e, "Không dừng được ghi hình."),
  });

  const downloadMut = useMutation({
    mutationFn: (recordingId: string) => getMeetingRecordingDownloadUrl({ data: { recordingId } }),
    onSuccess: (res) => window.open(res.url, "_blank", "noopener"),
    onError: () => toast.error("Bản ghi chưa sẵn sàng để tải."),
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải thống kê cuộc họp…
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        Chưa xem được thống kê cuộc họp này.
      </p>
    );
  }

  const busy = startMut.isPending || stopMut.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Video className="h-3.5 w-3.5" /> Ghi hình
          </span>
          {data.is_recording && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-destructive">
              <Circle className="h-2 w-2 animate-pulse fill-current" /> ĐANG GHI
            </span>
          )}
        </div>
        <button
          onClick={() => (data.is_recording ? stopMut.mutate() : startMut.mutate())}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60 ${
            data.is_recording
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Circle className="h-3.5 w-3.5" />}
          {data.is_recording ? "Dừng ghi hình" : "Bắt đầu ghi hình"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat icon={Timer} label="Tổng phút tham dự" value={`${data.total_participant_minutes} phút`} />
        <Stat icon={Users} label="Người tham dự" value={`${data.unique_participants}`} />
        <Stat icon={Users} label="Đang trong phòng" value={`${data.active_participants}`} />
        <Stat icon={Video} label="Thời lượng ghi" value={fmtDuration(data.recording_seconds)} />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Bản ghi ({data.recording_count})
        </div>
        {data.recordings.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có bản ghi nào cho cuộc họp này.</p>
        ) : (
          <ul className="space-y-2">
            {data.recordings.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{fmtTime(r.started_at)}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{r.status}</span>
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
                  <button
                    type="button"
                    onClick={() => downloadMut.mutate(r.id)}
                    disabled={downloadMut.isPending}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-60"
                  >
                    {downloadMut.isPending && downloadMut.variables === r.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    Tải bản ghi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Phiên tham dự
        </div>
        {data.attendance.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa ghi nhận phiên tham dự nào.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {data.attendance.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {a.user_id.slice(0, 8)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtTime(a.joined_at)} → {a.left_at ? fmtTime(a.left_at) : "đang họp"}
                </span>
                <span className="font-medium">{a.minutes}p</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
