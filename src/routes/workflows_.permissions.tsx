import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Loader2, RotateCcw, Crown, Lock, History, Users, ShieldAlert } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  listWorkflowPermissions, setWorkflowPermission, resetWorkflowPermission,
  listWorkflowPermissionAudit, listWorkflowRolePermissions,
  setWorkflowRolePermission, resetWorkflowRolePermission,
  listWorkflowDenials,
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
  tenant_role: string | null;
  is_owner: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_run: boolean;
  source: string;
  updated_at: string | null;
};

type RoleRow = {
  role: string;
  can_edit: boolean;
  can_publish: boolean;
  can_run: boolean;
  member_count: number;
  is_configured: boolean;
  updated_at: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

const SOURCE_LABELS: Record<string, string> = {
  owner: "Chủ sở hữu",
  individual: "Riêng",
  role: "Theo vai trò",
  default: "Mặc định",
};

const PERMS = [
  { key: "can_edit" as const, label: "Chỉnh sửa", hint: "Sửa các bước & cấu hình trigger" },
  { key: "can_publish" as const, label: "Phát hành", hint: "Đưa quy trình lên bản chạy chính thức" },
  { key: "can_run" as const, label: "Chạy", hint: "Khởi chạy hoặc chạy thử quy trình" },
];

type PermState = {
  can_edit?: boolean | null; can_publish?: boolean | null; can_run?: boolean | null;
  is_default?: boolean | null; role?: string | null;
} | null;
type AuditRow = {
  id: string;
  occurred_at: string;
  action: string;
  actor_name: string | null;
  target_name: string | null;
  before_state: PermState;
  after_state: PermState;
};

function permSummary(s: PermState) {
  if (!s) return "—";
  const on = PERMS.filter((p) => s[p.key]).map((p) => p.label);
  const base = on.length ? on.join(" · ") : "Không có quyền";
  return s.is_default ? `${base} (mặc định)` : base;
}

function RolePermissions({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["workflow-role-permissions", workspaceId],
    queryFn: async () =>
      (await listWorkflowRolePermissions({ data: { workspaceId } })) as unknown as RoleRow[],
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["workflow-role-permissions", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["workflow-permissions", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["workflow-permission-audit", workspaceId] }),
    ]);
  };

  const save = useMutation({
    mutationFn: (r: RoleRow) =>
      setWorkflowRolePermission({
        data: {
          workspaceId,
          role: r.role as "tenant_owner" | "tenant_admin" | "manager" | "member" | "guest",
          canEdit: r.can_edit, canPublish: r.can_publish, canRun: r.can_run,
        },
      }),
    onSuccess: async () => { await refresh(); toast.success("Đã cập nhật quyền theo vai trò"); },
    onError: (e: Error) => toast.error(e.message || "Không cập nhật được quyền"),
  });

  const reset = useMutation({
    mutationFn: (role: string) =>
      resetWorkflowRolePermission({
        data: { workspaceId, role: role as "tenant_owner" | "tenant_admin" | "manager" | "member" | "guest" },
      }),
    onSuccess: async () => { await refresh(); toast.success("Đã bỏ quy tắc theo vai trò"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Quyền theo nhóm / vai trò</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Áp dụng cho tất cả thành viên thuộc vai trò đó. Quyền riêng của từng người (nếu có) sẽ được ưu tiên hơn quy tắc nhóm.
      </p>

      {q.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Vai trò</th>
                {PERMS.map((p) => (
                  <th key={p.key} className="pb-2 text-center font-medium">{p.label}</th>
                ))}
                <th className="pb-2 text-right font-medium">Quy tắc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.role} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-3">
                    <span className="font-medium">{ROLE_LABELS[r.role] ?? r.role}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.member_count} thành viên · {r.is_configured ? "đã cấu hình" : "chưa cấu hình"}
                    </span>
                  </td>
                  {PERMS.map((p) => (
                    <td key={p.key} className="py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${p.label} — ${ROLE_LABELS[r.role] ?? r.role}`}
                        checked={r[p.key]}
                        disabled={!canManage || save.isPending}
                        onChange={() => save.mutate({ ...r, [p.key]: !r[p.key] })}
                        className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                  ))}
                  <td className="py-3 text-right">
                    <button
                      onClick={() => reset.mutate(r.role)}
                      disabled={!canManage || !r.is_configured || reset.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs hover:bg-surface-2 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Bỏ quy tắc
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditTimeline({ workspaceId }: { workspaceId: string }) {
  return <AuditTimelineInner workspaceId={workspaceId} />;
}

type DenialRow = {
  id: string;
  occurred_at: string;
  action: "edit" | "publish" | "run";
  user_id: string;
  user_name: string | null;
  workflow_id: string | null;
  workflow_name: string | null;
  error_code: string | null;
  source: string;
};

const ACTION_LABELS: Record<string, string> = {
  edit: "Chỉnh sửa",
  publish: "Phát hành",
  run: "Chạy",
};

function DenialLog({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [action, setAction] = useState<"" | "edit" | "publish" | "run">("");
  const q = useQuery({
    queryKey: ["workflow-denials", workspaceId, action],
    enabled: canManage,
    queryFn: async () =>
      (await listWorkflowDenials({
        data: { workspaceId, action: action || null, limit: 100 },
      })) as unknown as DenialRow[],
  });
  const rows = q.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-semibold">Nhật ký từ chối quyền</h2>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          disabled={!canManage}
          aria-label="Lọc theo thao tác"
          className="ml-auto h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="">Tất cả thao tác</option>
          <option value="edit">Chỉnh sửa</option>
          <option value="publish">Phát hành</option>
          <option value="run">Chạy</option>
        </select>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ghi nhận ai bị chặn, thời điểm, thao tác và quy trình liên quan để quản trị viên tra cứu.
      </p>

      {!canManage ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Chỉ chủ không gian làm việc hoặc quản trị tổ chức mới xem được nhật ký này.
        </p>
      ) : q.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Chưa có lượt từ chối quyền nào được ghi nhận.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Thời gian</th>
                <th className="pb-2 font-medium">Người dùng</th>
                <th className="pb-2 font-medium">Thao tác</th>
                <th className="pb-2 font-medium">Quy trình</th>
                <th className="pb-2 text-right font-medium">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-3 text-xs text-muted-foreground">
                    {new Date(r.occurred_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="py-3 pr-3 font-medium">{r.user_name || r.user_id.slice(0, 8)}</td>
                  <td className="py-3 pr-3">
                    <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">
                    {r.workflow_name || (r.workflow_id ? r.workflow_id.slice(0, 8) : "—")}
                  </td>
                  <td className="py-3 text-right text-xs text-muted-foreground">
                    {r.source === "client" ? "Giao diện" : "Máy chủ"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditTimelineInner({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ["workflow-permission-audit", workspaceId],
    queryFn: async () =>
      (await listWorkflowPermissionAudit({ data: { workspaceId, limit: 50 } })) as unknown as AuditRow[],
  });
  const rows = q.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Lịch sử thay đổi quyền</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ghi nhận ai đã thay đổi, thời điểm và quyền trước / sau khi thay đổi.
      </p>

      {q.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Chưa có thay đổi quyền nào được ghi nhận.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border/70 bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{r.actor_name || "Hệ thống"}</span>
                <span className="text-muted-foreground">
                  {r.action.endsWith("reset") ? "đặt lại quyền của" : "cập nhật quyền của"}
                </span>
                <span className="font-medium">
                  {r.action.startsWith("workflow_permission.role")
                    ? `nhóm ${ROLE_LABELS[String(r.after_state?.role ?? "")] ?? r.after_state?.role ?? ""}`
                    : r.target_name || "thành viên"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(r.occurred_at).toLocaleString("vi-VN")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-background px-2 py-1 text-muted-foreground line-through decoration-muted-foreground/50">
                  {permSummary(r.before_state)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                  {permSummary(r.after_state)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
      await qc.invalidateQueries({ queryKey: ["workflow-permission-audit", activeWs] });
      toast.success("Đã cập nhật quyền");
    },
    onError: (e: Error) => toast.error(e.message || "Không cập nhật được quyền"),
  });

  const reset = useMutation({
    mutationFn: (userId: string) =>
      resetWorkflowPermission({ data: { workspaceId: activeWs!, userId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workflow-permissions", activeWs] });
      await qc.invalidateQueries({ queryKey: ["workflow-permission-audit", activeWs] });
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
                            <span className="ml-0 mt-1 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                              {SOURCE_LABELS[m.source] ?? m.source}
                              {m.tenant_role ? ` · ${ROLE_LABELS[m.tenant_role] ?? m.tenant_role}` : ""}
                            </span>
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
                              disabled={!canManage || m.is_owner || m.source !== "individual" || reset.isPending}
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

            {activeWs && <RolePermissions workspaceId={activeWs} canManage={canManage} />}
            {activeWs && <DenialLog workspaceId={activeWs} canManage={canManage} />}
            {activeWs && <AuditTimeline workspaceId={activeWs} />}
          </div>
        </div>
      </div>
    </div>
  );
}
