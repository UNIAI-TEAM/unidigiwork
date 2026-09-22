import { createFileRoute } from "@tanstack/react-router";
import { Crown, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveTenant,
  useChangeMemberRole,
  useChangeMemberStatus,
  useTenantMembers,
  useTransferOwnership,
} from "@/features/tenants/hooks";
import type { TenantRole } from "@/contracts/tenants/tenant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/organization")({
  head: () => ({
    meta: [
      { title: "Quản trị tổ chức mobile — UNIWORK" },
      { name: "description", content: "Quản lý vai trò và trạng thái thành viên tổ chức." },
      { property: "og:title", content: "Quản trị tổ chức mobile — UNIWORK" },
      { property: "og:description", content: "Quản lý vai trò và trạng thái thành viên tổ chức." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileOrganizationAdmin,
});

const MEMBER_ROLES: Exclude<TenantRole, "tenant_owner">[] = [
  "tenant_admin",
  "manager",
  "member",
  "guest",
];

function MobileOrganizationAdmin() {
  const { t } = useI18n();
  const active = useActiveTenant();
  const tenantId = active.data?.tenantId;
  const members = useTenantMembers(tenantId);
  const changeRole = useChangeMemberRole(tenantId ?? "");
  const changeStatus = useChangeMemberStatus(tenantId ?? "");
  const transferOwnership = useTransferOwnership(tenantId ?? "");

  if (active.isLoading)
    return (
      <MobileAdminLayout title={t("m.admin.organization")} backTo="/m/admin">
        <MobileAdminLoading />
      </MobileAdminLayout>
    );
  if (!active.data)
    return (
      <MobileAdminLayout title={t("m.admin.organization")} backTo="/m/admin">
        <MobileAdminMessage>{t("m.admin.noActiveOrganization")}</MobileAdminMessage>
      </MobileAdminLayout>
    );

  const tenant = active.data;
  const canManage = tenant.role === "tenant_owner" || tenant.role === "tenant_admin";
  const isOwner = tenant.role === "tenant_owner";
  const busy = changeRole.isPending || changeStatus.isPending || transferOwnership.isPending;
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("m.admin.memberError"));

  return (
    <MobileAdminLayout
      title={tenant.tenantName}
      subtitle={`${t("m.admin.currentOrganization")} · ${t(`m.admin.role.${tenant.role}` as never)}`}
      backTo="/m/admin"
    >
      {!canManage ? <ReadOnlyNotice /> : null}
      {members.isLoading ? <MobileAdminLoading /> : null}
      {members.isError ? (
        <MobileAdminMessage retry={() => void members.refetch()}>
          {t("m.admin.memberError")}
        </MobileAdminMessage>
      ) : null}
      <div className="grid gap-3">
        {(members.data ?? []).map((member) => {
          const isSelf = member.user_id === tenant.actorId;
          const memberIsOwner = member.role === "tenant_owner";
          const label =
            member.display_name ??
            member.email ??
            `${t("m.admin.memberId")} ${member.user_id.slice(0, 8)}`;
          return (
            <section key={member.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  {memberIsOwner ? (
                    <Crown className="h-5 w-5" />
                  ) : (
                    <UserRound className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{label}</p>
                  {member.display_name && member.email ? (
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  ) : null}
                </div>
                <Badge variant="outline">{t(`m.admin.status.${member.status}` as never)}</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {memberIsOwner ? (
                  <div className="min-h-11 rounded-xl border border-border px-3 py-3 text-sm">
                    {t("m.admin.role.tenant_owner")}
                  </div>
                ) : (
                  <Select
                    value={member.role}
                    disabled={!canManage || isSelf || busy}
                    onValueChange={(newRole) =>
                      changeRole.mutate(
                        {
                          userId: member.user_id,
                          newRole: newRole as Exclude<TenantRole, "tenant_owner">,
                        },
                        {
                          onSuccess: () => toast.success(t("m.admin.memberRoleSaved")),
                          onError: fail,
                        },
                      )
                    }
                  >
                    <SelectTrigger aria-label={t("m.admin.organizationRoles")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMBER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`m.admin.role.${role}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canManage && !memberIsOwner && !isSelf ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() =>
                        changeStatus.mutate(
                          {
                            userId: member.user_id,
                            newStatus: member.status === "suspended" ? "active" : "suspended",
                          },
                          {
                            onSuccess: () => toast.success(t("m.admin.memberStatusSaved")),
                            onError: fail,
                          },
                        )
                      }
                    >
                      {member.status === "suspended" ? t("m.admin.activate") : t("m.admin.suspend")}
                    </Button>
                    {isOwner ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t("m.admin.transferConfirm"))) return;
                          transferOwnership.mutate(member.user_id, {
                            onSuccess: () => toast.success(t("m.admin.ownerTransferred")),
                            onError: fail,
                          });
                        }}
                      >
                        {t("m.admin.transferOwner")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </MobileAdminLayout>
  );
}
