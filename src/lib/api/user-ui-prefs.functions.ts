// Lưu tuỳ chọn giao diện (theme + tone) theo tài khoản để đồng bộ đa thiết bị.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const themeSchema = z.enum(["light", "dark"]);
const toneSchema = z.enum(["violet", "blue", "teal", "emerald", "amber", "rose"]);
const contrastSchema = z.enum(["normal", "high"]);

export type UiPrefs = {
  theme: z.infer<typeof themeSchema>;
  tone: z.infer<typeof toneSchema>;
  contrast: z.infer<typeof contrastSchema>;
};

export const getUiPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UiPrefs | null> => {
    const { data, error } = await context.supabase
      .from("user_ui_prefs")
      .select("theme, tone, contrast")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: error.message });
    return data
      ? {
          theme: data.theme as UiPrefs["theme"],
          tone: data.tone as UiPrefs["tone"],
          contrast: (data.contrast as UiPrefs["contrast"]) ?? "normal",
        }
      : null;
  });

export const saveUiPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Partial<UiPrefs>) =>
    z
      .object({
        theme: themeSchema.optional(),
        tone: toneSchema.optional(),
        contrast: contrastSchema.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_ui_prefs")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: error.message });
    return { ok: true as const };
  });
