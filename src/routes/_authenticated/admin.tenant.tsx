import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  Users,
  Mail,
  ShieldAlert,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Crown,
  FolderKanban,
  ScrollText,
  Search as SearchIcon,
} from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import {
  useActiveTenant,
  useTenantMembers,
  useTenantInvitations,
  useChangeMemberRole,
  useChangeMemberStatus,
  useTransferOwnership,
  useCreateInvitation,
  useRevokeInvitation,
  useChangeTenantStatus,
  useTenantWorkspaces,
  useTenantAuditEvents,
} from "@/features/tenants/hooks";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/tenant")({
  head: () => ({
    meta: [
      { title: "Quản trị Tenant — UNIWORK" },
      { name: "description", content: "Quản trị tổ chức, thành viên và lời mời." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantAdminPage,
});

type Tab = "overview" | "members" | "invitations" | "workspaces" | "audit";

function TenantAdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const active = useActiveTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (active.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const tenant = active.data;
  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Chưa có tenant đang hoạt động.
          </p>
        </div>
      </div>
    );
  }

  const canManage = tenant.role === "tenant_owner" || tenant.role === "tenant_admin";

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col">
        <AppTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Quản trị Tenant</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tenant.tenantName} · <span className="font-mono">{tenant.tenantSlug}</span>
                </p>
              </div>
              <StatusBadge status={tenant.tenantStatus} />
            </header>

            {!canManage && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                Bạn không có quyền quản trị tenant này (vai trò: {tenant.role}). Một số hành động bị vô hiệu hoá.
              </div>
            )}

            <nav className="flex gap-1 border-b border-border">
              {(
                [
                  { id: "overview", label: "Tổng quan", icon: Building2 },
                  { id: "members", label: "Thành viên", icon: Users },
                  { id: "invitations", label: "Lời mời", icon: Mail },
                  { id: "workspaces", label: "Workspaces", icon: FolderKanban },
                  { id: "audit", label: "Audit", icon: ScrollText },
                ] as Array<{ id: Tab; label: string; icon: typeof Building2 }>
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                    tab === id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </nav>

            {tab === "overview" && <OverviewTab tenantId={tenant.tenantId} tenantStatus={tenant.tenantStatus} tenantName={tenant.tenantName} canManage={canManage} isOwner={tenant.role === "tenant_owner"} />}
            {tab === "members" && <MembersTab tenantId={tenant.tenantId} canManage={canManage} isOwner={tenant.role === "tenant_owner"} actorId={tenant.actorId} />}
            {tab === "invitations" && <InvitationsTab tenantId={tenant.tenantId} canManage={canManage} />}
            {tab === "workspaces" && <WorkspacesTab tenantId={tenant.tenantId} canManage={canManage} />}
            {tab === "audit" && <AuditTab tenantId={tenant.tenantId} canManage={canManage} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    suspended: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    archived: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${map[status] ?? map.archived}`}>
      {status}
    </span>
  );
}

function OverviewTab({
  tenantId,
  tenantStatus,
  tenantName,
  canManage,
  isOwner,
}: {
  tenantId: string;
  tenantStatus: string;
  tenantName: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const changeStatus = useChangeTenantStatus(tenantId);
  const members = useTenantMembers(tenantId);
  const invitations = useTenantInvitations(tenantId);

  const active = (members.data ?? []).filter((m) => m.status === "active").length;
  const pending = (invitations.data ?? []).filter((i) => i.status === "pending").length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Thành viên hoạt động" value={String(active)} icon={<Users className="h-4 w-4" />} />
      <Card label="Lời mời đang chờ" value={String(pending)} icon={<Mail className="h-4 w-4" />} />
      <Card label="Trạng thái" value={tenantStatus} icon={<Building2 className="h-4 w-4" />} />

      {isOwner && (
        <div className="md:col-span-3 rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 text-sm font-semibold">Vòng đời tenant</div>
          <div className="flex flex-wrap gap-2">
            {tenantStatus !== "active" && (
              <button
                onClick={() => changeStatus.mutate("active")}
                disabled={!canManage || changeStatus.isPending}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                Kích hoạt lại
              </button>
            )}
            {tenantStatus === "active" && (
              <button
                onClick={() => {
                  if (confirm(`Tạm ngưng tenant "${tenantName}"?`)) changeStatus.mutate("suspended");
                }}
                disabled={!canManage || changeStatus.isPending}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-500 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Tạm ngưng
              </button>
            )}
            {tenantStatus !== "archived" && (
              <button
                onClick={() => {
                  if (confirm(`LƯU TRỮ tenant "${tenantName}"? Hành động này không thể hoàn tác.`)) {
                    changeStatus.mutate("archived");
                  }
                }}
                disabled={!canManage || changeStatus.isPending}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                Lưu trữ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold capitalize">{value}</div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: "tenant_admin", label: "Tenant Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
] as const;

function MembersTab({
  tenantId,
  canManage,
  isOwner,
  actorId,
}: {
  tenantId: string;
  canManage: boolean;
  isOwner: boolean;
  actorId: string;
}) {
  const members = useTenantMembers(tenantId);
  const changeRole = useChangeMemberRole(tenantId);
  const changeStatus = useChangeMemberStatus(tenantId);
  const transferOwner = useTransferOwnership(tenantId);

  if (members.isLoading) return <SkeletonList />;
  const rows = members.data ?? [];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Người dùng</th>
            <th className="px-4 py-3">Vai trò</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3 text-right">Hành động</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isSelf = m.user_id === actorId;
            const isOwnerRow = m.role === "tenant_owner";
            return (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{m.user_id.slice(0, 8)}…</td>
                <td className="px-4 py-3">
                  {isOwnerRow ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      <Crown className="h-3 w-3" /> Owner
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      disabled={!canManage || isSelf}
                      onChange={(e) =>
                        changeRole.mutate(
                          { userId: m.user_id, newRole: e.target.value as "tenant_admin" | "manager" | "member" | "guest" },
                          {
                            onError: (err) =>
                              toast.error(err instanceof Error ? err.message : "Không thể đổi vai trò"),
                            onSuccess: () => toast.success("Đã cập nhật vai trò"),
                          },
                        )
                      }
                      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      m.status === "active"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : m.status === "suspended"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {isOwner && !isOwnerRow && (
                      <button
                        onClick={() => {
                          if (confirm(`Chuyển quyền chủ sở hữu cho user ${m.user_id.slice(0, 8)}…?`)) {
                            transferOwner.mutate(m.user_id, {
                              onSuccess: () => toast.success("Đã chuyển quyền chủ sở hữu"),
                              onError: (err) => toast.error(err instanceof Error ? err.message : "Không thể chuyển quyền"),
                            });
                          }
                        }}
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
                      >
                        Trao owner
                      </button>
                    )}
                    {canManage && !isOwnerRow && !isSelf && (
                      <button
                        onClick={() =>
                          changeStatus.mutate(
                            { userId: m.user_id, newStatus: m.status === "suspended" ? "active" : "suspended" },
                            {
                              onSuccess: () => toast.success("Đã cập nhật trạng thái"),
                              onError: (err) => toast.error(err instanceof Error ? err.message : "Không thể cập nhật"),
                            },
                          )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
                      >
                        {m.status === "suspended" ? "Kích hoạt" : "Tạm ngưng"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                Chưa có thành viên.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InvitationsTab({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const invitations = useTenantInvitations(tenantId);
  const create = useCreateInvitation(tenantId);
  const revoke = useRevokeInvitation(tenantId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tenant_admin" | "manager" | "member" | "guest">("member");
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const idempotencyKey = useMemo(() => `inv-${crypto.randomUUID()}`, [email, role]);

  const onCreate = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email không hợp lệ");
      return;
    }
    try {
      const res = await create.mutateAsync({
        email,
        role,
        ttlSeconds: 60 * 60 * 24 * 7, // 7 days
        idempotencyKey,
      });
      setLastToken(res.token);
      setEmail("");
      toast.success("Đã tạo lời mời. Sao chép link để gửi cho người nhận.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể tạo lời mời");
    }
  };

  const inviteUrl = lastToken ? `${window.location.origin}/invite/${lastToken}` : null;

  if (invitations.isLoading) return <SkeletonList />;
  const rows = invitations.data ?? [];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Mời thành viên mới
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              onClick={onCreate}
              disabled={create.isPending || !email}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tạo lời mời
            </button>
          </div>
          {inviteUrl && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="mb-1 text-xs font-semibold text-primary">
                Link lời mời (chỉ hiển thị một lần)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">{inviteUrl}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Hết hạn</th>
              <th className="px-4 py-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="px-4 py-3">{inv.email}</td>
                <td className="px-4 py-3 capitalize">{inv.role.replace("tenant_", "")}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      inv.status === "pending"
                        ? "bg-primary/10 text-primary"
                        : inv.status === "accepted"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(inv.expires_at).toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && inv.status === "pending" && (
                    <button
                      onClick={() => {
                        if (confirm(`Thu hồi lời mời tới ${inv.email}?`)) {
                          revoke.mutate(inv.id, {
                            onSuccess: () => toast.success("Đã thu hồi lời mời"),
                            onError: (err) => toast.error(err instanceof Error ? err.message : "Không thể thu hồi"),
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
                    >
                      <Trash2 className="h-3 w-3" /> Thu hồi
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Chưa có lời mời nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
      ))}
    </div>
  );
}