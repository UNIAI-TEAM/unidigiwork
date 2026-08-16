import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  History,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
  User,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import { getWorkspaceInviteAccess } from "@/lib/api/workspace-invites.functions";
import {
  listInviteEmailTemplates,
  saveInviteEmailTemplate,
  resetInviteEmailTemplate,
  listInviteEmailTemplateVersions,
  restoreInviteEmailTemplateVersion,
} from "@/lib/api/invite-email-templates.functions";
import {
  INVITE_EMAIL_VARIABLES,
  INVITE_ROLES,
  INVITE_ROLE_LABEL,
  defaultTemplate,
  inviteEmailPlainText,
  renderInviteEmail,
  type InviteEmailTemplate,
  type InviteRole,
} from "@/lib/invite-email-template";

export const Route = createFileRoute("/_authenticated/workspace/invite-emails")({
  head: () => ({
    meta: [
      { title: "Mẫu email mời theo vai trò · UNIWORK" },
      {
        name: "description",
        content:
          "Soạn và tùy chỉnh tiêu đề, nội dung và nút chấp nhận của email mời workspace cho từng vai trò.",
      },
      { property: "og:title", content: "Mẫu email mời theo vai trò · UNIWORK" },
      {
        property: "og:description",
        content: "Chỉnh sửa nội dung email mời để người nhận thấy đúng vai trò và quyền được cấp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InviteEmailTemplatesPage,
});

function InviteEmailTemplatesPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();

  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  const activeWs = wsId ?? workspaces.data?.[0]?.id;
  const activeWsName =
    (workspaces.data ?? []).find((w) => w.id === activeWs)?.name ?? "Không gian làm việc";

  const access = useQuery({
    queryKey: ["workspace-invite-access", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => getWorkspaceInviteAccess({ data: { workspaceId: activeWs! } }),
  });
  const canManage = access.data?.canManage ?? false;

  const templates = useQuery({
    queryKey: ["invite-email-templates", activeWs],
    enabled: Boolean(activeWs),
    queryFn: () => listInviteEmailTemplates({ data: { workspaceId: activeWs! } }),
  });

  const [role, setRole] = useState<InviteRole>("member");
  const [draft, setDraft] = useState<InviteEmailTemplate>(defaultTemplate("member"));

  const serverTpl = useMemo(
    () => (templates.data ?? []).find((t) => t.role === role) ?? defaultTemplate(role),
    [templates.data, role],
  );

  useEffect(() => {
    setDraft(serverTpl);
  }, [serverTpl]);

  const dirty = useMemo(
    () =>
      draft.subject !== serverTpl.subject ||
      draft.heading !== serverTpl.heading ||
      draft.body !== serverTpl.body ||
      draft.ctaLabel !== serverTpl.ctaLabel ||
      draft.footer !== serverTpl.footer ||
      draft.isActive !== serverTpl.isActive,
    [draft, serverTpl],
  );

  const save = useMutation({
    mutationFn: () =>
      saveInviteEmailTemplate({
        data: {
          workspaceId: activeWs!,
          role,
          subject: draft.subject,
          heading: draft.heading,
          body: draft.body,
          ctaLabel: draft.ctaLabel,
          footer: draft.footer,
          isActive: draft.isActive,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invite-email-templates", activeWs] });
      toast.success("Đã lưu mẫu email", {
        description: `Áp dụng cho vai trò ${INVITE_ROLE_LABEL[role]}.`,
      });
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được mẫu email"),
  });

  const reset = useMutation({
    mutationFn: () => resetInviteEmailTemplate({ data: { workspaceId: activeWs!, role } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invite-email-templates", activeWs] });
      await qc.invalidateQueries({ queryKey: ["invite-email-template-versions", activeWs, role] });
      setDraft(defaultTemplate(role));
      toast.success("Đã khôi phục mẫu mặc định");
    },
    onError: (e: Error) => toast.error(e.message || "Không khôi phục được mẫu"),
  });

  const versions = useQuery({
    queryKey: ["invite-email-template-versions", activeWs, role],
    enabled: Boolean(activeWs),
    queryFn: () =>
      listInviteEmailTemplateVersions({ data: { workspaceId: activeWs!, role, limit: 30 } }),
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      restoreInviteEmailTemplateVersion({ data: { workspaceId: activeWs!, versionId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invite-email-templates", activeWs] });
      await qc.invalidateQueries({ queryKey: ["invite-email-template-versions", activeWs, role] });
      toast.success("Đã khôi phục phiên bản");
    },
    onError: (e: Error) => toast.error(e.message || "Không khôi phục được phiên bản"),
  });

  const actionLabel: Record<string, string> = {
    create: "Tạo mới",
    update: "Cập nhật",
    reset: "Về mặc định",
  };

  const previewVars = {
    inviteeEmail: "an.nguyen@congty.com",
    inviterName: "Quản trị viên",
    tenantName: "Tổ chức của bạn",
    workspaceName: activeWsName,
    roleLabel: INVITE_ROLE_LABEL[role] ?? role,
    workspaceRoleLabel: role === "tenant_admin" ? "Chủ workspace" : "Thành viên",
    permissions: "chỉnh sửa quy trình, chạy quy trình",
    expiresAt: new Date(Date.now() + 7 * 86400_000).toLocaleString("vi-VN"),
    inviteUrl: `${typeof window === "undefined" ? "" : window.location.origin}/invite/xxxxxxxxxxxx`,
  };
  const preview = renderInviteEmail(draft, previewVars);

  const fieldCls =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-none flex-1 px-4 py-8 sm:px-6">
          <Link
            to="/workspace/invite"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại lời mời
          </Link>

          <header className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Mail className="h-6 w-6 text-primary" />
              Mẫu email mời theo vai trò
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tùy chỉnh tiêu đề, nội dung và nút chấp nhận cho từng vai trò để người nhận hiểu rõ
              quyền họ sẽ nhận được.
            </p>
          </header>

          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Không gian làm việc</span>
              <select
                value={activeWs ?? ""}
                onChange={(e) => setWsId(e.target.value)}
                className={fieldCls}
              >
                {(workspaces.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <div className="flex flex-wrap gap-1.5">
                {INVITE_ROLES.map((r) => {
                  const custom = (templates.data ?? []).find((t) => t.role === r.value)?.isCustom;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        role === r.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-surface-2"
                      }`}
                    >
                      {r.label}
                      {custom ? (
                        <span className="rounded-full bg-success/15 px-1.5 text-[10px] text-success">
                          tùy chỉnh
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {!canManage && access.isFetched ? (
            <p className="mb-5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <ShieldCheck className="h-4 w-4" /> Chỉ chủ tổ chức hoặc quản trị tổ chức mới được
              chỉnh sửa mẫu email.
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold">
                Nội dung cho vai trò {INVITE_ROLE_LABEL[role]}
              </h2>

              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Tiêu đề email</span>
                  <input
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    disabled={!canManage}
                    className={fieldCls}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Tiêu đề lớn trong email</span>
                  <input
                    value={draft.heading}
                    onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
                    disabled={!canManage}
                    className={fieldCls}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Nội dung</span>
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    disabled={!canManage}
                    rows={10}
                    className={`${fieldCls} font-mono text-xs leading-relaxed`}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Nhãn nút chấp nhận (token)</span>
                    <input
                      value={draft.ctaLabel}
                      onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                      disabled={!canManage}
                      className={fieldCls}
                    />
                  </label>
                  <label className="flex items-end gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                      disabled={!canManage}
                      className="mb-2.5 h-4 w-4 rounded border-input"
                    />
                    <span className="mb-2 font-medium">Áp dụng mẫu này</span>
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Chân trang</span>
                  <textarea
                    value={draft.footer}
                    onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
                    disabled={!canManage}
                    rows={3}
                    className={`${fieldCls} text-xs`}
                  />
                </label>
              </div>

              <div className="mt-5 rounded-lg border border-dashed border-border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Biến động — bấm để chèn vào nội dung
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {INVITE_EMAIL_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      title={v.hint}
                      disabled={!canManage}
                      onClick={() => setDraft({ ...draft, body: `${draft.body}{{${v.key}}}` })}
                      className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] hover:bg-muted"
                    >
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canManage || !dirty || save.isPending}
                  onClick={() => save.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Lưu mẫu
                </button>
                <button
                  type="button"
                  disabled={!canManage || reset.isPending}
                  onClick={() => reset.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" /> Khôi phục mặc định
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteEmailPlainText(draft, previewVars));
                    toast.success("Đã sao chép nội dung email mẫu");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium"
                >
                  <Copy className="h-4 w-4" /> Sao chép nội dung
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-surface-2 p-5">
              <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Xem trước</h2>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <p className="mb-4 border-b border-border pb-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Tiêu đề:</span> {preview.subject}
                </p>
                <h3 className="text-lg font-semibold tracking-tight">{preview.heading}</h3>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {preview.body}
                </div>
                <div className="mt-5">
                  <span className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                    {preview.ctaLabel}
                  </span>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {preview.inviteUrl}
                  </p>
                </div>
                {preview.footer ? (
                  <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                    {preview.footer}
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" />
              Lịch sử phiên bản · {INVITE_ROLE_LABEL[role]}
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Mỗi lần lưu sẽ tạo một phiên bản mới. Bạn có thể xem nội dung và khôi phục lại.
            </p>

            {versions.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử…
              </p>
            ) : (versions.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Chưa có thay đổi nào được ghi nhận cho vai trò này.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(versions.data ?? []).map((v) => (
                  <li key={v.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">
                        v{v.version}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {actionLabel[v.action] ?? v.action}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        {v.changedByName ?? "Không rõ"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString("vi-VN")}
                      </span>
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                        >
                          {expanded === v.id ? "Ẩn" : "Xem"}
                        </button>
                        <button
                          type="button"
                          disabled={!canManage || restore.isPending}
                          onClick={() => restore.mutate(v.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-surface-2"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Khôi phục
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-sm">{v.subject}</p>
                    {expanded === v.id ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-xs">
                        <p>
                          <span className="font-medium">Tiêu đề lớn:</span> {v.heading}
                        </p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{v.body}</p>
                        <p>
                          <span className="font-medium">Nút:</span> {v.ctaLabel}
                        </p>
                        {v.footer ? (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Chân trang:</span>{" "}
                            {v.footer}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}