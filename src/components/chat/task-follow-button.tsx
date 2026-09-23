// Nút đăng ký theo dõi công việc ngay trong phòng chat của công việc đó.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTaskFollowState, toggleTaskFollow } from "@/lib/api/tasks.functions";
import { useI18n } from "@/lib/i18n";

export function TaskFollowButton({ taskId, className }: { taskId: string; className?: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const stateFn = useServerFn(getTaskFollowState);
  const toggleFn = useServerFn(toggleTaskFollow);

  const state = useQuery({
    queryKey: ["task-follow-state", taskId],
    queryFn: () => stateFn({ data: { taskId } }),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: (follow: boolean) => toggleFn({ data: { taskId, follow } }),
    onSuccess: (result) => {
      toast.success(t(result.following ? "m.chat.follow.on" : "m.chat.follow.off"));
      void queryClient.invalidateQueries({ queryKey: ["task-follow-state", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["m-task-follow", taskId] });
    },
    onError: () => toast.error(t("m.chat.follow.error")),
  });

  const following = state.data?.following ?? false;
  const count = state.data?.followerCount ?? 0;

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "outline"}
      className={`min-h-11 gap-2 rounded-full px-3 text-sm ${className ?? ""}`}
      disabled={state.isLoading || toggle.isPending}
      aria-pressed={following}
      onClick={() => toggle.mutate(!following)}
    >
      {toggle.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {t(following ? "m.chat.follow.unsubscribe" : "m.chat.follow.subscribe")}
      {count > 0 ? <span className="text-xs text-muted-foreground">{count}</span> : null}
    </Button>
  );
}
