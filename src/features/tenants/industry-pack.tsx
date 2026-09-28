import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Building2 } from "lucide-react";
import { getTenantPack, setTenantPack } from "@/lib/api/industry-pack.functions";
import { setIndustryPackSnapshot, type IndustryPack } from "@/lib/industry-pack-store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const TENANT_PACK_KEY = ["tenant-industry-pack"] as const;

export function useTenantPack() {
  const fetchPack = useServerFn(getTenantPack);
  return useQuery({ queryKey: TENANT_PACK_KEY, queryFn: () => fetchPack(), staleTime: 5 * 60_000 });
}

/** Đồng bộ gói của tổ chức đang hoạt động vào bộ từ ngữ. */
export function IndustryPackSync() {
  const { data } = useTenantPack();
  useEffect(() => {
    setIndustryPackSnapshot(data?.pack ?? "business");
  }, [data?.pack]);
  return null;
}

export function IndustryPackPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useTenantPack();
  const save = useServerFn(setTenantPack);
  const m = useMutation({
    mutationFn: (pack: IndustryPack) =>
      save({ data: { idempotencyKey: crypto.randomUUID(), pack } }),
    onSuccess: (res) => {
      qc.setQueryData(TENANT_PACK_KEY, res);
      toast.success(t("pack.saved"));
    },
    onError: () => toast.error(t("pack.saveFailed")),
  });
  const options: { key: IndustryPack; icon: typeof Building2; label: string; desc: string }[] = [
    { key: "business", icon: Building2, label: t("pack.business"), desc: t("pack.businessDesc") },
    { key: "school", icon: GraduationCap, label: t("pack.school"), desc: t("pack.schoolDesc") },
  ];
  const canManage = !!data?.canManage;
  return (
    <section className="mb-6 space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("pack.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("pack.desc")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("pack.title")}>
        {options.map((o) => {
          const active = (data?.pack ?? "business") === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!canManage || isLoading || m.isPending}
              onClick={() => !active && m.mutate(o.key)}
              className={cn(
                "flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                active ? "border-primary bg-primary/10" : "hover:bg-accent disabled:opacity-60",
              )}
            >
              <o.icon className={cn("mt-0.5 h-5 w-5 shrink-0", active && "text-primary")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!isLoading && !canManage && (
        <p className="text-xs text-muted-foreground">{t("pack.noPermission")}</p>
      )}
    </section>
  );
}
