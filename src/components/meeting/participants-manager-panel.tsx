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

const RSVP_LABELS: Record<string, string> = {
  pending: "Chờ phản hồi",
  accepted: "Tham dự",
  declined: "Từ chối",
  tentative: "Có thể",
};

export function MeetingParticipantsManagerPanel({ meetingId }: { meetingId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

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
      if (res.status === "invited") toast.success(`Đã mời ${res.email}`);
      else if (res.status === "already") toast.info("Người này đã có trong danh sách.");
      else toast.error("Không tìm thấy người dùng với email này.");
      setEmail("");
      await refresh();
    },
    onError: (e: unknown) =>
      toast.error(
        String((e as Error)?.message ?? "").includes("MEETING_ACCESS_DENIED")
          ? "Bạn không có quyền mời người tham dự."
          : "Không mời được. Vui lòng thử lại.",
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMeetingParticipant({
        data: { meetingId, userId, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      toast.success("Đã loại khỏi buổi họp.");
      await refresh();
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message ?? "");
      toast.error(
        msg.includes("MEETING_LAST_HOST")
          ? "Không thể loại người chủ trì duy nhất."
          : msg.includes("MEETING_ACCESS_DENIED")
            ? "Bạn không có quyền loại người tham dự."
            : "Không loại được. Vui lòng thử lại.",
      );
    },
  });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface text-left">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Quản lý người tham dự
          </h3>
          <p className="text-xs text-muted-foreground">
            {canManage
              ? "Bạn có quyền mời thêm và loại bỏ người tham dự."
              : "Bạn chỉ có quyền xem danh sách người tham dự."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {(["accepted", "tentative", "declined", "pending"] as const).map((v) => (
            <span
              key={v}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted-foreground"
            >
              {RSVP_LABELS[v]}:{" "}
              <span className="font-medium text-foreground">
                {participants.filter((p) => p.rsvp === v).length}
              </span>
            </span>
          ))}
        </div>
      </header>

      {canManage ? (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (!value) return;
            inviteMutation.mutate(value);
          }}
        >
          <div className="relative min-w-[220px] flex-1">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email người cần mời"
              className="w-full rounded-md border border-border bg-surface py-2 pl-8 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={inviteMutation.isPending || email.trim().length === 0}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {inviteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            Mời tham dự
          </button>
        </form>
      ) : (
        <p className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Chỉ chủ trì hoặc quản trị tổ chức mới được mời và
          loại bỏ người tham dự.
        </p>
      )}

      {participantsQuery.isLoading ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">Đang tải danh sách…</p>
      ) : participants.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">Chưa có người tham dự nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Người tham dự</th>
                <th className="px-4 py-2 font-medium">Vai trò</th>
                <th className="px-4 py-2 font-medium">RSVP</th>
                <th className="px-4 py-2 font-medium">Được mời lúc</th>
                {canManage && <th className="px-4 py-2 text-right font-medium">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.userId} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">
                      {p.name ?? p.email ?? "Thành viên"}
                    </div>
                    {p.email && <div className="text-[11px] text-muted-foreground">{p.email}</div>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.role === "host" || p.role === "organizer" ? "Chủ trì" : "Tham dự"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {RSVP_LABELS[p.rsvp] ?? p.rsvp}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.invitedAt ? new Date(p.invitedAt).toLocaleString("vi-VN") : "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      {p.userId === myUserId ? (
                        <span className="text-[11px] text-muted-foreground">Bạn</span>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              disabled={removeMutation.isPending}
                              title="Loại khỏi buổi họp"
                              className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Loại khỏi buổi họp?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {p.name ?? p.email} sẽ không còn trong danh sách tham dự và mất
                                quyền vào phòng họp này.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Hủy</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeMutation.mutate(p.userId)}>
                                Loại bỏ
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
