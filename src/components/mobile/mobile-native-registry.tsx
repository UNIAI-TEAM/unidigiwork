import { useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Bot, BriefcaseBusiness, Building2, ChartNoAxesCombined, ChevronLeft, ClipboardList, FileClock, Settings, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { getMyAdminAccess, getAdminStats, listAllUsers } from "@/lib/api/admin.functions";
import { listNotifications } from "@/lib/api/notifications.functions";
import { listWorkspaceAuditEvents, listWorkspaces, type WorkspaceAuditEventDTO, type WorkspaceListItemDTO } from "@/lib/api/workspaces.functions";
import { useI18n } from "@/lib/i18n";
import { toMobileHref } from "@/lib/mobile-routes";

const destinations = [
  { title: "Thông báo", subtitle: "Cập nhật cần chú ý", href: "/m/notifications", icon: Bell },
  { title: "Không gian", subtitle: "Thành viên, nhãn và cài đặt", href: "/m/workspace", icon: Building2 },
  { title: "Vận hành công việc", subtitle: "Phân công và theo dõi", href: "/m/task-ops", icon: BriefcaseBusiness },
  { title: "Danh mục công việc", subtitle: "Loại công việc của tổ chức", href: "/m/work-catalog", icon: ClipboardList },
  { title: "Theo dõi AI", subtitle: "Hoạt động và hiệu quả", href: "/m/ai-brain/tracking", icon: Bot },
  { title: "Điều hành chuyên sâu", subtitle: "KPI, giao ban và đề xuất", href: "/m/ceo/standup", icon: ChartNoAxesCombined },
  { title: "Quản trị hệ thống", subtitle: "Người dùng, tenant và vận hành", href: "/m/admin", icon: ShieldCheck },
];

const sectionNames: Record<string, string> = {
  users: "Người dùng", accounts: "Tài khoản", plans: "Gói dịch vụ", cohorts: "Nhóm khách hàng", leads: "Khách hàng tiềm năng", economics: "Hiệu quả kinh doanh", quota: "Hạn mức", rules: "Quy tắc", backup: "Sao lưu", webhooks: "Webhook", trace: "Truy vết", proof: "Bằng chứng vận hành", knowledge: "Quản trị tri thức", "document-access": "Quyền tài liệu", tenant: "Quản trị tổ chức", platform: "Quản trị doanh nghiệp", "ai-actions": "Hành động AI", "ai-context": "Ngữ cảnh AI", members: "Thành viên", invite: "Mời thành viên", "invite-emails": "Mẫu email mời", tags: "Nhãn", settings: "Cài đặt không gian", audit: "Nhật ký không gian", "kpi-history": "Lịch sử KPI", "proposal-tracking": "Theo dõi đề xuất", standup: "Giao ban", "task-tracking": "Theo dõi công việc", tracking: "Theo dõi AI",
};

function NativePage({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24"><header className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur"><Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => history.back()}><ChevronLeft className="h-5 w-5" /><span className="sr-only">Quay lại</span></Button><h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1><Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => void navigate({ to: "/m/settings" })}><Settings className="h-5 w-5" /><span className="sr-only">Cài đặt</span></Button></header>{children}</div>;
}

function LoadingRows() { return <div className="grid gap-2">{[0, 1, 2].map((x) => <Skeleton key={x} className="h-20 rounded-xl" />)}</div>; }

function NotificationsView({ detailId }: { detailId?: string }) {
  const fn = useServerFn(listNotifications), navigate = useNavigate();
  const query = useQuery({ queryKey: ["m-notifications"], queryFn: () => fn() });
  const rows = query.data ?? [], selected = detailId ? rows.find((row) => row.id === detailId) : undefined;
  if (query.isLoading) return <NativePage title="Thông báo"><LoadingRows /></NativePage>;
  if (detailId && selected) return <NativePage title={selected.title}><article className="space-y-4"><p className="text-sm leading-relaxed">{selected.body}</p><p className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString("vi-VN")}</p>{selected.link ? <Button className="min-h-11" onClick={() => void navigate({ to: toMobileHref(selected.link) as never })}>Mở nội dung</Button> : null}</article></NativePage>;
  return <NativePage title="Thông báo"><div className="grid gap-2">{rows.map((row) => <MobileListItem key={row.id} title={row.title} subtitle={row.body ?? undefined} meta={new Date(row.created_at).toLocaleString("vi-VN")} icon={<Bell className="h-5 w-5" />} badge={!row.is_read ? <Badge>Mới</Badge> : undefined} onClick={() => void navigate({ to: `/m/notifications/${row.id}` as never })} />)}</div>{!rows.length ? <p className="py-12 text-center text-sm text-muted-foreground">Chưa có thông báo.</p> : null}</NativePage>;
}

