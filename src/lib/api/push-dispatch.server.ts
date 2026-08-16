import { sendWebPush, isWebPushConfigured, type PushPayload, type PushSubscriptionRecord } from "./webpush.server";

interface Row extends PushSubscriptionRecord {
  id: string;
}

/** Server-only: deliver a web push to every enabled device of the given users. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!isWebPushConfigured() || userIds.length === 0) return { sent: 0, failed: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .eq("enabled", true);
  if (error || !data || data.length === 0) return { sent: 0, failed: 0 };

  const rows = data as unknown as Row[];
  const results = await Promise.all(rows.map((r) => sendWebPush(r, payload)));

  const expired = rows.filter((_, i) => results[i]?.expired).map((r) => r.id);
  if (expired.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expired);
  }
  const okIds = rows.filter((_, i) => results[i]?.ok).map((r) => r.id);
  if (okIds.length > 0) {
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
      .in("id", okIds);
  }
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.length - sent };
}
