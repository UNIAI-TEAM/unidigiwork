// Quản trị Gói Trường học: mẫu văn bản, bộ từ ngữ, Skill, hẹn giờ bản tin. Ghi qua RPC tin cậy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError } from "./business.server";
import type { PackItemRow } from "./pack-admin.server";

export type PackAdminDto = {
  tenantId: string | null;
  pack: "business" | "school";
  canManageTenant: boolean;
  isPlatformAdmin: boolean;
  items: PackItemRow[];
};

export const getPackAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PackAdminDto> => {
    const { resolveActivePack } = await import("./industry-pack.server");
    const { listPackRows } = await import("./pack-admin.server");
    const cur = await resolveActivePack(context.supabase as never, context.userId);
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const items = await listPackRows(context.supabase, cur.tenantId);
    return {
      tenantId: cur.tenantId,
      pack: cur.pack,
      canManageTenant: cur.canManage,
      isPlatformAdmin: !!isAdmin,
      items,
    };
  });

export const savePackItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        scope: z.enum(["platform", "tenant"]),
        kind: z.enum(["template", "vocabulary", "skill", "brief_schedule"]),
        itemKey: z.string().min(1).max(80),
        content: z.record(z.string(), z.unknown()),
        status: z.enum(["draft", "published"]),
        publishAt: z.string().datetime().nullable().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let tenantId: string | null = null;
    if (data.scope === "tenant") {
      const { resolveActivePack } = await import("./industry-pack.server");
      const cur = await resolveActivePack(context.supabase as never, context.userId);
      if (!cur.tenantId) throw new Error("TENANT_NOT_FOUND");
      tenantId = cur.tenantId;
    }
    const { data: id, error } = await context.supabase.rpc("save_pack_item", {
      _tenant_id: tenantId as never,
      _kind: data.kind,
      _item_key: data.itemKey,
      _content: data.content as never,
      _status: data.status,
      _publish_at: (data.publishAt ?? null) as never,
      _note: data.note ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return { id: id as string };
  });

export const archivePackItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("archive_pack_item", { _id: data.id });
    if (error) mapPgError(error);
    return { ok: true };
  });
