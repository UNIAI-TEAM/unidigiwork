import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Loader2, RotateCcw, Crown, Lock } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  listWorkflowPermissions, setWorkflowPermission, resetWorkflowPermission,
} from "@/lib/api/workflows.functions";

export const Route = createFileRoute("/workflows_/permissions")({
  head: () => ({
    meta: [
      { title: "Phân quyền quy trình · UNIWORK" },
      { name: "description", content: "Chỉ định ai được chỉnh sửa, phát hành và chạy quy trình trong không gian làm việc." },
      { property: "og:title", content: "Phân quyền quy trình · UNIWORK" },
      { property: "og:description", content: "Quản lý quyền chỉnh sửa, phát hành và chạy quy trình theo từng thành viên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkflowPermissionsPage,
});

type Member = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  workspace_role: string;
  is_owner: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_run: boolean;
  updated_at: string | null;
};

const PERMS = [
  { key: "can_edit" as const, label: "Chỉnh sửa", hint: "Sửa các bước & cấu hình trigger" },
  { key: "can_publish" as const, label: "Phát hành", hint: "Đưa quy trình lên bản chạy chính thức" },
  { key: "can_run" as const, label: "Chạy", hint: "Khởi chạy hoặc chạy thử quy trình" },
];

function WorkflowPermissionsPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const [wsId, setWsId] = useState<string | undefined>(undefined);

  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const activeWs = wsId ?? workspaces.data?.[0]?.id;

  const permQuery = useQuery({
    queryKey: ["workflow-permissions", activeWs],
    enabled: Boolean(activeWs),
    queryFn: async () =>
      (await listWorkflowPermissions({ data: { workspaceId: activeWs! } })) as unknown as {
        canManage: boolean; members: Member[];
      },
  });

  const canManage = permQuery.data?.canManage ?? false;
  const members = permQuery.data?.members ?? [];

  const save = useMutation({
    mutationFn: (m: Member) =>
      setWorkflowPermission({
        data: {
          workspaceId: activeWs!,
          userId: m.user_id,
          canEdit: m.can_edit,
          canPublish: m.can_publish,
          canRun: m.can_run,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workflow-permissions", activeWs] });
      toast.success("Đã cập nhật quyền");
    },
    onError: (e: Error) => toast.error(e.message || "Không cập nhật được quyền"),
  });

  const reset = useMutation({
    mutationFn: (userId: string) =>
      resetWorkflowPermission({ data: { workspaceId: activeWs!, userId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workflow-permissions", activeWs] });
      toast.success("Đã đưa về quyền mặc định");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (m: Member, key: (typeof PERMS)[number]["key"]) => {
    if (!canManage || m.is_owner) return;
    save.mutate({ ...m, [key]: !m[key] });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <Link to="/workflows" className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" /> Quy trình
          </Link>
          <select
            value={activeWs ?? ""}
            onChange={(e) => setWsId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface-2 px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {(workspaces.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          {!canManage && !permQuery.isLoading && (
            <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Chỉ xem — bạn không có quyền quản trị không gian này
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
            <div className="rounded-xl border border-border bg-card p-4 md:p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h1 className="text-sm font-semibold">Quyền trên quy trình</h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Chỉ định từng thành viên được chỉnh sửa, phát hành hoặc chạy quy trình trong không gian làm việc này.
                Chủ sở hữu luôn có toàn quyền.
              </p>

              {permQuery.isLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p>
              ) : members.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Không gian này chưa có thành viên nào.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Thành viên</th>
                        {PERMS.map((p) => (
                          <th key={p.key} className="pb-2 text-center font-medium">
                            {p.label}
                            <span className="block text-[10px] font-normal">{p.hint}</span>
                          </th>
                        ))}
                        <th className="pb-2 text-right font-medium">Mặc định</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.user_id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{m.display_name || m.email || m.user_id.slice(0, 8)}</span>
                              {m.is_owner && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                                  <Crown className="h-3 w-3" /> Chủ sở hữu
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{m.email ?? m.workspace_role}</span>
                          </td>
                          {PERMS.map((p) => (
                            <td key={p.key} className="py-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${p.label} — ${m.display_name || m.email || ""}`}
                                checked={m.is_owner ? true : m[p.key]}
                                disabled={!canManage || m.is_owner || save.isPending}
                                onChange={() => toggle(m, p.key)}
                                className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </td>
                          ))}
                          <td className="py-3 text-right">
                            <button
                              onClick={() => reset.mutate(m.user_id)}
                              disabled={!canManage || m.is_owner || !m.updated_at || reset.isPending}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs hover:bg-surface-2 disabled:opacity-40"
                            >
                              {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                              Đặt lại
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
