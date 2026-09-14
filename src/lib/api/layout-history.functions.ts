// LỊCH SỬ SẮP XẾP BỐ CỤC — lưu lại mỗi lần người dùng đổi vị trí/kích thước card
// để có thể xem lại và khôi phục bố cục cũ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const MAX_KEEP = 20;

export type LayoutHistoryEntry = {
  id: string;
  scope: "home" | "dashboard" | "ceo";
  label: string | null;
  /** JSON chuỗi hoá của bố cục. */
  prefs: string;
  createdAt: string;
};

function fail(err: { message?: string } | null, fallback: string): never {
  throw new ApiError({ code: "INTERNAL_ERROR", message: err?.message ?? fallback });
}

async function resolveTenantId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

const scopeSchema = z.enum(["home", "dashboard", "ceo"]);

/** Danh sách các bố cục đã lưu, mới nhất trước. */
export const listLayoutHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { scope: "home" | "dashboard" | "ceo"; limit?: number }) =>
    z.object({ scope: scopeSchema, limit: z.number().int().min(1).max(50).default(10) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<LayoutHistoryEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("user_layout_history")
      .select("id, scope, label, prefs, created_at")
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) fail(error, "Không tải được lịch sử bố cục");
    return ((rows ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r["id"] as string,
      scope: r["scope"] as "home" | "dashboard" | "ceo",
      label: (r["label"] as string | null) ?? null,
      prefs: JSON.stringify(r["prefs"] ?? null),
      createdAt: r["created_at"] as string,
    }));
  });

/** Lưu một mốc bố cục; bỏ qua nếu trùng hệt mốc gần nhất. */
export const saveLayoutSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { scope: "home" | "dashboard" | "ceo"; prefs: string; label?: string | null }) =>
    z
      .object({
        scope: scopeSchema,
        prefs: z.string().min(2).max(20000),
        label: z.string().max(120).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("user_layout_history")
      .select("id, prefs")
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      last &&
      JSON.stringify((last as { prefs: unknown }).prefs) === JSON.stringify(JSON.parse(data.prefs))
    ) {
      return { ok: true as const, saved: false };
    }

    const tenantId = await resolveTenantId(context.supabase, context.userId);
    const { error } = await context.supabase.from("user_layout_history").insert({
      user_id: context.userId,
      tenant_id: tenantId,
      scope: data.scope,
      prefs: JSON.parse(data.prefs) as never,
      label: data.label ?? null,
    } as never);
    if (error) fail(error, "Không lưu được lịch sử bố cục");

    // Chỉ giữ lại các mốc gần nhất.
    const { data: old } = await context.supabase
      .from("user_layout_history")
      .select("id")
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .order("created_at", { ascending: false })
      .range(MAX_KEEP, MAX_KEEP + 50);
    const ids = ((old ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length) {
      await context.supabase.from("user_layout_history").delete().in("id", ids);
    }

    return { ok: true as const, saved: true };
  });
