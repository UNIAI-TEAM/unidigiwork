import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("FORBIDDEN: Bạn không có quyền quản trị");
}

export const listDemoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("demo_requests")
      .select("id, name, email, role, source, status, notes, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`DEMO_REQUEST_LIST_FAILED: ${error.message}`);
    return data ?? [];
  });

export const updateDemoRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(LEAD_STATUSES),
      notes: z.string().trim().max(2000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("demo_requests")
      .update({
        status: data.status,
        updated_at: new Date().toISOString(),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(`DEMO_REQUEST_UPDATE_FAILED: ${error.message}`);
    return { success: true };
  });

const submitDemoRequestSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên không được để trống" }).max(100, { message: "Tên không quá 100 ký tự" }),
  email: z.string().trim().email({ message: "Email không hợp lệ" }).max(255, { message: "Email không quá 255 ký tự" }),
  role: z.string().trim().min(1, { message: "Vai trò không được để trống" }).max(100, { message: "Vai trò không quá 100 ký tự" }),
});

export const submitDemoRequest = createServerFn({ method: "POST" })
  .inputValidator(submitDemoRequestSchema)
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("demo_requests").insert({
      name: data.name,
      email: data.email,
      role: data.role,
      source: "landing_hybrid",
      status: "new",
    });

    if (error) {
      throw new Error(`DEMO_REQUEST_INSERT_FAILED: ${error.message}`);
    }

    return { success: true };
  });
