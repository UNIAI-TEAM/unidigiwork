// Ngữ cảnh workspace đang làm việc — lưu ở localStorage, đồng bộ giữa các component.
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyWorkspaces } from "@/lib/api/workspace-overview.functions";

const STORAGE_KEY = "uniwork.activeWorkspaceId";
const EVENT = "uniwork:active-workspace-changed";

function read(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setActiveWorkspaceId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Danh sách workspace của người dùng (dùng chung cache). */
export function useMyWorkspaces() {
  return useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 60_000,
  });
}

/**
 * Trả về workspace đang chọn. `workspaceId === null` nghĩa là "Tất cả workspace".
 * Hydration-safe: đọc localStorage trong useEffect.
 */
export function useActiveWorkspace() {
  const [workspaceId, setId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { data: workspaces, isLoading } = useMyWorkspaces();

  useEffect(() => {
    const sync = () => setId(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Nếu workspace đã lưu không còn tồn tại → về "Tất cả".
  useEffect(() => {
    if (!ready || !workspaces || !workspaceId) return;
    if (!workspaces.some((w) => w.id === workspaceId)) setActiveWorkspaceId(null);
  }, [ready, workspaces, workspaceId]);

  const select = useCallback((id: string | null) => setActiveWorkspaceId(id), []);

  const current = workspaces?.find((w) => w.id === workspaceId) ?? null;

  return {
    workspaceId: ready ? workspaceId : null,
    workspaceName: current?.name ?? null,
    workspaces: workspaces ?? [],
    isLoading,
    ready,
    select,
  };
}