function WorkspaceView({ section }: { section?: string }) {
  const workspaceFn = useServerFn(listWorkspaces), auditFn = useServerFn(listWorkspaceAuditEvents);
  const workspaces = useQuery({ queryKey: ["m-workspaces"], queryFn: () => workspaceFn() });
  const audit = useQuery({ queryKey: ["m-workspace-audit"], queryFn: () => auditFn({ data: { limit: 100 } }), enabled: section === "audit" });
  if (workspaces.isLoading || audit.isLoading) return <NativePage title="Không gian"><LoadingRows /></NativePage>;
  const rows: Array<WorkspaceListItemDTO | WorkspaceAuditEventDTO> = section === "audit" ? (audit.data ?? []) : (workspaces.data ?? []);
  return <NativePage title={sectionNames[section ?? ""] ?? "Không gian làm việc"}><div className="grid gap-2">{rows.map((row) => "workspaceName" in row ? <MobileListItem key={row.id} title={row.workspaceName} subtitle={row.actorName} meta={new Date(row.occurredAt).toLocaleString("vi-VN")} icon={<FileClock className="h-5 w-5" />} /> : <MobileListItem key={row.id} title={row.name} subtitle={`${row.members} thành viên · ${row.timezone}`} meta={row.archived ? "Đã lưu trữ" : "Đang hoạt động"} icon={<Building2 className="h-5 w-5" />} badge={row.isOwner ? <Badge variant="outline">Chủ sở hữu</Badge> : undefined} />)}</div>{!rows.length ? <p className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p> : null}</NativePage>;
}

function AdminView({ section }: { section?: string }) {
  const accessFn = useServerFn(getMyAdminAccess), statsFn = useServerFn(getAdminStats), usersFn = useServerFn(listAllUsers);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const stats = useQuery({ queryKey: ["m-admin-stats"], queryFn: () => statsFn(), enabled: access.data?.canRead === true });
  const users = useQuery({ queryKey: ["m-admin-users"], queryFn: () => usersFn(), enabled: access.data?.canRead === true && (section === "users" || section === "accounts") });
  if (access.isLoading || stats.isLoading || users.isLoading) return <NativePage title="Quản trị"><LoadingRows /></NativePage>;
  if (!access.data?.canRead) return <NativePage title="Quản trị"><p className="py-12 text-center text-sm text-muted-foreground">Bạn không có quyền truy cập.</p></NativePage>;
  if (section === "users" || section === "accounts") return <NativePage title={sectionNames[section]}><div className="grid gap-2">{(users.data ?? []).map((user) => <MobileListItem key={user.id} title={user.display_name ?? user.email} subtitle={user.email} meta={user.roles.join(" · ") || "user"} icon={<Users className="h-5 w-5" />} />)}</div></NativePage>;
  const d = stats.data;
  return <NativePage title={sectionNames[section ?? ""] ?? "Quản trị hệ thống"}><div className="grid grid-cols-2 gap-2">{d ? [["Người dùng", d.users], ["Không gian", d.workspaces], ["Tài liệu", d.documents], ["Thông báo", d.notifications], ["Quy tắc", d.rules], ["Email", d.email_threads]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>) : null}</div>{section && section !== "overview" ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Dữ liệu chi tiết chưa có trong phạm vi hiện tại.</p> : null}</NativePage>;
}

function RegistryHub({ title }: { title: string }) { const navigate = useNavigate(); return <NativePage title={title}><div className="grid gap-2">{destinations.map((item) => <MobileListItem key={item.href} title={item.title} subtitle={item.subtitle} icon={<item.icon className="h-5 w-5" />} onClick={() => void navigate({ to: item.href as never })} />)}</div></NativePage>; }

export function MobileNativeRegistryPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { lang } = useI18n();
  const parts = useMemo(() => pathname.replace(/^\/m\/?/, "").split("/").filter(Boolean), [pathname]);
  const [root, ...rest] = parts, section = rest[0];
  if (root === "notifications") return <NotificationsView detailId={section} />;
  if (root === "workspace") return <WorkspaceView section={section} />;
  if (root === "admin") return <AdminView section={section} />;
  const title = root === "email" ? "Email" : root === "ai-market" ? "Chợ AI" : root === "ceo" ? sectionNames[section ?? ""] ?? "Điều hành" : root === "ai-brain" ? sectionNames[section ?? ""] ?? "Bộ não AI" : root === "task-ops" || root === "work-board" ? "Vận hành công việc" : root === "work-catalog" ? "Danh mục công việc" : root === "reports" ? "Báo cáo" : lang === "en" ? "Explore" : "Khám phá";
  return <RegistryHub title={title} />;
}