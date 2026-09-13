// Màn quản lý người tham dự theo phân quyền: xem danh sách, mời thêm, loại bỏ.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { listMeetingParticipants } from "@/lib/api/meeting-rooms.functions";
import {
  getMeetingAccessControl,
  inviteMeetingParticipant,
  removeMeetingParticipant,
} from "@/lib/api/meetings.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

const RSVP_KEY: Record<string, Key> = {
  pending: "mtg.rsvp.pending",
  accepted: "mtg.rsvp.accepted",
  declined: "mtg.rsvp.declined",
  tentative: "mtg.rsvp.tentative",
};
const RSVP_ORDER = ["accepted", "tentative", "declined", "pending"] as const;

export function MeetingParticipantsManagerPanel({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const titleId = `participants-manager-${meetingId}`;

  const accessQuery = useQuery({
    queryKey: ["meeting-access", meetingId],
    staleTime: 60_000,
    queryFn: () => getMeetingAccessControl({ data: { meetingId } }),
  });
  const canManage = accessQuery.data?.canManage === true;
  const myUserId = accessQuery.data?.userId ?? null;

  const participantsQuery = useQuery({
    queryKey: ["meeting-participants", meetingId],
    staleTime: 30_000,
    queryFn: () => listMeetingParticipants({ data: { meetingId } }),
  });
  const participants = participantsQuery.data ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["meeting-participants", meetingId] });

  const inviteMutation = useMutation({
    mutationFn: (value: string) =>
      inviteMeetingParticipant({
        data: { meetingId, email: value, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async (res) => {
      if (res.status === "invited") {
        toast.success(fmt(t("mtg.pm.invited"), { email: res.email }));
        setEmail("");
      } else if (res.status === "already") {
        toast.info(t("mtg.pm.already"));
        setEmail("");
      } else {
        // Giữ nguyên email để người dùng sửa lỗi gõ.
        toast.error(t("mtg.pm.notFound"));
      }
      await refresh();
    },
    onError: (e: unknown) =>
      toast.error(
        t(
          String((e as Error)?.message ?? "").includes("MEETING_ACCESS_DENIED")
            ? "mtg.pm.inviteDenied"
            : "mtg.pm.inviteError",
        ),
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMeetingParticipant({
        data: { meetingId, userId, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      toast.success(t("mtg.pm.removed"));
      await refresh();
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message ?? "");
      toast.error(
        t(
          msg.includes("MEETING_LAST_HOST")
            ? "mtg.pm.lastHost"
            : msg.includes("MEETING_ACCESS_DENIED")
              ? "mtg.pm.removeDenied"
              : "mtg.pm.removeError",
        ),
      );
    },
  });

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-xl border border-border bg-surface text-left"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" aria-hidden="true" /> {t("mtg.pm.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {accessQuery.isLoading
              ? t("mtg.loading")
              : canManage
                ? t("mtg.pm.canManage")
                : t("mtg.pm.viewOnly")}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5 text-[11px]" aria-label={t("mtg.pm.rsvpSummary")}>
          {RSVP_ORDER.map((v) => (
            <li
              key={v}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted-foreground"
            >
              {t(RSVP_KEY[v]!)}:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {participants.filter((p) => p.rsvp === v).length}
              </span>
            </li>
          ))}
        </ul>
      </header>

      {canManage ? (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (!value || inviteMutation.isPending) return;
            inviteMutation.mutate(value);
          }}
        >
          <div className="relative min-w-0 flex-1 basis-56">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("mtg.pm.emailLabel")}
              aria-label={t("mtg.pm.emailLabel")}
              className="bg-surface pl-8"
            />
          </div>
          <Button type="submit" disabled={inviteMutation.isPending || email.trim().length === 0}>
            {inviteMutation.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t("mtg.pm.invite")}
          </Button>
        </form>
      ) : accessQuery.isLoading ? null : (
        <p className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t("mtg.pm.onlyHost")}
        </p>
      )}

      {participantsQuery.isLoading ? (
        <div className="space-y-2 px-4 py-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 rounded-md" />
          ))}
        </div>
      ) : participantsQuery.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <p className="text-xs text-foreground">{t("mtg.pm.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => void participantsQuery.refetch()}>
            {t("mtg.retry")}
          </Button>
        </div>
      ) : participants.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">{t("mtg.pm.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("mtg.pm.col.person")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("mtg.pm.col.role")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("mtg.pm.col.rsvp")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("mtg.pm.col.invited")}
                </th>
                {canManage && (
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t("mtg.pm.col.actions")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const name = p.name ?? p.email ?? t("mtg.room.member");
                return (
                  <tr key={p.userId} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{name}</div>
                      {p.email && (
                        <div className="text-[11px] text-muted-foreground">{p.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.role === "host" || p.role === "organizer"
                        ? t("mtg.room.host")
                        : t("mtg.pm.role.attendee")}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {RSVP_KEY[p.rsvp] ? t(RSVP_KEY[p.rsvp]!) : p.rsvp}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {p.invitedAt ? new Date(p.invitedAt).toLocaleString(locale) : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        {p.userId === myUserId ? (
                          <span className="text-[11px] text-muted-foreground">
                            {t("mtg.room.you")}
                          </span>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                disabled={removeMutation.isPending}
                                aria-label={fmt(t("mtg.pm.remove.label"), { name })}
                                title={fmt(t("mtg.pm.remove.label"), { name })}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("mtg.pm.remove.title")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {fmt(t("mtg.pm.remove.desc"), { name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("mtg.cancelAction")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeMutation.mutate(p.userId)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t("mtg.pm.remove.confirm")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
