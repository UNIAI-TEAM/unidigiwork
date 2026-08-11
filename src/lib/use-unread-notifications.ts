import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "@/lib/api/notifications.functions";

/** Shared unread-notification count. Uses the ["notifications"] key so any
 *  mark-as-read mutation that invalidates it keeps the badge in sync. */
export function useUnreadNotifications() {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const rows = (query.data ?? []) as Array<{ is_read?: boolean | null }>;
  return { unreadCount: rows.filter((r) => !r.is_read).length, query };
}