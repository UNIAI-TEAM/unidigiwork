import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PushDevice {
  id: string;
  endpoint: string;
  user_agent: string | null;
  enabled: boolean;
  last_used_at: string | null;
  created_at: string;
}

export const getPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapidPublicKey } = await import("./webpush.server");
  const publicKey = getVapidPublicKey();
  return { configured: Boolean(publicKey), publicKey };
});

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(10).max(500),
  auth: z.string().min(4).max(500),
  userAgent: z.string().max(400).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => subSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        enabled: true,
        failure_count: 0,
      } as never,
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ endpoint: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyPushDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushDevice[]> => {
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, enabled, last_used_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PushDevice[];
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUsers } = await import("./push-dispatch.server");
    const res = await sendPushToUsers([context.userId], {
      title: "UNIWORK",
      body: "Thông báo đẩy đã hoạt động trên thiết bị này 🎉",
      url: "/notifications",
      tag: "uniwork-test",
    });
    if (res.sent === 0) throw new Error("Không gửi được: chưa có thiết bị hợp lệ hoặc đăng ký đã hết hạn");
    return res;
  });
