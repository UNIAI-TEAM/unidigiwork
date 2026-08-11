// Bộ lọc công việc đã lưu (saved views) theo từng người dùng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

export type TaskSavedViewDTO = {
  id: string;
  name: string;
  tags: string[];
  priority: string;
};

function fail(err: { message?: string } | null, fallback: string): never {
  throw new ApiError({ code: "INTERNAL_ERROR", message: err?.message ?? fallback });
}

export const listTaskViews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaskSavedViewDTO[]> => {
    const { data, error } = await context.supabase
      .from("task_saved_views")
      .select("id, name, tags, priority")
      .order("created_at", { ascending: true });
    if (error) fail(error, "Không tải được bộ lọc đã lưu");
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      tags: (r.tags ?? []) as string[],
      priority: (r.priority ?? "") as string,
    }));
  });

export const saveTaskView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; tags: string[]; priority: string }) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        tags: z.array(z.string().trim().min(1).max(40)).max(20),
        priority: z.string().trim().max(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_saved_views")
      .upsert(
        {
          user_id: context.userId,
          name: data.name,
          tags: Array.from(new Set(data.tags)),
          priority: data.priority,
        },
        { onConflict: "user_id,name" },
      );
    if (error) fail(error, "Không lưu được bộ lọc");
    return { ok: true as const };
  });

export const deleteTaskView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { viewId: string }) => z.object({ viewId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_saved_views")
      .delete()
      .eq("id", data.viewId);
    if (error) fail(error, "Không xóa được bộ lọc");
    return { ok: true as const };
  });
