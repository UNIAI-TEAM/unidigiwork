import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { useActiveTenant, useTenantMembers } from "@/features/tenants/hooks";
import type { TenantRole } from "@/contracts/tenants/tenant";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileAdminLayout, MobileAdminLoading, MobileAdminMessage, ReadOnlyNotice } from "@/components/mobile/mobile-admin-layout";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/roles")({ head: () => ({ meta: [
  { title: "Vai trò tổ chức mobile — UNIWORK" }, { name: "description", content: "Xem và cấp vai trò theo tổ chức trên PWA UNIWORK." },
  { property: "og:title", content: "Vai trò tổ chức mobile — UNIWORK" }, { property: "og:description", content: "Xem và cấp vai trò theo tổ chức trên PWA UNIWORK." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: MobileRoles });
const ROLES: TenantRole[] = ["tenant_owner", "tenant_admin", "manager", "member", "guest"];
function MobileRoles() {
  const { t } = useI18n(), navigate = useNavigate(), active = useActiveTenant(), members = useTenantMembers(active.data?.tenantId);
  if (active.isLoading || members.isLoading) return <MobileAdminLayout title={t("m.admin.roles")} backTo="/m/admin"><MobileAdminLoading /></MobileAdminLayout>;
  if (!active.data) return <MobileAdminLayout title={t("m.admin.roles")} backTo="/m/admin"><MobileAdminMessage>{t("m.admin.noActiveOrganization")}</MobileAdminMessage></MobileAdminLayout>;
  const canManage = active.data.role === "tenant_owner" || active.data.role === "tenant_admin";
  return <MobileAdminLayout title={t("m.admin.roles")} subtitle={t("m.admin.rolesHint")} backTo="/m/admin">{!canManage ? <ReadOnlyNotice /> : null}<div className="grid gap-3">{ROLES.map((role) => <section key={role} className="rounded-xl border border-border p-4"><div className="flex items-start gap-3">{role === "tenant_owner" ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}<div className="min-w-0 flex-1"><h2 className="font-medium">{t(`m.admin.role.${role}` as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(`m.admin.role.${role}.desc` as never)}</p></div><Badge variant="outline">{(members.data ?? []).filter((member) => member.role === role).length}</Badge></div></section>)}</div><section><h2 className="mb-2 text-sm font-semibold">{t("m.admin.members")}</h2><div className="grid gap-2">{(members.data ?? []).map((member) => <MobileListItem key={member.id} title={member.display_name ?? member.email ?? member.user_id.slice(0, 8)} subtitle={t(`m.admin.role.${member.role}` as never)} icon={<UserRound className="h-5 w-5" />} badge={<Badge variant="outline">{t(`m.admin.status.${member.status}` as never)}</Badge>} onClick={() => void navigate({ to: "/m/admin/organization/$id" as never, params: { id: member.user_id } as never })} />)}</div></section></MobileAdminLayout>;
}