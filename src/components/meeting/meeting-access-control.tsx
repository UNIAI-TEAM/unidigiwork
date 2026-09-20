// ADR-1E-001 — chủ toạ chọn ai được vào phòng. Chỉ hiển thị cho người có quyền
// quản lý; việc ép quyền nằm ở RPC `issue_meeting_join_token`, không ở UI.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  getMeetingAccessPolicy,
  setMeetingAccessPolicy,
  type MeetingAccessPolicy,
} from "@/lib/api/meeting-rooms.functions";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

const OPTIONS: ReadonlyArray<{
  value: MeetingAccessPolicy;
  icon: typeof Globe;
  labelKey: "mtg.room.access.open" | "mtg.room.access.inviteOnly";
  descKey: "mtg.room.access.openDesc" | "mtg.room.access.inviteOnlyDesc";
}> = [
  {
    value: "tenant_open",
    icon: Globe,
    labelKey: "mtg.room.access.open",
    descKey: "mtg.room.access.openDesc",
  },
  {
    value: "invite_only",
    icon: Lock,
    labelKey: "mtg.room.access.inviteOnly",
    descKey: "mtg.room.access.inviteOnlyDesc",
  },
];

export function MeetingAccessControl({ meetingId }: { meetingId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ["meeting-access-policy", meetingId] as const;

  const policyQuery = useQuery({
    queryKey,
    queryFn: () => getMeetingAccessPolicy({ data: { meetingId } }),
    staleTime: 30_000,
  });

  const save = useMutation({
    // Cố tình KHÔNG gửi `expectedRowVersion`: trong phòng đang họp, row_version
    // của meeting bị bump liên tục bởi webhook và mỗi lần cấp vé, nên phiên bản
    // đã cache sẽ gây MEETING_VERSION_CONFLICT giả. Đây là một trường độc lập,
    // chỉ chủ toạ đổi được, last-write-wins là đúng ngữ nghĩa.
    mutationFn: (accessPolicy: MeetingAccessPolicy) =>
      setMeetingAccessPolicy({
        data: {
          meetingId,
          accessPolicy,
          idempotencyKey: `access:${meetingId}:${accessPolicy}:${Date.now()}`,
        },
      }),
    onSuccess: async () => {
      toast.success(t("mtg.room.access.saved"));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t("mtg.room.access.saveError")),
  });

  if (policyQuery.isLoading) return <Skeleton className="h-20 rounded-lg" />;
  // Không phải chủ toạ, hoặc không đọc được chính sách: không hiện gì cả.
  if (!policyQuery.data?.canManage) return null;

  const current = policyQuery.data.accessPolicy;

  return (
    <fieldset className="space-y-2" disabled={save.isPending}>
      <legend className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {t("mtg.room.access.label")}
        {save.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      </legend>
      <div className="space-y-1.5">
        {OPTIONS.map((opt) => {
          const selected = current === opt.value;
          const Icon = opt.icon;
          return (
            <label
              key={opt.value}
              className={`flex min-h-8 cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-surface-3"
              } ${save.isPending ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={`meeting-access-${meetingId}`}
                value={opt.value}
                checked={selected}
                onChange={() => {
                  if (!selected) save.mutate(opt.value);
                }}
                className="sr-only"
              />
              <Icon
                aria-hidden="true"
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  selected ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-xs font-medium ${
                    selected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t(opt.labelKey)}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {t(opt.descKey)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
