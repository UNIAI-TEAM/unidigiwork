import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  getConsultationRouting,
  listCmsEntries,
  setConsultationRouting,
} from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";

export function ConsultationRouting({ leadWorkspaceId }: { leadWorkspaceId: string | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const getFn = useServerFn(getConsultationRouting);
  const setFn = useServerFn(setConsultationRouting);
  const listFn = useServerFn(listCmsEntries);
  const routing = useQuery({
    queryKey: ["cms-routing", leadWorkspaceId],
    queryFn: () => getFn(),
    enabled: !!leadWorkspaceId,
  });
  const services = useQuery({
    queryKey: ["cms-admin", "service"],
    queryFn: () => listFn({ data: { kind: "service" } }),
  });
  const save = useMutation({
    mutationFn: (next: Record<string, string>) => setFn({ data: { routing: next } }),
    onSuccess: () => {
      toast.success(t("cms.saved"));
      void qc.invalidateQueries({ queryKey: ["cms-routing"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const map = routing.data?.routing ?? {};
  const update = (slug: string, userId: string) => {
    const next = { ...map };
    if (userId) next[slug] = userId;
    else delete next[slug];
    save.mutate(next);
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border p-4">
      <div>
        <Label>{t("cms.routing")}</Label>
        <p className="text-xs text-muted-foreground">{t("cms.routingHint")}</p>
      </div>
      {!leadWorkspaceId ? (
        <p className="text-sm text-muted-foreground">{t("cms.routingNeedLead")}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(services.data ?? []).map((s) => (
            <div key={s.id} className="grid gap-1">
              <Label htmlFor={`route-${s.slug}`} className="text-xs text-muted-foreground">
                {s.title}
              </Label>
              <select
                id={`route-${s.slug}`}
                className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
                value={map[s.slug] ?? ""}
                disabled={routing.isLoading || save.isPending}
                onChange={(e) => update(s.slug, e.target.value)}
              >
                <option value="">{t("cms.routingNone")}</option>
                {(routing.data?.members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
