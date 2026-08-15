import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Số tin nhắn chat & email chưa đọc của người dùng hiện tại (dùng cho badge).
 * PERF-002: gộp về 1 RPC (trước đây N+1: tối đa 200 count query / lần gọi).
 */
export const getUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ chat: number; email: number }> => {
    const { data, error } = await (context.supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: Array<{ chat: number; email: number }> | null; error: { message: string } | null }>;
    }).rpc("get_unread_counts");
    if (error) throw new Error(error.message);
    const row = data?.[0];
    return { chat: Number(row?.chat ?? 0), email: Number(row?.email ?? 0) };
  });
