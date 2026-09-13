import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Check, X, Send, Loader2, UserPlus } from "lucide-react";
import { resolveMeetingApi } from "@/sdk/meetings";
import type { MeetingId } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

/** Phía người xin vào: gửi yêu cầu rồi chờ chủ phòng duyệt. */
export function JoinRequestPanel({
  meetingId,
  onApproved,
}: {
  meetingId: string;
  onApproved: () => void;
}) {
  const { t, lang } = useI18n();
  const [message, setMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const qc = useQueryClient();
  const messageId = `join-request-message-${meetingId}`;

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
        toast.success(t("mtg.jr.sentApproved"));
        onApproved();
      } else {
        toast.success(t("mtg.jr.sent"));
      }
    },
    onError: () => toast.error(t("mtg.jr.sendError")),
  });

  if (isLoading) {
    return (
      <p
        role="status"
        className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("mtg.jr.checking")}
      </p>
    );
  }

  if (request?.status === "pending") {
    return (
      <div role="status" className="mt-3 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" /> {t("mtg.jr.pendingTitle")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fmt(t("mtg.jr.pendingDesc"), {
            time: new Date(request.created_at).toLocaleString(localeTag(lang)),
          })}
        </p>
        {request.message && (
          <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-foreground">
            “{request.message}”
          </p>
        )}
      </div>
    );
  }

  if (request?.status === "approved") {
    return (
      <div
        role="status"
        className="mt-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3"
      >
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-success" aria-hidden="true" /> {t("mtg.jr.approvedTitle")}
        </p>
        <Button size="sm" className="mt-2" onClick={onApproved}>
          {t("mtg.jr.enterNow")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {request?.status === "rejected" && (
        <p className="mb-2 text-xs text-foreground">
          {request.decision_note
            ? fmt(t("mtg.jr.rejectedNote"), { note: request.decision_note })
            : t("mtg.jr.rejected")}
        </p>
      )}
      {composing ? (
        <form
          className="rounded-lg border border-border bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!send.isPending) send.mutate(message.trim());
          }}
        >
          <Label htmlFor={messageId} className="text-xs">
            {t("mtg.jr.messageLabel")}
          </Label>
          <Textarea
            id={messageId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t("mtg.jr.messagePlaceholder")}
            className="mt-1.5 text-sm"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("mtg.jr.send")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setComposing(false)}>
              {t("mtg.cancelAction")}
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" onClick={() => setComposing(true)}>
          <UserPlus /> {t("mtg.jr.request")}
        </Button>
      )}
    </div>
  );
}

/** Phía chủ phòng / quản trị: duyệt hoặc từ chối yêu cầu đang chờ. */
export function JoinRequestInbox({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
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
      toast.success(v.approve ? t("mtg.jr.approvedToast") : t("mtg.jr.rejectedToast"));
      void qc.invalidateQueries({ queryKey: ["meeting-join-requests", meetingId] });
    },
    onError: () => toast.error(t("mtg.jr.decideError")),
  });

  if (!rows?.length) return null;

  return (
    <section
      aria-live="polite"
      className="mt-3 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <h2 className="text-sm font-medium">{fmt(t("mtg.jr.inboxTitle"), { n: rows.length })}</h2>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((r) => {
          const name = r.requester_name ?? r.requester_email ?? r.requester_id;
          const busy = decide.isPending && decide.variables?.id === r.id;
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.message ? `“${r.message}”` : t("mtg.jr.noMessage")} ·{" "}
                  {new Date(r.created_at).toLocaleString(localeTag(lang))}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  onClick={() => decide.mutate({ id: r.id, approve: true })}
                  disabled={decide.isPending}
                  aria-label={fmt(t("mtg.jr.approveFor"), { name })}
                >
                  {busy && decide.variables?.approve ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {t("mtg.jr.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide.mutate({ id: r.id, approve: false })}
                  disabled={decide.isPending}
                  aria-label={fmt(t("mtg.jr.rejectFor"), { name })}
                >
                  {busy && !decide.variables?.approve ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <X />
                  )}
                  {t("mtg.jr.reject")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
