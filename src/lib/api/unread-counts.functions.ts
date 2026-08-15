import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Số tin nhắn chat & email chưa đọc của người dùng hiện tại (dùng cho badge). */
export const getUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ chat: number; email: number }> => {
    const [{ data: memberships }, { count: emailCount }] = await Promise.all([
      context.supabase
        .from("chat_members")
        .select("channel_id, last_read_at")
        .eq("user_id", context.userId)
        .limit(200),
      context.supabase
        .from("email_states")
        .select("message_id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("folder", "inbox")
        .eq("is_read", false),
    ]);

    const rows = (memberships ?? []) as Array<{ channel_id: string; last_read_at: string | null }>;
    const counts = await Promise.all(
      rows.map(async (m) => {
        let q = context.supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", m.channel_id)
          .is("deleted_at", null)
          .neq("author_id", context.userId);
        if (m.last_read_at) q = q.gt("created_at", m.last_read_at);
        const { count } = await q;
        return count ?? 0;
      }),
    );

    return {
      chat: counts.reduce((a, b) => a + b, 0),
      email: emailCount ?? 0,
    };
  });
