import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PREF_KEYS = [
  "in_app_mention", "in_app_task", "in_app_meeting",
  "in_app_document", "in_app_workflow", "in_app_system",
  "email_mention", "email_task", "email_meeting",
  "email_document", "email_workflow", "email_system",
  "email_daily_digest", "email_product_news",
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export type NotifPrefs = Record<PrefKey, boolean>;

const DEFAULTS: NotifPrefs = {
  in_app_mention: true, in_app_task: true, in_app_meeting: true,
  in_app_document: true, in_app_workflow: true, in_app_system: true,
  email_mention: true, email_task: false, email_meeting: true,
  email_document: false, email_workflow: false, email_system: false,
  email_daily_digest: true, email_product_news: false,
};

export const getMyNotifPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotifPrefs> => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULTS;
    const out = { ...DEFAULTS };
    for (const k of PREF_KEYS) {
      const v = (data as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  });

const updateSchema = z.object(
  Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
    PrefKey,
    z.ZodOptional<z.ZodBoolean>
  >,
);

export const updateMyNotifPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<NotifPrefs> => {
    const patch: Record<string, unknown> = { user_id: context.userId };
    for (const k of PREF_KEYS) {
      if (typeof data[k] === "boolean") patch[k] = data[k];
    }
    const { data: row, error } = await (context.supabase as unknown as {
      from: (t: string) => {
        upsert: (v: unknown, o: { onConflict: string }) => {
          select: (c: string) => { single: () => Promise<{ data: unknown; error: { message: string } | null }> };
        };
      };
    })
      .from("notification_preferences")
      .upsert(patch, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const out = { ...DEFAULTS };
    for (const k of PREF_KEYS) {
      const v = (row as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  });