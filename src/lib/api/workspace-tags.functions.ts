// CRUD nhãn (tags) theo workspace — chạy qua RLS của người dùng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

export type WorkspaceTagDTO = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  description: string;
  createdAt: string;
};

function fail(err: { message?: string } | null, fallback: string): never {
  const raw = (err?.message ?? "").toUpperCase();
  const denied = raw.includes("PERMISSION") || raw.includes("DENIED") || raw.includes("RLS");
  const dup = raw.includes("DUPLICATE") || raw.includes("UNIQUE");
  throw new ApiError({
    code: denied ? "PERMISSION_DENIED" : "INTERNAL_ERROR",
    message: dup ? "Nhãn này đã tồn tại trong workspace" : (err?.message ?? fallback),
  });
}

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Màu phải ở dạng mã hex, ví dụ #2563eb");

export const listWorkspaceTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workspaceId: string }) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkspaceTagDTO[]> => {
    const { data: rows, error } = await context.supabase
      .from("workspace_tags")
      .select("id, workspace_id, name, color, description, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    if (error) fail(error, "Không tải được danh sách nhãn");
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      name: r.name as string,
      color: r.color as string,
      description: (r.description ?? "") as string,
      createdAt: r.created_at as string,
    }));
  });

export const createWorkspaceTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workspaceId: string; name: string; color: string; description?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(40),
        color: colorSchema,
        description: z.string().trim().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_tags")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        color: data.color,
        description: data.description ?? "",
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (error) fail(error, "Không tạo được nhãn");
    return { id: row?.id as string };
  });

export const updateWorkspaceTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tagId: string; name: string; color: string; description?: string }) =>
    z
      .object({
        tagId: z.string().uuid(),
        name: z.string().trim().min(1).max(40),
        color: colorSchema,
        description: z.string().trim().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_tags")
      .update({ name: data.name, color: data.color, description: data.description ?? "" })
      .eq("id", data.tagId);
    if (error) fail(error, "Không cập nhật được nhãn");
    return { ok: true as const };
  });

export const deleteWorkspaceTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tagId: string }) => z.object({ tagId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workspace_tags").delete().eq("id", data.tagId);
    if (error) fail(error, "Không xóa được nhãn");
    return { ok: true as const };
  });
