import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  inviteUserToWorkspace,
  listWorkspaceInvites,
  type WorkspaceInviteRow,
} from "@/lib/api/workspace-invites.functions";

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

const STATUS_LABEL: Record<string, string> = {
  pending: "Đang chờ",
  accepted: "Đã tham gia",
  expired: "Hết hạn",
  revoked: "Đã thu hồi",
};

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

  const invites = useQuery({
    queryKey: ["workspace-invites", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => listWorkspaceInvites({ data: { workspaceId: activeWs! } }),
  });

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
    () => Boolean(activeWs) && /.+@.+\..+/.test(email.trim()) && !send.isPending,
    [activeWs, email, send.isPending],
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
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Lời mời của workspace này
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {invites.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Đang tải…</p>
              ) : (invites.data ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Chưa có lời mời nào.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(invites.data as WorkspaceInviteRow[]).map((i) => (
                    <li
                      key={i.invitationId}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{i.email}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {i.workspaceRole === "owner" ? "Chủ sở hữu" : "Thành viên"} ·{" "}
                          {[
                            i.canEdit ? "Chỉnh sửa" : null,
                            i.canPublish ? "Phát hành" : null,
                            i.canRun ? "Chạy" : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Không có quyền quy trình"}
                        </p>
                      </div>
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                        {STATUS_LABEL[i.status] ?? i.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}