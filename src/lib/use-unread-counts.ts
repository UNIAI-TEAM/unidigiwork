import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  // Realtime: tin nhắn mới, đọc kênh, và trạng thái email đổi → đồng bộ badge.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const bump = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: UNREAD_COUNTS_KEY });
      }, 300);
    };

    const channel = supabase
      .channel("unread-counts-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_states" }, bump)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    chatUnread: query.data?.chat ?? 0,
    emailUnread: query.data?.email ?? 0,
    refreshUnread: () => queryClient.invalidateQueries({ queryKey: UNREAD_COUNTS_KEY }),
    query,
  };
}
