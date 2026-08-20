import { useQuery } from "@tanstack/react-query";
import { History, Ban, Play, Square, CalendarPlus, RefreshCw } from "lucide-react";
import { getMeetingStatusHistory } from "@/lib/api/meetings.functions";

const META: Record<string, { label: string; icon: typeof History; tone: string }> = {
  scheduled: { label: "Đã đặt lịch", icon: CalendarPlus, tone: "text-muted-foreground" },
  updated: { label: "Đã cập nhật", icon: RefreshCw, tone: "text-muted-foreground" },
  started: { label: "Đã bắt đầu", icon: Play, tone: "text-primary" },
  ended: { label: "Đã kết thúc", icon: Square, tone: "text-muted-foreground" },
  canceled: { label: "Đã hủy", icon: Ban, tone: "text-destructive" },
};

/** Lịch sử trạng thái buổi họp kèm lý do hủy. */
export function MeetingStatusHistoryPanel({ meetingId }: { meetingId: string }) {
  const q = useQuery({
    queryKey: ["meeting-status-history", meetingId],
    staleTime: 15_000,
    queryFn: () => getMeetingStatusHistory({ data: { meetingId } }),
  });

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <History className="h-3.5 w-3.5" /> Lịch sử trạng thái
      </h4>
      {q.isLoading && <p className="text-xs text-muted-foreground">Đang tải lịch sử…</p>}
      {q.isError && (
        <p className="text-xs text-muted-foreground">
          Không tải được lịch sử trạng thái hoặc bạn không có quyền xem.
        </p>
      )}
      {q.data && q.data.length === 0 && (
        <p className="text-xs text-muted-foreground">Chưa có thay đổi trạng thái nào.</p>
      )}
      <ol className="space-y-2">
        {(q.data ?? []).map((e) => {
          const meta = META[e.status] ?? {
            label: e.status,
            icon: History,
            tone: "text-muted-foreground",
          };
          const Icon = meta.icon;
          return (
            <li
              key={e.id}
              className="rounded-lg border border-border bg-surface-2 p-2 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                <span className="font-medium text-foreground">{meta.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString("vi-VN")}
                </span>
              </div>
              {e.actorName && (
                <p className="mt-1 text-[11px] text-muted-foreground">Bởi {e.actorName}</p>
              )}
              {e.status === "canceled" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Lý do hủy: {e.reason ?? "Không ghi nhận"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}