import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schoolContext } from "./school-ops.functions";

export type ChatGroup = { id: string; name: string; description: string | null; is_dept: boolean; member_ids: string[]; department: string | null };

const code = (m: string) => ["FORBIDDEN", "INVALID_NAME", "NOT_FOUND", "DEPT_GROUP", "NOT_MEMBER", "NOT_IN_DEPT"].find((c) => m.includes(c)) ?? "FAILED";

async function ctxOf(context: { supabase: unknown; userId: string }) {
  const ctx = await schoolContext(context.supabase as never, context.userId);
  if (!ctx) throw new Error("PACK_DISABLED");
  return ctx;
}

export const listChatGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx || (ctx.role !== "bgh" && !(ctx.role === "lead" && ctx.dept)))
      return { allowed: false, scope: null as string | null, groups: [] as ChatGroup[] };
    const { data, error } = await (context.supabase as any).rpc("school_list_chat_groups", { _tenant_id: ctx.tenantId });
    if (error) throw new Error(code(error.message));
    return { allowed: true, scope: ctx.role === "bgh" ? null : (ctx.dept as string | null), groups: (data ?? []) as ChatGroup[] };
  });

export const saveChatGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(80), description: z.string().max(300).nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxOf(context);
    const { data: id, error } = await (context.supabase as any).rpc("school_save_chat_group", {
      _tenant_id: ctx.tenantId, _id: data.id, _name: data.name, _description: data.description,
    });
    if (error) throw new Error(code(error.message));
    return { id: id as string };
  });

export const deleteChatGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await ctxOf(context);
    const { error } = await (context.supabase as any).rpc("school_delete_chat_group", { _tenant_id: ctx.tenantId, _id: data.id });
    if (error) throw new Error(code(error.message));
    return { ok: true };
  });

export const setChatMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channelId: z.string().uuid(), userId: z.string().uuid(), add: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await ctxOf(context);
    const { error } = await (context.supabase as any).rpc("school_set_chat_member", {
      _tenant_id: ctx.tenantId, _channel_id: data.channelId, _user_id: data.userId, _add: data.add,
    });
    if (error) throw new Error(code(error.message));
    return { ok: true };
  });
