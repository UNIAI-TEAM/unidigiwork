import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
