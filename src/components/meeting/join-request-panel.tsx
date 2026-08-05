import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Check, X, Send, Loader2, UserPlus } from "lucide-react";
import { resolveMeetingApi } from "@/sdk/meetings";
import type { MeetingId } from "@/contracts";

/** Phía người xin vào: gửi yêu cầu rồi chờ chủ phòng duyệt. */
export function JoinRequestPanel({
  meetingId,
  onApproved,
}: {
  meetingId: string;
  onApproved: () => void;
}) {
  const [message, setMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const qc = useQueryClient();

  const { data: request, isLoading } = useQuery({
    queryKey: ["meeting-join-request", meetingId],
    queryFn: () => resolveMeetingApi().getMyJoinRequest(meetingId as MeetingId),
    // Đang chờ duyệt thì poll để tự chuyển trạng thái khi được cấp quyền.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 8000 : false),
    refetchOnWindowFocus: true,
  });

  const send = useMutation({
    mutationFn: (msg: string) => resolveMeetingApi().requestJoin(meetingId as MeetingId, msg),
    onSuccess: (res) => {
      setComposing(false);
      setMessage("");
      void qc.invalidateQueries({ queryKey: ["meeting-join-request", meetingId] });
      if (res.status === "approved") {
        toast.success("Bạn đã có quyền vào phòng.");
        onApproved();
      } else {
        toast.success("Đã gửi yêu cầu — đang chờ chủ phòng duyệt.");
      }
    },
    onError: () => toast.error("Không gửi được yêu cầu tham gia. Vui lòng thử lại."),
  });

  if (isLoading) {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra yêu cầu tham gia…
      </p>
    );
  }

  if (request?.status === "pending") {
    return (
      <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 animate-pulse" /> Đang chờ chủ phòng duyệt yêu cầu
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Yêu cầu gửi lúc {new Date(request.created_at).toLocaleString("vi-VN")}. Trang sẽ tự cập
          nhật ngay khi bạn được cấp quyền — không cần tải lại.
        </p>
        {request.message && (
          <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground">
            “{request.message}”
          </p>
        )}
      </div>
    );
  }

  if (request?.status === "approved") {
    return (
      <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-success" /> Yêu cầu đã được duyệt
        </p>
        <button
          onClick={onApproved}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Vào phòng ngay
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {request?.status === "rejected" && (
        <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Yêu cầu trước đó đã bị từ chối
          {request.decision_note ? `: ${request.decision_note}` : "."} Bạn có thể gửi lại.
        </p>
      )}
      {composing ? (
        <div className="rounded-lg border border-border bg-surface p-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Lời nhắn gửi chủ phòng (tùy chọn)…"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-2 text-xs outline-none focus:border-primary"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => send.mutate(message)}
              disabled={send.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {send.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Gửi yêu cầu
            </button>
            <button
              onClick={() => setComposing(false)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="h-3.5 w-3.5" /> Yêu cầu mời vào phòng
        </button>
      )}
    </div>
  );
}

/** Phía chủ phòng / quản trị: duyệt hoặc từ chối yêu cầu đang chờ. */
export function JoinRequestInbox({ meetingId }: { meetingId: string }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["meeting-join-requests", meetingId],
    queryFn: () => resolveMeetingApi().listJoinRequests(meetingId as MeetingId),
    refetchInterval: 15000,
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      resolveMeetingApi().decideJoinRequest(v.id, v.approve),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Đã duyệt yêu cầu tham gia." : "Đã từ chối yêu cầu.");
      void qc.invalidateQueries({ queryKey: ["meeting-join-requests", meetingId] });
    },
    onError: () => toast.error("Không xử lý được yêu cầu."),
  });

  if (!rows?.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium">Yêu cầu tham gia đang chờ ({rows.length})</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {r.requester_name ?? r.requester_email ?? r.requester_id}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {r.message ? `“${r.message}”` : "Không có lời nhắn"} ·{" "}
                {new Date(r.created_at).toLocaleString("vi-VN")}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => decide.mutate({ id: r.id, approve: true })}
                disabled={decide.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Duyệt
              </button>
              <button
                onClick={() => decide.mutate({ id: r.id, approve: false })}
                disabled={decide.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Từ chối
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
