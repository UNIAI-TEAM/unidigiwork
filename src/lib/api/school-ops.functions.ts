import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActivePack } from "./industry-pack.server";
import { generateBrief, loadOverview } from "./school-ops.server";

export type SchoolBrief = {
  id: string;
  workspace_id: string | null;
  trigger: "manual" | "scheduled";
  status: "ok" | "no_data" | "error";
  content: string;
  created_at: string;
};

export const getSchoolOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { tenantId, pack } = await resolveActivePack(context.supabase as never, context.userId);
    if (!tenantId || pack !== "school") return { enabled: false as const, isLeader: false, depts: [], briefs: [] as SchoolBrief[] };
    const [depts, lead, briefs] = await Promise.all([
      loadOverview(context.supabase, tenantId),
      context.supabase.rpc("_school_is_leader", { _tenant_id: tenantId, _uid: context.userId }),
      context.supabase.rpc("list_school_briefs", { _tenant_id: tenantId, _workspace_id: data.workspaceId, _limit: 10 }),
    ]);
    return {
      enabled: true as const,
      isLeader: lead.data === true,
      depts,
      briefs: (briefs.data ?? []) as SchoolBrief[],
    };
  });

export const createSchoolBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable(), idempotencyKey: z.string().min(8).max(100) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { tenantId, pack } = await resolveActivePack(context.supabase as never, context.userId);
    if (!tenantId || pack !== "school") throw new Error("PACK_DISABLED");
    const b = await generateBrief(context.supabase, tenantId, data.workspaceId);
    const { data: id, error } = await context.supabase.rpc("save_school_brief", {
      _tenant_id: tenantId,
      _workspace_id: data.workspaceId as string,
      _content: b.content,
      _facts: b.facts,
      _trigger: "manual",
      _status: b.status,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : "SAVE_FAILED");
    return { id: id as string, status: b.status };
  });
