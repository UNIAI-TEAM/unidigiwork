import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  XCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  inviteUserToWorkspace,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
  resendWorkspaceInvite,
  getWorkspaceInviteAccess,
  type WorkspaceInviteRow,
} from "@/lib/api/workspace-invites.functions";
import { listInviteEmailTemplates } from "@/lib/api/invite-email-templates.functions";
import {
  defaultTemplate,
  inviteEmailPlainText,
  permissionsSummary,
  INVITE_ROLE_LABEL as ROLE_LABEL_MAP,
  type InviteRole,
} from "@/lib/invite-email-template";

export const Route = createFileRoute("/_authenticated/workspace/invite")({
  head: () => ({
    meta: [
      { title: "Mời người dùng vào workspace · UNIWORK" },
      {
        name: "description",
        content:
          "Gửi lời mời vào không gian làm việc và gán sẵn vai trò cùng quyền quy trình mặc định.",
      },
      { property: "og:title", content: "Mời người dùng vào workspace · UNIWORK" },
      {
        property: "og:description",
        content: "Mời thành viên mới và thiết lập quyền mặc định ngay khi gửi lời mời.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceInvitePage,
});

const TENANT_ROLES = [
  { value: "member", label: "Thành viên" },
  { value: "manager", label: "Quản lý" },
  { value: "tenant_admin", label: "Quản trị tổ chức" },
  { value: "guest", label: "Khách" },
] as const;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Đang chờ", cls: "border-warning/30 bg-warning/10 text-warning" },
  accepted: { label: "Đã chấp nhận", cls: "border-success/30 bg-success/10 text-success" },
  expired: { label: "Hết hạn", cls: "border-border bg-muted text-muted-foreground" },
  revoked: { label: "Đã thu hồi", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const TENANT_ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

type InviteTab = "pending" | "accepted" | "closed";

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function effectiveStatus(i: WorkspaceInviteRow) {
  return i.isExpired ? "expired" : i.status;
}

function WorkspaceInvitePage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();

  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  const activeWs = wsId ?? workspaces.data?.[0]?.id;

  const [email, setEmail] = useState("");
  const [tenantRole, setTenantRole] =
    useState<(typeof TENANT_ROLES)[number]["value"]>("member");
  const [workspaceRole, setWorkspaceRole] = useState<"owner" | "member">("member");
  const [canEdit, setCanEdit] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [canRun, setCanRun] = useState(true);
  const [ttlDays, setTtlDays] = useState(7);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const [tab, setTab] = useState<InviteTab>("pending");

  const invites = useQuery({
    queryKey: ["workspace-invites", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => listWorkspaceInvites({ data: { workspaceId: activeWs! } }),
  });

  const access = useQuery({
    queryKey: ["workspace-invite-access", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => getWorkspaceInviteAccess({ data: { workspaceId: activeWs! } }),
  });
  const canManage = access.data?.canManage ?? false;

  const emailTemplates = useQuery({
    queryKey: ["invite-email-templates", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => listInviteEmailTemplates({ data: { workspaceId: activeWs! } }),
  });

  const copyInviteEmail = (
    url: string,
    to: string,
    forRole: InviteRole,
    perms: { canEdit: boolean; canPublish: boolean; canRun: boolean },
    wsRole: string,
  ) => {
    const tpl =
      (emailTemplates.data ?? []).find((t) => t.role === forRole) ?? defaultTemplate(forRole);
    const wsName = (workspaces.data ?? []).find((w) => w.id === activeWs)?.name ?? "workspace";
    const text = inviteEmailPlainText(tpl, {
      inviteeEmail: to,
      inviterName: "Quản trị viên",
      tenantName: "tổ chức của bạn",
      workspaceName: wsName,
      roleLabel: ROLE_LABEL_MAP[forRole] ?? forRole,
      workspaceRoleLabel: wsRole === "owner" ? "Chủ workspace" : "Thành viên",
      permissions: permissionsSummary(perms),
      expiresAt: new Date(Date.now() + ttlDays * 86400_000).toLocaleString("vi-VN"),
      inviteUrl: url,
    });
    void navigator.clipboard.writeText(`Tiêu đề: ${tpl.subject}\n\n${text}`);
    toast.success("Đã sao chép nội dung email mời");
  };

  const revoke = useMutation({
    mutationFn: (invitationId: string) => revokeWorkspaceInvite({ data: { invitationId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-invites", activeWs] });
      toast.success("Đã thu hồi lời mời");
    },
    onError: (e: Error) => toast.error(e.message || "Không thu hồi được lời mời"),
  });

  const resend = useMutation({
    mutationFn: (invitationId: string) => resendWorkspaceInvite({ data: { invitationId, ttlDays } }),
    onSuccess: async (res) => {
      setLastLink(`${window.location.origin}/invite/${res.token}`);
      await qc.invalidateQueries({ queryKey: ["workspace-invites", activeWs] });
      toast.success("Đã tạo lại lời mời", { description: `Gửi liên kết mới tới ${res.email}.` });
    },
    onError: (e: Error) => toast.error(e.message || "Không gửi lại được lời mời"),
  });

  const grouped = useMemo(() => {
    const all = (invites.data ?? []) as WorkspaceInviteRow[];
    return {
      pending: all.filter((i) => effectiveStatus(i) === "pending"),
      accepted: all.filter((i) => effectiveStatus(i) === "accepted"),
      closed: all.filter((i) => ["expired", "revoked"].includes(effectiveStatus(i))),
    };
  }, [invites.data]);

  const send = useMutation({
    mutationFn: () =>
      inviteUserToWorkspace({
        data: {
          workspaceId: activeWs!,
          email: email.trim(),
          tenantRole,
          workspaceRole,
          canEdit,
          canPublish,
          canRun,
          ttlDays,
        },
      }),
    onSuccess: async (res) => {
      const url = `${window.location.origin}/invite/${res.token}`;
      setLastLink(url);
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["workspace-invites", activeWs] });
      toast.success("Đã tạo lời mời", { description: "Sao chép liên kết và gửi cho người dùng." });
    },
    onError: (e: Error) => toast.error(e.message || "Không tạo được lời mời"),
  });

  const canSubmit = useMemo(
    () => Boolean(activeWs) && canManage && /.+@.+\..+/.test(email.trim()) && !send.isPending,
    [activeWs, canManage, email, send.isPending],
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại
          </Link>

          <header className="mb-8">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <UserPlus className="h-6 w-6 text-primary" />
              Mời người dùng vào workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gán sẵn vai trò và quyền quy trình mặc định — hệ thống tự áp dụng ngay khi người được
              mời chấp nhận.
            </p>
          </header>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Không gian làm việc</span>
                <select
                  value={activeWs ?? ""}
                  onChange={(e) => setWsId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {(workspaces.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Email người được mời</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ten@congty.com"
                    className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Vai trò trong tổ chức</span>
                <select
                  value={tenantRole}
                  onChange={(e) =>
                    setTenantRole(e.target.value as (typeof TENANT_ROLES)[number]["value"])
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {TENANT_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Vai trò trong workspace</span>
                <select
                  value={workspaceRole}
                  onChange={(e) => setWorkspaceRole(e.target.value as "owner" | "member")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="member">Thành viên</option>
                  <option value="owner">Chủ sở hữu</option>
                </select>
              </label>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" /> Quyền quy trình mặc định
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: "Chỉnh sửa", value: canEdit, set: setCanEdit, hint: "Sửa bước & trigger" },
                  {
                    label: "Phát hành",
                    value: canPublish,
                    set: setCanPublish,
                    hint: "Đưa lên bản chính thức",
                  },
                  { label: "Chạy", value: canRun, set: setCanRun, hint: "Khởi chạy / chạy thử" },
                ].map((p) => (
                  <label
                    key={p.label}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={p.value}
                      onChange={(e) => p.set(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Hiệu lực lời mời</span>
                <select
                  value={ttlDays}
                  onChange={(e) => setTtlDays(Number(e.target.value))}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {[1, 3, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d} ngày
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => send.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity disabled:opacity-50"
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Gửi lời mời
              </button>
            </div>

            {lastLink ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{lastLink}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastLink);
                    toast.success("Đã sao chép liên kết mời");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
                >
                  <Copy className="h-3.5 w-3.5" /> Sao chép
                </button>
              </div>
            ) : null}
          </section>

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Lời mời của workspace này
              </h2>
              <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs">
                {(
                  [
                    { id: "pending" as const, label: "Đang chờ", n: grouped.pending.length },
                    { id: "accepted" as const, label: "Đã chấp nhận", n: grouped.accepted.length },
                    { id: "closed" as const, label: "Hết hạn / thu hồi", n: grouped.closed.length },
                  ]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      tab === t.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label} ({t.n})
                  </button>
                ))}
              </div>
            </div>

            {!canManage && access.isFetched ? (
              <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Chỉ chủ tổ chức hoặc quản trị tổ chức mới có
                thể tạo, thu hồi hoặc gửi lại lời mời.
              </p>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {invites.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Đang tải…</p>
              ) : grouped[tab].length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {tab === "pending"
                    ? "Không có lời mời nào đang chờ."
                    : tab === "accepted"
                      ? "Chưa có ai chấp nhận lời mời."
                      : "Không có lời mời hết hạn hoặc bị thu hồi."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {grouped[tab].map((i) => {
                    const st = effectiveStatus(i);
                    const meta = STATUS_META[st] ?? STATUS_META["pending"]!;
                    return (
                      <li
                        key={i.invitationId}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-medium">
                            {st === "accepted" ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                            ) : (
                              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            {i.email}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {TENANT_ROLE_LABEL[i.tenantRole] ?? i.tenantRole} ·{" "}
                            {i.workspaceRole === "owner" ? "Chủ sở hữu workspace" : "Thành viên workspace"} ·{" "}
                            {[
                              i.canEdit ? "Chỉnh sửa" : null,
                              i.canPublish ? "Phát hành" : null,
                              i.canRun ? "Chạy" : null,
                            ]
                              .filter(Boolean)
                              .join(", ") || "Không có quyền quy trình"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {st === "accepted"
                              ? `Chấp nhận lúc ${fmtDateTime(i.acceptedAt)}`
                              : `Gửi ${fmtDateTime(i.createdAt)} · Hết hạn ${fmtDateTime(i.expiresAt)}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${meta.cls}`}>
                            {meta.label}
                          </span>
                          {canManage && st === "pending" ? (
                            <button
                              type="button"
                              onClick={() => revoke.mutate(i.invitationId)}
                              disabled={revoke.isPending}
                              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Thu hồi
                            </button>
                          ) : null}
                          {canManage && st !== "accepted" ? (
                            <button
                              type="button"
                              onClick={() => resend.mutate(i.invitationId)}
                              disabled={resend.isPending}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                            >
                              {resend.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Gửi lại
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}