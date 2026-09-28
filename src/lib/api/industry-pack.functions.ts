// Gói ngành (industry pack) cho tổ chức đang hoạt động. Ghi qua RPC tin cậy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError } from "./business.server";

const packSchema = z.enum(["business", "school"]);
export type TenantPackDto = {
  tenantId: string | null;
  pack: "business" | "school";
  canManage: boolean;
  vocabulary?: { vi: Record<string, string>; en: Record<string, string> };
};

export const getTenantPack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantPackDto> => {
    const { resolveActivePack } = await import("./industry-pack.server");
    const cur = await resolveActivePack(context.supabase as never, context.userId);
    if (cur.pack !== "school") return cur;
    const { listPackRows, mergedVocabulary } = await import("./pack-admin.server");
    const rows = await listPackRows(context.supabase, cur.tenantId);
    return { ...cur, vocabulary: mergedVocabulary(rows) };
  });

export const setTenantPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ...commandMetadataSchema.shape, pack: packSchema }).parse(i),
  )
  .handler(async ({ data, context }): Promise<TenantPackDto> => {
    const { resolveActivePack } = await import("./industry-pack.server");
    const cur = await resolveActivePack(context.supabase as never, context.userId);
    if (!cur.tenantId) throw new Error("TENANT_NOT_FOUND");
    const { error } = await context.supabase.rpc("set_tenant_industry_pack", {
      _tenant_id: cur.tenantId,
      _pack: data.pack,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return { ...cur, pack: data.pack };
  });
