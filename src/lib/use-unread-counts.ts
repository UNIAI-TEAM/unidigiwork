import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { getUnreadCounts } from "@/lib/api/unread-counts.functions";

export const UNREAD_COUNTS_KEY = ["unread-counts"] as const;

/** Badge counts cho tab Chat và Email. */
export function useUnreadCounts() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: UNREAD_COUNTS_KEY,
    queryFn: () => getUnreadCounts(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  return {
    chatUnread: query.data?.chat ?? 0,
    emailUnread: query.data?.email ?? 0,
    refreshUnread: () => queryClient.invalidateQueries({ queryKey: UNREAD_COUNTS_KEY }),
    query,
  };
}
