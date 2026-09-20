// Khách ngoài đang có mặt trong phòng, dành cho chủ toạ.
//
// Khách không nằm trong `meeting_participants` nên không hiện ở danh sách
// chính; panel này là chỗ duy nhất chủ toạ thấy được ai từ ngoài đã vào và
// mời họ ra.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserX } from "lucide-react";
import { listMeetingGuests, revokeMeetingGuest } from "@/lib/api/meeting-rooms.functions";
import { Button } from "@/components/ui/button";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

export function MeetingGuestsPanel({
  meetingId,
  canManage,
}: {
  meetingId: string;
  canManage: boolean;
}) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const qc = useQueryClient();

  const guestsQuery = useQuery({
    queryKey: ["meeting-guests", meetingId],
    queryFn: () => listMeetingGuests({ data: { meetingId } }),
    // Khách vào bằng link nên không có sự kiện realtime nào báo; poll nhẹ.
    refetchInterval: 20_000,
    // Người không phải chủ toạ gọi sẽ bị RPC từ chối — đừng gọi ngay từ đầu.
    enabled: canManage,
  });

  const revoke = useMutation({
    mutationFn: (guestId: string) => revokeMeetingGuest({ data: { guestId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meeting-guests", meetingId] });
      toast.success(t("mtg.guest.revoked"));
    },
    onError: () => toast.error(t("mtg.guest.revokeError")),
  });

  if (!canManage) return null;

  const guests = guestsQuery.data ?? [];
  const active = guests.filter((g) => !g.revokedAt);
  if (guestsQuery.isLoading || guests.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold">
        {fmt(t("mtg.guest.count"), { n: active.length })}
      </h3>
      <ul className="space-y-1.5 text-xs">
        {guests.map((g) => (
          <li key={g.guestId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {g.displayName}
              <span className="ml-1 text-muted-foreground">· {t("mtg.guest.badge")}</span>
              {g.revokedAt && (
                <span className="ml-1 text-destructive">· {t("mtg.guest.err.revoked")}</span>
              )}
            </span>
            {g.lastSeenAt && !g.revokedAt && (
              <span className="shrink-0 text-muted-foreground">
                {new Date(g.lastSeenAt).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {!g.revokedAt && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                disabled={revoke.isPending}
                aria-label={`${t("mtg.guest.revoke")}: ${g.displayName}`}
                title={t("mtg.guest.revoke")}
                onClick={() => revoke.mutate(g.guestId)}
              >
                {revoke.isPending && revoke.variables === g.guestId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserX className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
