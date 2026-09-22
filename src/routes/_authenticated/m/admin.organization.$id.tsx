import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { TenantRole } from "@/contracts/tenants/tenant";
import {
  useActiveTenant,
  useChangeMemberRole,
  useChangeMemberStatus,
  useTransferOwnership,
} from "@/features/tenants/hooks";
import { getPerson, upsertPersonProfile } from "@/lib/api/people.functions";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/organization/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết thành viên tổ chức — UNIWORK" },
      {
        name: "description",
        content: "Quản lý vai trò, trạng thái và bộ phận của thành viên tổ chức.",
      },
      { property: "og:title", content: "Chi tiết thành viên tổ chức — UNIWORK" },
      {
        property: "og:description",
        content: "Quản lý vai trò, trạng thái và bộ phận của thành viên tổ chức.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MemberDetail,
});
const ROLES: Exclude<TenantRole, "tenant_owner">[] = ["tenant_admin", "manager", "member", "guest"];
function MemberDetail() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const active = useActiveTenant();
  const qc = useQueryClient();
  const personFn = useServerFn(getPerson),
    saveFn = useServerFn(upsertPersonProfile);
  const person = useQuery({
    queryKey: ["m-admin-member", id],
    queryFn: () => personFn({ data: { userId: id } }),
  });
  const role = useChangeMemberRole(active.data?.tenantId ?? ""),
    status = useChangeMemberStatus(active.data?.tenantId ?? ""),
    transfer = useTransferOwnership(active.data?.tenantId ?? "");
  const [department, setDepartment] = useState<string | null>(null);
  const saveDepartment = useMutation({
    mutationFn: () => {
      const p = person.data?.person;
      if (!p) throw new Error("RESOURCE_NOT_FOUND");
      return saveFn({
        data: {
          userId: p.id,
          displayName: p.name,
          title: p.title,
          department: department ?? p.department,
          team: p.team,
          location: p.location,
          phone: p.phone,
          empId: p.empId,
          joinDate: p.joinDate,
          reportsTo: p.reportsTo,
          skills: p.skills,
          teams: p.teams,
          about: p.about,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["m-admin-member", id] });
      toast.success(t("m.admin.departmentSaved"));
    },
    onError: () => toast.error(t("m.admin.departmentError")),
  });
  if (active.isLoading || person.isLoading)
    return (
      <MobileAdminLayout title={t("m.admin.memberDetail")} backTo="/m/admin/organization">
        <MobileAdminLoading />
      </MobileAdminLayout>
    );
  if (!active.data || !person.data)
    return (
      <MobileAdminLayout title={t("m.admin.memberDetail")} backTo="/m/admin/organization">
        <MobileAdminMessage retry={() => void person.refetch()}>
          {t("m.admin.memberError")}
        </MobileAdminMessage>
      </MobileAdminLayout>
    );
  const p = person.data.person,
    canManage = active.data.role === "tenant_owner" || active.data.role === "tenant_admin",
    owner = p.role === "tenant_owner",
    self = p.id === active.data.actorId,
    busy = role.isPending || status.isPending || transfer.isPending || saveDepartment.isPending;
  return (
    <MobileAdminLayout title={p.name} subtitle={p.email} backTo="/m/admin/organization">
      {!canManage ? <ReadOnlyNotice /> : null}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t(`m.admin.role.${p.role}` as never)}</Badge>
        <Badge variant="outline">{t(`m.admin.status.${p.memberStatus}` as never)}</Badge>
      </div>
      <section className="grid gap-4 rounded-xl border border-border p-4">
        <div className="grid gap-2">
          <Label>{t("m.admin.organizationRoles")}</Label>
          {owner ? (
            <div className="min-h-11 rounded-xl border border-border px-3 py-3 text-sm">
              {t("m.admin.role.tenant_owner")}
            </div>
          ) : (
            <Select
              value={p.role}
              disabled={!canManage || self || busy}
              onValueChange={(newRole) =>
                role.mutate(
                  { userId: p.id, newRole: newRole as (typeof ROLES)[number] },
                  {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: ["m-admin-member", id] });
                      toast.success(t("m.admin.memberRoleSaved"));
                    },
                  },
                )
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`m.admin.role.${value}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="member-department">{t("m.admin.departmentName")}</Label>
          <Input
            id="member-department"
            className="min-h-11"
            value={department ?? p.department}
            disabled={!canManage || busy}
            onChange={(event) => setDepartment(event.target.value)}
          />
          <Button
            className="min-h-11"
            disabled={!canManage || busy || department === null}
            onClick={() => saveDepartment.mutate()}
          >
            {t("m.admin.save")}
          </Button>
        </div>
      </section>
      {canManage && !owner && !self ? (
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              status.mutate(
                {
                  userId: p.id,
                  newStatus: p.memberStatus === "suspended" ? "active" : "suspended",
                },
                {
                  onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-admin-member", id] }),
                },
              )
            }
          >
            {p.memberStatus === "suspended" ? t("m.admin.activate") : t("m.admin.suspend")}
          </Button>
          {active.data.role === "tenant_owner" ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => window.confirm(t("m.admin.transferConfirm")) && transfer.mutate(p.id)}
            >
              {t("m.admin.transferOwner")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </MobileAdminLayout>
  );
}
