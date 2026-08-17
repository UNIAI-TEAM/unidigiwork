import { useQuery } from "@tanstack/react-query";
import { getMyAdminAccess } from "@/lib/api/admin.functions";

export type AdminAccessDto = Awaited<ReturnType<typeof getMyAdminAccess>>;

const FALLBACK: AdminAccessDto = {
  isAdmin: false,
  isModerator: false,
  canRead: false,
  canWrite: false,
  level: "none",
  bootstrapped: false,
};

export function useAdminAccess() {
  const q = useQuery({
    queryKey: ["admin", "access"],
    queryFn: () => getMyAdminAccess(),
    staleTime: 30_000,
  });
  return { ...q, access: q.data ?? FALLBACK };
}
