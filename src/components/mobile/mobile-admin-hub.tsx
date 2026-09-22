import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Gauge, KeyRound, ShieldCheck, Users } from "lucide-react";
import { getMyAdminAccess } from "@/lib/api/admin.functions";
import { useActiveTenant } from "@/features/tenants/hooks";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

export function MobileAdminHubNative() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const accessFn = useServerFn(getMyAdminAccess);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const tenant = useActiveTenant();

  if (access.isLoading)
    return (
      <MobileAdminLayout title={t("m.admin.title")} subtitle={t("m.admin.subtitle")}>
        <MobileAdminLoading />
      </MobileAdminLayout>
    );
  if (!access.data?.canRead)
    return (
      <MobileAdminLayout title={t("m.admin.title")} subtitle={t("m.admin.subtitle")}>
        <MobileAdminMessage>{t("m.admin.denied")}</MobileAdminMessage>
      </MobileAdminLayout>
    );

  const tenantCanManage =
    tenant.data?.role === "tenant_owner" || tenant.data?.role === "tenant_admin";
  return (
    <MobileAdminLayout title={t("m.admin.title")} subtitle={t("m.admin.subtitle")}>
      {!access.data.canWrite ? <ReadOnlyNotice /> : null}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {access.data.isAdmin
            ? t("m.admin.role.admin")
            : t("m.admin.role.moderator")}
        </Badge>
        {tenant.data ? (
          <Badge variant="outline">{t(`m.admin.role.${tenant.data.role}` as never)}</Badge>
        ) : null}
      </div>
      <div className="grid gap-2">
        <MobileListItem
          title={t("m.admin.overview")}
          subtitle={t("m.admin.overviewHint")}
          icon={<Gauge className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/m/admin/overview" })}
        />
        <MobileListItem
          title={t("m.admin.accounts")}
          subtitle={t("m.admin.accountsHint")}
          icon={<Users className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/m/admin/accounts" })}
        />
        <MobileListItem
          title={t("m.admin.organization")}
          subtitle={t("m.admin.organizationHint")}
          icon={<Building2 className="h-5 w-5" />}
          badge={tenantCanManage ? undefined : <Badge variant="outline">{t("m.admin.readOnly")}</Badge>}
          onClick={() => void navigate({ to: "/m/admin/organization" })}
        />
        <MobileListItem
          title={t("m.admin.limits")}
          subtitle={t("m.admin.limitsHint")}
          icon={<ShieldCheck className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/m/admin/limits" })}
        />
        <MobileListItem
          title={t("m.admin.personalPassword")}
          subtitle={t("m.admin.personalPasswordHint")}
          icon={<KeyRound className="h-5 w-5" />}
          onClick={() => void navigate({ to: "/m/settings", search: { tab: "password" } as never })}
        />
      </div>
    </MobileAdminLayout>
  );
}