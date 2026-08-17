/**
 * Phân quyền màn hình Quản trị (Blueprint §25).
 *
 * - `admin`     → đọc + ghi (toàn quyền quản trị hệ thống)
 * - `moderator` → chỉ đọc (xem dữ liệu quản trị, không thay đổi)
 * - còn lại     → không truy cập
 */
export type AdminAccess = {
  isAdmin: boolean;
  isModerator: boolean;
  canRead: boolean;
  canWrite: boolean;
  level: "none" | "read" | "write";
};

type MinimalClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        in: (c: string, v: string[]) => Promise<{ data: { role: string }[] | null }>;
      };
    };
  };
};

export async function resolveAdminAccess(
  supabase: unknown,
  userId: string,
): Promise<AdminAccess> {
  const { data } = await (supabase as MinimalClient)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"]);
  const roles = new Set((data ?? []).map((r) => r.role));
  const isAdmin = roles.has("admin");
  const isModerator = roles.has("moderator");
  return {
    isAdmin,
    isModerator,
    canRead: isAdmin || isModerator,
    canWrite: isAdmin,
    level: isAdmin ? "write" : isModerator ? "read" : "none",
  };
}

/** Cho phép admin hoặc moderator (chỉ đọc). */
export async function assertAdminRead(ctx: { supabase: unknown; userId: string }) {
  const access = await resolveAdminAccess(ctx.supabase, ctx.userId);
  if (!access.canRead) throw new Error("FORBIDDEN: cần quyền quản trị (đọc)");
  return access;
}

/** Chỉ admin mới được ghi. */
export async function assertAdminWrite(ctx: { supabase: unknown; userId: string }) {
  const access = await resolveAdminAccess(ctx.supabase, ctx.userId);
  if (!access.canWrite) throw new Error("FORBIDDEN: cần quyền quản trị (ghi)");
  return access;
}
