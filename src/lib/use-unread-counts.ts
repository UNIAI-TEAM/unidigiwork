import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUnreadCounts } from "@/lib/api/unread-counts.functions";

export const UNREAD_COUNTS_KEY = ["unread-counts"] as const;

const STORAGE_KEY = "uniwork.unread-counts";

type UnreadCounts = { chat: number; email: number };

function readCache(): UnreadCounts | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<UnreadCounts>;
    if (typeof parsed?.chat !== "number" || typeof parsed?.email !== "number") return undefined;
    return { chat: parsed.chat, email: parsed.email };
  } catch {
    return undefined;
  }
}

function writeCache(value: UnreadCounts) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota/private mode: bỏ qua */
  }
}

/** Badge counts cho tab Chat và Email. */
export function useUnreadCounts() {
  const queryClient = useQueryClient();
  // Hydrate an toàn: chỉ đọc localStorage sau khi mount để tránh lệch SSR.
  const [cached, setCached] = useState<UnreadCounts | undefined>(undefined);
  useEffect(() => {
    setCached(readCache());
  }, []);

  const query = useQuery({
    queryKey: UNREAD_COUNTS_KEY,
    queryFn: () => getUnreadCounts(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  // Lưu lại kết quả mới nhất để lần tải trang sau badge vẫn đúng.
  useEffect(() => {
    if (query.data) {
      writeCache({ chat: query.data.chat ?? 0, email: query.data.email ?? 0 });
    }
  }, [query.data]);

  // PERF-001: chỉ subscribe theo phạm vi user (không nghe toàn bảng chat_messages).
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const bump = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: UNREAD_COUNTS_KEY });
      }, 300);
    };

    const channel = supabase
      .channel(`unread:user:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_members", filter: `user_id=eq.${userId}` },
        bump,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_states", filter: `user_id=eq.${userId}` },
        bump,
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return {
    chatUnread: query.data?.chat ?? cached?.chat ?? 0,
    emailUnread: query.data?.email ?? cached?.email ?? 0,
    refreshUnread: () => queryClient.invalidateQueries({ queryKey: UNREAD_COUNTS_KEY }),
    query,
  };
}
