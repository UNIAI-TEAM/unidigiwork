// Danh tính thật của người dùng đang đăng nhập cho Topbar.
// Không hardcode tên/vai trò. Nguồn: Supabase auth + profiles + active tenant.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/features/tenants/hooks";

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

export interface CurrentIdentity {
  userId: string | null;
  displayName: string;
  email: string | null;
  roleLabel: string;
  tenantName: string | null;
  initials: string;
  isLoading: boolean;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts[parts.length - 1]!;
  const first = parts[0]!;
  return (parts.length === 1 ? first.slice(0, 2) : first[0]! + last[0]!).toUpperCase();
}

export function useCurrentIdentity(): CurrentIdentity {
  const profileQuery = useQuery({
    queryKey: ["identity", "current-user"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();
      return {
        userId: user.id,
        email: profile?.email ?? user.email ?? null,
        displayName:
          profile?.display_name?.trim() ||
          (user.user_metadata as { display_name?: string } | null)?.display_name?.trim() ||
          profile?.email ||
          user.email ||
          "",
      };
    },
  });

  const tenantQuery = useActiveTenant();
  const tenant = tenantQuery.data as { role?: string; tenantName?: string } | null | undefined;
  const p = profileQuery.data;
  const displayName = p?.displayName || "";

  return {
    userId: p?.userId ?? null,
    displayName: displayName || "Người dùng",
    email: p?.email ?? null,
    roleLabel: tenant?.role ? (ROLE_LABEL[tenant.role] ?? tenant.role) : "—",
    tenantName: tenant?.tenantName ?? null,
    initials: initialsOf(displayName || "?"),
    isLoading: profileQuery.isLoading,
  };
}
