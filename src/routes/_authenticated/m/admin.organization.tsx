import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown, MailPlus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveTenant,
  useChangeTenantStatus,
  useCreateInvitation,
  useRevokeInvitation,
  useTenantInvitations,
  useTenantMembers,
} from "@/features/tenants/hooks";
import type { TenantRole } from "@/contracts/tenants/tenant";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileAdminLayout, MobileAdminLoading, MobileAdminMessage, ReadOnlyNotice } from "@/components/mobile/mobile-admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/organization")({
  head: () => ({ meta: [
    { title: "Quản lý tổ chức mobile — UNIWORK" },
    { name: "description", content: "Quản lý thành viên, lời mời và trạng thái tổ chức trên PWA UNIWORK." },
    { property: "og:title", content: "Quản lý tổ chức mobile — UNIWORK" },
    { property: "og:description", content: "Quản lý thành viên, lời mời và trạng thái tổ chức trên PWA UNIWORK." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MobileOrganizationAdmin,
});

const MEMBER_ROLES: Exclude<TenantRole, "tenant_owner">[] = ["tenant_admin", "manager", "member", "guest"];

function MobileOrganizationAdmin() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const active = useActiveTenant();
  const tenantId = active.data?.tenantId;
  const members = useTenantMembers(tenantId);
  const invitations = useTenantInvitations(tenantId);
  const createInvitation = useCreateInvitation(tenantId ?? "");
  const revokeInvitation = useRevokeInvitation(tenantId ?? "");
  const changeTenantStatus = useChangeTenantStatus(tenantId ?? "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<TenantRole, "tenant_owner">>("member");
  const rows = useMemo(() => (members.data ?? []).filter((member) => {
    const matchesText = `${member.display_name ?? ""} ${member.email ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (status === "all" || member.status === status);
  }), [members.data, search, status]);

  if (active.isLoading) return <MobileAdminLayout title={t("m.admin.organization")} backTo="/m/admin"><MobileAdminLoading /></MobileAdminLayout>;
  if (!active.data) return <MobileAdminLayout title={t("m.admin.organization")} backTo="/m/admin"><MobileAdminMessage>{t("m.admin.noActiveOrganization")}</MobileAdminMessage></MobileAdminLayout>;
  const tenant = active.data;
  const canManage = tenant.role === "tenant_owner" || tenant.role === "tenant_admin";
  const isOwner = tenant.role === "tenant_owner";
  const pending = (invitations.data ?? []).filter((invitation) => invitation.status === "pending");
  const submitInvite = () => createInvitation.mutate({ email, role: inviteRole, ttlSeconds: 60 * 60 * 24 * 7, idempotencyKey: crypto.randomUUID() }, {
    onSuccess: () => { setInviteOpen(false); setEmail(""); toast.success(t("m.admin.inviteSent")); },
    onError: () => toast.error(t("m.admin.inviteError")),
  });

  return <MobileAdminLayout title={tenant.tenantName} subtitle={`${t("m.admin.currentOrganization")} · ${t(`m.admin.role.${tenant.role}` as never)}`} backTo="/m/admin">
    {!canManage ? <ReadOnlyNotice /> : null}
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{t(`m.admin.status.${tenant.tenantStatus}` as never)}</Badge>
      <Badge variant="outline">{t("m.admin.departmentMembers", { count: members.data?.length ?? 0 })}</Badge>
      {canManage ? <Button className="ml-auto min-h-11" onClick={() => setInviteOpen(true)}><MailPlus className="mr-2 h-4 w-4" />{t("m.admin.invite")}</Button> : null}
    </div>
    {isOwner ? <div className="flex gap-2">
      {tenant.tenantStatus !== "active" ? <Button variant="outline" className="min-h-11 flex-1" disabled={changeTenantStatus.isPending} onClick={() => changeTenantStatus.mutate("active")}>{t("m.admin.activate")}</Button> : null}
      {tenant.tenantStatus === "active" ? <Button variant="outline" className="min-h-11 flex-1" disabled={changeTenantStatus.isPending} onClick={() => changeTenantStatus.mutate("suspended")}>{t("m.admin.suspend")}</Button> : null}
    </div> : null}
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("m.admin.search")} className="min-h-11 pl-9" /></div>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="min-h-11 w-32" aria-label={t("m.admin.filterAll")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("m.admin.filterAll")}</SelectItem>{["active", "invited", "suspended", "removed"].map((value) => <SelectItem key={value} value={value}>{t(`m.admin.status.${value}` as never)}</SelectItem>)}</SelectContent></Select>
    </div>
    {members.isLoading ? <MobileAdminLoading /> : members.isError ? <MobileAdminMessage retry={() => void members.refetch()}>{t("m.admin.memberError")}</MobileAdminMessage> : null}
    <div className="grid gap-2">{rows.map((member) => <MobileListItem key={member.id} title={member.display_name ?? member.email ?? `${t("m.admin.memberId")} ${member.user_id.slice(0, 8)}`} subtitle={member.display_name ? member.email ?? undefined : undefined} icon={member.role === "tenant_owner" ? <Crown className="h-5 w-5" /> : <UserRound className="h-5 w-5" />} badge={<Badge variant="outline">{t(`m.admin.role.${member.role}` as never)}</Badge>} meta={t(`m.admin.status.${member.status}` as never)} onClick={() => void navigate({ to: "/m/admin/organization/$id" as never, params: { id: member.user_id } as never })} />)}</div>
    {pending.length ? <section><h2 className="mb-2 text-sm font-semibold">{t("m.admin.pendingInvites")}</h2><div className="grid gap-2">{pending.map((invitation) => <div key={invitation.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.email}</p><p className="text-xs text-muted-foreground">{t(`m.admin.role.${invitation.role}` as never)}</p></div>{canManage ? <Button size="sm" variant="outline" className="min-h-11" disabled={revokeInvitation.isPending} onClick={() => revokeInvitation.mutate(invitation.id, { onSuccess: () => toast.success(t("m.admin.inviteRevoked")) })}>{t("m.admin.revoke")}</Button> : null}</div>)}</div></section> : null}
    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent><DialogHeader><DialogTitle>{t("m.admin.invite")}</DialogTitle><DialogDescription>{tenant.tenantName}</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-2"><Label htmlFor="invite-email">{t("m.admin.inviteEmail")}</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11" /></div><Select value={inviteRole} onValueChange={(value) => setInviteRole(value as typeof inviteRole)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{MEMBER_ROLES.map((role) => <SelectItem key={role} value={role}>{t(`m.admin.role.${role}` as never)}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setInviteOpen(false)}>{t("m.admin.cancel")}</Button><Button className="min-h-11" disabled={!email.includes("@") || createInvitation.isPending} onClick={submitInvite}>{t("m.admin.invite")}</Button></DialogFooter></DialogContent></Dialog>
  </MobileAdminLayout>;
}