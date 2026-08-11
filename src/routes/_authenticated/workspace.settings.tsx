import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Settings2, ShieldCheck, Users } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  listWorkspaces,
  getWorkspaceSettings,
  updateWorkspace,
} from "@/lib/api/workspaces.functions";

export const Route = createFileRoute("/_authenticated/workspace/settings")({
  head: () => ({
    meta: [
      { title: "Cài đặt workspace · UNIWORK" },
      {
        name: "description",
        content: "Cập nhật tên, mô tả, múi giờ và chính sách truy cập của không gian làm việc.",
      },
      { property: "og:title", content: "Cài đặt workspace · UNIWORK" },
      {
        property: "og:description",
        content: "Quản lý thông tin và chính sách truy cập cơ bản cho workspace của bạn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceSettingsPage,
});

const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/Paris",
  "UTC",
];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60";

function WorkspaceSettingsPage() {
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
  const [visibility, setVisibility] = useState<"private" | "tenant">("private");
  const [defaultMemberRole, setDefaultMemberRole] = useState<"member" | "owner">("member");
  const [allowMemberInvites, setAllowMemberInvites] = useState(false);
  const [defaultTaskPriority, setDefaultTaskPriority] = useState<
    "low" | "normal" | "high" | "urgent"
  >("normal");
  const [defaultTaskDueDays, setDefaultTaskDueDays] = useState(3);
  const [defaultTaskTitlePrefix, setDefaultTaskTitlePrefix] = useState("");

  const workspacesQ = useQuery({ queryKey: ["workspaces", "list"], queryFn: () => listWorkspaces() });
  const workspaces = useMemo(() => workspacesQ.data ?? [], [workspacesQ.data]);

  useEffect(() => {
    if (!workspaceId && workspaces.length) setWorkspaceId(workspaces[0]!.id);
  }, [workspaces, workspaceId]);

  const settingsQ = useQuery({
    queryKey: ["workspace", workspaceId, "settings"],
    queryFn: () => getWorkspaceSettings({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setName(s.name);
    setDescription(s.description);
    setTimezone(s.timezone);
    setVisibility(s.visibility);
    setDefaultMemberRole(s.defaultMemberRole);
    setAllowMemberInvites(s.allowMemberInvites);
    setDefaultTaskPriority(s.defaultTaskPriority);
    setDefaultTaskDueDays(s.defaultTaskDueDays);
    setDefaultTaskTitlePrefix(s.defaultTaskTitlePrefix);
  }, [settingsQ.data]);

  const isOwner = Boolean(settingsQ.data?.isOwner);

  const saveM = useMutation({
    mutationFn: () =>
      updateWorkspace({
        data: {
          workspaceId,
          name: name.trim(),
          description: description.trim(),
          timezone,
          visibility,
          defaultMemberRole,
          allowMemberInvites,
          defaultTaskPriority,
          defaultTaskDueDays,
          defaultTaskTitlePrefix: defaultTaskTitlePrefix.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu cài đặt workspace");
      void qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "settings"] });
      void qc.invalidateQueries({ queryKey: ["workspaces", "list"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được cài đặt"),
  });

  const canSave = isOwner && name.trim().length >= 2 && !saveM.isPending;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <AppTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách workspace
          </Link>

          <header className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Settings2 className="h-6 w-6 text-primary" /> Cài đặt workspace
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cập nhật thông tin cơ bản và chính sách truy cập cho không gian làm việc.
              </p>
            </div>
            <Link
              to="/workspace/members"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Users className="h-4 w-4" /> Thành viên
            </Link>
          </header>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium">Chọn workspace</label>
            <select
              className={`${inputCls} mt-2`}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.archived ? " (đã lưu trữ)" : ""}
                </option>
              ))}
            </select>
          </div>

          {settingsQ.isLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cài đặt…
            </div>
          ) : !settingsQ.data ? (
            <p className="mt-6 text-sm text-muted-foreground">Chưa có workspace nào để cấu hình.</p>
          ) : (
            <form
              className="mt-6 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSave) saveM.mutate();
              }}
            >
              {!isOwner && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4" />
                  Chỉ chủ sở hữu workspace mới được chỉnh sửa các thiết lập này.
                </div>
              )}

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Thông tin chung</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="ws-name">
                      Tên workspace
                    </label>
                    <input
                      id="ws-name"
                      className={`${inputCls} mt-1.5`}
                      value={name}
                      disabled={!isOwner}
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="ws-desc">
                      Mô tả
                    </label>
                    <textarea
                      id="ws-desc"
                      rows={3}
                      className={`${inputCls} mt-1.5 resize-y`}
                      value={description}
                      disabled={!isOwner}
                      maxLength={500}
                      placeholder="Mục đích, phạm vi hoạt động của workspace…"
                      onChange={(e) => setDescription(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{description.length}/500 ký tự</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="ws-tz">
                      Múi giờ
                    </label>
                    <select
                      id="ws-tz"
                      className={`${inputCls} mt-1.5`}
                      value={timezone}
                      disabled={!isOwner}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">Chính sách truy cập</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="ws-visibility">
                      Phạm vi hiển thị
                    </label>
                    <select
                      id="ws-visibility"
                      className={`${inputCls} mt-1.5`}
                      value={visibility}
                      disabled={!isOwner}
                      onChange={(e) => setVisibility(e.target.value as "private" | "tenant")}
                    >
                      <option value="private">Riêng tư — chỉ thành viên được mời</option>
                      <option value="tenant">Toàn tổ chức — mọi thành viên tổ chức đều thấy</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="ws-role">
                      Vai trò mặc định khi thêm thành viên
                    </label>
                    <select
                      id="ws-role"
                      className={`${inputCls} mt-1.5`}
                      value={defaultMemberRole}
                      disabled={!isOwner}
                      onChange={(e) => setDefaultMemberRole(e.target.value as "member" | "owner")}
                    >
                      <option value="member">Thành viên</option>
                      <option value="owner">Chủ sở hữu</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={allowMemberInvites}
                      disabled={!isOwner}
                      onChange={(e) => setAllowMemberInvites(e.target.checked)}
                    />
                    <span className="text-sm">
                      Cho phép thành viên mời người khác
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Khi tắt, chỉ chủ sở hữu workspace được gửi lời mời.
                      </span>
                    </span>
                  </label>
                </div>
              </section>

              <div className="flex justify-end">
                {null}
                <button
                  type="submit"
                  disabled={!canSave}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saveM.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Lưu thay đổi
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}