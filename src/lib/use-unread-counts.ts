import { useQuery } from "@tanstack/react-query";
import { getUnreadCounts } from "@/lib/api/unread-counts.functions";

/** Badge counts cho tab Chat và Email. */
export function useUnreadCounts() {
  const query = useQuery({
    queryKey: ["unread-counts"],
    queryFn: () => getUnreadCounts(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  return {
    chatUnread: query.data?.chat ?? 0,
    emailUnread: query.data?.email ?? 0,
    query,
  };
}
