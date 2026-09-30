import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schoolContext } from "./school-ops.functions";

export type MyTeacherProfile = {
  display_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  subject: string | null;
  department: string | null;
  avatar_url: string | null;
};
export type MyPlan = {
  id: string;
  kind: "lesson" | "assignment";
  title: string;
  class_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  department: string;
  task_status: string | null;
};

export const getMyTeacherSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) return { enabled: false as const, tenantId: null, profile: null, plans: [] as MyPlan[], overdue: 0 };
    const sb = context.supabase as any;
    const [{ data: p, error: pe }, { data: rows, error: re }, { data: od }] = await Promise.all([
      sb.rpc("school_get_my_profile", { _tenant_id: ctx.tenantId }),
      sb.rpc("school_list_my_plans", { _tenant_id: ctx.tenantId, _from: data.from, _to: data.to }),
      sb.rpc("school_my_overdue_count", { _tenant_id: ctx.tenantId }),
    ]);
    if (pe || re) throw new Error("LOAD_FAILED");
    let avatar_url: string | null = null;
    if (p?.avatar_object_key) {
      const { data: s } = await sb.storage.from(p.avatar_bucket ?? "member-avatars").createSignedUrl(p.avatar_object_key, 3600);
      avatar_url = s?.signedUrl ?? null;
    }
    const profile: MyTeacherProfile = {
      display_name: p?.display_name ?? null,
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      title: p?.title ?? null,
      subject: p?.subject ?? null,
      department: p?.department ?? null,
      avatar_url,
    };
    return { enabled: true as const, tenantId: ctx.tenantId as string, profile, plans: (rows ?? []) as MyPlan[], overdue: Number(od ?? 0) };
  });

export const updateMyTeacherProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        displayName: z.string().trim().min(1).max(120),
        phone: z.string().trim().max(30).regex(/^[0-9+\-\s().]*$/),
        title: z.string().trim().max(80),
        subject: z.string().trim().max(80),
        avatarObjectKey: z.string().max(300).nullable(),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { error } = await (context.supabase as any).rpc("school_update_my_profile", {
      _tenant_id: ctx.tenantId,
      _display_name: data.displayName,
      _phone: data.phone,
      _title: data.title,
      _subject: data.subject,
      _avatar_object_key: data.avatarObjectKey,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : "SAVE_FAILED");
    return { ok: true };
  });
