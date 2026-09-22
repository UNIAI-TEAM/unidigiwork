import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { getMyAdminAccess } from "@/lib/api/admin.functions";
import { listTenantAccountLimits, setTenantAccountLimit } from "@/lib/api/admin-accounts.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

export const Route = createFileRoute("/_authenticated/m/admin/limits")({
  head: () => ({
    meta: [
      { title: "Giới hạn tài khoản mobile — UNIWORK" },
      { name: "description", content: "Quản lý giới hạn tài khoản theo tổ chức trên điện thoại." },
      { property: "og:title", content: "Giới hạn tài khoản mobile — UNIWORK" },
      { property: "og:description", content: "Quản lý giới hạn tài khoản theo tổ chức trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileAdminLimits,
});

function MobileAdminLimits() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const accessFn = useServerFn(getMyAdminAccess);
  const limitsFn = useServerFn(listTenantAccountLimits);
  const saveFn = useServerFn(setTenantAccountLimit);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const limits = useQuery({
    queryKey: ["m-admin-limits"],
    queryFn: () => limitsFn(),
    enabled: access.data?.canRead === true,
  });
  useEffect(() => {
    if (!limits.data) return;
    setDrafts(Object.fromEntries(limits.data.map((item) => [item.id, item.max_users?.toString() ?? ""])));
  }, [limits.data]);
  const save = useMutation({
    mutationFn: ({ tenantId, value }: { tenantId: string; value: string }) => {
      const parsed = value.trim() === "" ? null : Number(value);
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000)) {
        throw new Error(t("m.admin.invalidLimit"));
      }
      return saveFn({ data: { tenant_id: tenantId, max_users: parsed } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["m-admin-limits"] });
      toast.success(t("m.admin.limitSaved"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("m.admin.limitError")),
  });

  return (
    <MobileAdminLayout title={t("m.admin.limits")} subtitle={t("m.admin.limitsSubtitle")} backTo="/m/admin">
      {access.isLoading ? <MobileAdminLoading /> : null}
      {access.data && !access.data.canRead ? <MobileAdminMessage>{t("m.admin.denied")}</MobileAdminMessage> : null}
      {access.data?.canRead ? (
        <>
          {!access.data.canWrite ? <ReadOnlyNotice /> : null}
          {limits.isLoading ? <MobileAdminLoading /> : null}
          {limits.isError ? <MobileAdminMessage retry={() => void limits.refetch()}>{t("m.admin.limitError")}</MobileAdminMessage> : null}
          <div className="grid gap-3">
            {(limits.data ?? []).map((item) => (
              <section key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{item.name}</h2><p className="truncate text-xs text-muted-foreground">{item.slug}</p></div>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{fmt(t("m.admin.used"), { used: item.used })} · {item.max_users ?? t("m.admin.unlimited")}</p>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <div className="grid gap-1.5"><Label htmlFor={`limit-${item.id}`}>{t("m.admin.limit")}</Label><Input id={`limit-${item.id}`} type="number" inputMode="numeric" min={1} max={100000} placeholder={t("m.admin.unlimited")} value={drafts[item.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} disabled={!access.data.canWrite} className="min-h-11" /></div>
                  <Button type="button" className="min-h-11" disabled={!access.data.canWrite || save.isPending} onClick={() => save.mutate({ tenantId: item.id, value: drafts[item.id] ?? "" })}>{t("m.admin.save")}</Button>
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </MobileAdminLayout>
  );
}