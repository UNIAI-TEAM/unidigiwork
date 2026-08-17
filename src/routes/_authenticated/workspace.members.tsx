import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  listWorkspaces,
  listWorkspaceMembers,
  setWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/lib/api/workspaces.functions";
import {
  inviteUserToWorkspace,
  listWorkspaceInvites,
} from "@/lib/api/workspace-invites.functions";

export const Route = createFileRoute("/_authenticated/workspace/members")({
  head: () => ({
    meta: [
      { title: "Thành viên workspace · UNIWORK" },
      {
        name: "description",
        content: "Mời thành viên, đổi vai trò và gỡ quyền truy cập trong không gian làm việc.",
      },
      { property: "og:title", content: "Thành viên workspace · UNIWORK" },
      {
        property: "og:description",
        content: "Quản lý thành viên và lời mời của workspace theo phân quyền chủ sở hữu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    ws: typeof search["ws"] === "string" ? (search["ws"] as string) : undefined,
  }),
  component: WorkspaceMembersPage,
});

const TENANT_ROLES = [
  { value: "member", label: "Thành viên" },
  { value: "manager", label: "Quản lý" },
  { value: "tenant_admin", label: "Quản trị tổ chức" },
  { value: "guest", label: "Khách" },
] as const;

const INVITE_STATUS: Record<string, string> = {
  pending: "Chờ chấp nhận",
  accepted: "Đã tham gia",
  revoked: "Đã thu hồi",
  expired: "Hết hạn",
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function WorkspaceMembersPage() {
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const { ws } = Route.useSearch();
  const [workspaceId, setWorkspaceId] = useState<string>(ws ?? "");
  const [email, setEmail] = useState("");
  const [tenantRole, setTenantRole] = useState<(typeof TENANT_ROLES)[number]["value"]>("member");
  const [workspaceRole, setWorkspaceRole] = useState<"owner" | "member">("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const workspacesQ = useQuery({ queryKey: ["workspaces", "list"], queryFn: () => listWorkspaces() });
  const workspaces = workspacesQ.data ?? [];

  useEffect(() => {
    if (ws && ws !== workspaceId) { setWorkspaceId(ws); return; }
    if (!workspaceId && workspaces.length) setWorkspaceId(workspaces[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, ws]);

  const active = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );
  const isOwner = Boolean(active?.isOwner);

  const membersQ = useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => listWorkspaceMembers({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });
  const invitesQ = useQuery({
    queryKey: ["workspace", workspaceId, "invites"],
    queryFn: () => listWorkspaceInvites({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] });
    qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "invites"] });
    qc.invalidateQueries({ queryKey: ["workspaces", "list"] });
  };

  const inviteMut = useMutation({
    mutationFn: () =>
      inviteUserToWorkspace({
        data: { workspaceId, email: email.trim(), tenantRole, workspaceRole },
      }),
    onSuccess: (r) => {
      setInviteLink(`${window.location.origin}/workspace/invite?token=${r.token}`);
      setEmail("");
      toast.success(`Đã tạo lời mời cho ${r.email}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "owner" | "member" }) =>
      setWorkspaceMemberRole({ data: { workspaceId, ...v } }),
    onSuccess: () => {
      toast.success("Đã cập nhật vai trò");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember({ data: { workspaceId, userId } }),
    onSuccess: () => {
      toast.success("Đã gỡ thành viên");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-none flex-1 space-y-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" /> Quản lý workspace
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Thành viên &amp; lời mời</h1>
              <p className="text-sm text-muted-foreground">
                Mời người dùng, đổi vai trò và gỡ quyền truy cập. Mọi thay đổi áp dụng qua phân
                quyền của chủ sở hữu workspace.
              </p>
            </div>
            <Link
              to="/workspace"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Danh sách workspace
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Chọn workspace
            </label>
            {workspacesQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Đang tải workspace…</div>
            ) : workspaces.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Bạn chưa có workspace nào.{" "}
                <Link to="/workspace" className="text-primary underline">
                  Tạo workspace
                </Link>
              </div>
            ) : (
              <select
                className={inputCls}
                value={workspaceId}
                onChange={(e) => {
                  setWorkspaceId(e.target.value);
                  setInviteLink(null);
                }}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {workspaceId && (
            <>
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <UserPlus className="h-4 w-4 text-primary" /> Mời thành viên
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Email người được mời
                    </label>
                    <input
                      type="email"
                      className={inputCls}
                      placeholder="ten@congty.vn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Vai trò tổ chức
                    </label>
                    <select
                      className={inputCls}
                      value={tenantRole}
                      onChange={(e) =>
                        setTenantRole(e.target.value as (typeof TENANT_ROLES)[number]["value"])
                      }
                    >
                      {TENANT_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Vai trò workspace
                    </label>
                    <select
                      className={inputCls}
                      value={workspaceRole}
                      onChange={(e) => setWorkspaceRole(e.target.value as "owner" | "member")}
                    >
                      <option value="member">Thành viên</option>
                      <option value="owner">Chủ sở hữu</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      disabled={!email.trim() || inviteMut.isPending}
                      onClick={() => inviteMut.mutate()}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {inviteMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Gửi lời mời
                    </button>
                  </div>
                </div>

                {inviteLink && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-primary">
                      {inviteLink}
                    </span>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(inviteLink);
                        toast.success("Đã sao chép liên kết mời");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-surface-2"
                    >
                      <Copy className="h-3 w-3" /> Sao chép
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" /> Thành viên hiện tại
                  <span className="text-xs font-normal text-muted-foreground">
                    ({membersQ.data?.length ?? 0})
                  </span>
                </div>
                {membersQ.isLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                ) : (membersQ.data ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Chưa có thành viên nào.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(membersQ.data ?? []).map((m) => (
                      <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {m.name}
                            {m.isMe && (
                              <span className="ml-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                                Bạn
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {m.email || "—"} · Tham gia {fmtDate(m.joinedAt)}
                          </div>
                        </div>
                        <select
                          className="rounded-lg border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
                          value={m.role}
                          disabled={!isOwner || roleMut.isPending}
                          onChange={(e) =>
                            roleMut.mutate({
                              userId: m.userId,
                              role: e.target.value as "owner" | "member",
                            })
                          }
                        >
                          <option value="member">Thành viên</option>
                          <option value="owner">Chủ sở hữu</option>
                        </select>
                        <button
                          disabled={removeMut.isPending}
                          onClick={() => {
                            if (confirm(`Gỡ ${m.name} khỏi workspace?`)) removeMut.mutate(m.userId);
                          }}
                          className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          aria-label="Gỡ thành viên"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!isOwner && (
                  <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mr-1 inline h-3 w-3" />
                    Chỉ chủ sở hữu workspace mới đổi được vai trò hoặc gỡ thành viên.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
                  <Mail className="h-4 w-4 text-primary" /> Lời mời đã gửi
                </div>
                {invitesQ.isLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Đang tải…</div>
                ) : (invitesQ.data ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Chưa có lời mời nào.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(invitesQ.data ?? []).map((i) => (
                      <li
                        key={i.invitationId}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{i.email}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.workspaceRole === "owner" ? "Chủ sở hữu" : "Thành viên"} · Hết hạn{" "}
                            {fmtDate(i.expiresAt)}
                          </div>
                        </div>
                        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                          {INVITE_STATUS[i.status] ?? i.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
