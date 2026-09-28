import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { archivePackItem, getPackAdmin, savePackItem } from "@/lib/api/pack-admin.functions";
import type { PackItemRow } from "@/lib/api/pack-admin.server";
import { SCHOOL_TEMPLATE_KEYS, schoolTemplateBody, type SchoolTemplateKey } from "@/lib/school-templates";
import { schoolEn, schoolVi } from "@/lib/i18n-locales/packs/school";
import { useI18n, type Key } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/school-pack")({
  head: () => ({
    meta: [
      { title: "Quản trị Gói Trường học — UNIWORK" },
      { name: "description", content: "Soạn mẫu văn bản, bộ từ ngữ, Skill bản tin và hẹn giờ xuất bản cho trường học." },
    ],
  }),
  component: SchoolPackAdmin,
});

type Kind = PackItemRow["kind"];
type Scope = "platform" | "tenant";
const QK = ["pack-admin"] as const;
const TABS: { kind: Kind; label: Key }[] = [
  { kind: "template", label: "spa.tab.templates" },
  { kind: "vocabulary", label: "spa.tab.vocabulary" },
  { kind: "skill", label: "spa.tab.skill" },
  { kind: "brief_schedule", label: "spa.tab.schedule" },
];

function statusOf(r: PackItemRow, liveId: string | undefined): Key {
  if (r.status === "draft") return "spa.status.draft";
  if (r.publish_at && Date.parse(r.publish_at) > Date.now()) return "spa.status.scheduled";
  return r.id === liveId ? "spa.status.live" : "spa.status.old";
}

function SchoolPackAdmin() {
  const { t } = useI18n();
  const fetchAdmin = useServerFn(getPackAdmin);
  const { data, isLoading } = useQuery({ queryKey: QK, queryFn: () => fetchAdmin() });
  const [tab, setTab] = useState<Kind>("template");
  const [scope, setScope] = useState<Scope | null>(null);
  const [tplKey, setTplKey] = useState<SchoolTemplateKey>(SCHOOL_TEMPLATE_KEYS[0]);

  const tenantOk = !!data?.canManageTenant && data.pack === "school";
  const scopes: Scope[] = [
    ...(data?.isPlatformAdmin ? (["platform"] as const) : []),
    ...(tenantOk ? (["tenant"] as const) : []),
  ];
  const active: Scope | null = scope && scopes.includes(scope) ? scope : (scopes[0] ?? null);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-lg bg-secondary p-2.5"><GraduationCap className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-semibold">{t("spa.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("spa.desc")}</p>
        </div>
      </header>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !active ? (
        <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">{t("spa.noAccess")}</p>
      ) : (
        <>
          {data?.isPlatformAdmin && !tenantOk && (
            <p className="mb-4 text-xs text-muted-foreground">{t("spa.notSchool")}</p>
          )}
          {scopes.length > 1 && (
            <div className="mb-4 inline-flex rounded-lg border border-border p-1" role="tablist">
              {scopes.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={active === s} onClick={() => setScope(s)}
                  className={cn("min-h-10 rounded-md px-3 text-sm", active === s ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent")}>
                  {t(s === "platform" ? "spa.scope.platform" : "spa.scope.tenant")}
                </button>
              ))}
            </div>
          )}
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((x) => (
              <button key={x.kind} type="button" onClick={() => setTab(x.kind)}
                className={cn("min-h-11 shrink-0 border-b-2 px-3 text-sm", tab === x.kind ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t(x.label)}
              </button>
            ))}
          </nav>
          {tab === "template" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {SCHOOL_TEMPLATE_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => setTplKey(k)} aria-pressed={tplKey === k}
                  className={cn("min-h-10 rounded-md border px-3 text-sm", tplKey === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
                  {t(`wp.school.${k}` as Key)}
                </button>
              ))}
            </div>
          )}
          {tab === "brief_schedule" && active === "platform" ? (
            <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">{t("spa.scheduleOnlyTenant")}</p>
          ) : (
            <ItemEditor
              key={`${active}-${tab}-${tplKey}`}
              scope={active}
              kind={tab}
              itemKey={tab === "template" ? tplKey : tab === "vocabulary" ? "labels" : tab === "skill" ? "executive_brief" : "daily"}
              items={data?.items ?? []}
            />
          )}
        </>
      )}
    </main>
  );
}

function defaultContent(kind: Kind, key: string): Record<string, unknown> {
  if (kind === "template") return { body: schoolTemplateBody(key as SchoolTemplateKey, "").replace(/^# \n\n/, "") };
  if (kind === "vocabulary") return { vi: {}, en: {} };
  if (kind === "skill") return { body: "" };
  return { enabled: false, time: "07:00", weekdays: [1, 2, 3, 4, 5], roles: ["tenant_owner", "tenant_admin"] };
}

function ItemEditor({ scope, kind, itemKey, items }: { scope: Scope; kind: Kind; itemKey: string; items: PackItemRow[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const save = useServerFn(savePackItem);
  const archive = useServerFn(archivePackItem);
  const mine = useMemo(
    () => items.filter((r) => r.kind === kind && r.item_key === itemKey && (scope === "platform" ? !r.tenant_id : !!r.tenant_id)),
    [items, kind, itemKey, scope],
  );
  const liveId = useMemo(() => {
    const now = Date.now();
    return mine
      .filter((r) => r.status === "published" && r.publish_at && Date.parse(r.publish_at) <= now)
      .sort((a, b) => Date.parse(b.publish_at!) - Date.parse(a.publish_at!))[0]?.id;
  }, [mine]);
  const base = mine.find((r) => r.id === liveId) ?? mine[0];
  const [content, setContent] = useState<Record<string, unknown>>(base?.content ?? defaultContent(kind, itemKey));
  const [mode, setMode] = useState<"draft" | "now" | "schedule">("draft");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => setContent(base?.content ?? defaultContent(kind, itemKey)), [base?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: () => {
      let publishAt: string | null = null;
      if (mode === "schedule") {
        const d = new Date(at);
        if (!at || isNaN(d.getTime()) || d.getTime() <= Date.now()) throw new Error("time");
        publishAt = d.toISOString();
      }
      return save({ data: { idempotencyKey: crypto.randomUUID(), scope, kind, itemKey, content, status: mode === "draft" ? "draft" : "published", publishAt, note: note || undefined } });
    },
    onSuccess: () => { toast.success(t("spa.saved")); setNote(""); void qc.invalidateQueries({ queryKey: QK }); void qc.invalidateQueries({ queryKey: ["tenant-industry-pack"] }); },
    onError: (e) => toast.error(e instanceof Error && e.message === "time" ? t("spa.invalidTime") : t("spa.saveFailed")),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => { toast.success(t("spa.cancelled")); void qc.invalidateQueries({ queryKey: QK }); },
    onError: () => toast.error(t("spa.saveFailed")),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-4 rounded-lg border border-border p-4">
        {(kind === "template" || kind === "skill") && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("spa.body")}</span>
            <textarea value={String(content["body"] ?? "")} onChange={(e) => setContent({ ...content, body: e.target.value })}
              rows={16} maxLength={50000} className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm" />
            <span className="block text-xs text-muted-foreground">{t(kind === "skill" ? "spa.skillHint" : "spa.bodyHint")}</span>
          </label>
        )}
        {kind === "vocabulary" && <VocabEditor content={content} onChange={setContent} />}
        {kind === "brief_schedule" && <ScheduleEditor content={content} onChange={setContent} />}

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["draft", "now", "schedule"] as const).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={mode === x} onClick={() => setMode(x)}
                className={cn("min-h-10 rounded-md border px-3 text-sm", mode === x ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
                {t(`spa.publish.${x}` as Key)}
              </button>
            ))}
          </div>
          {mode === "schedule" && (
            <label className="block space-y-1.5">
              <span className="text-sm">{t("spa.publishAt")}</span>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
            </label>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("spa.note")}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
          <Button type="button" className="h-11 px-5" disabled={m.isPending} onClick={() => m.mutate()}>{t("spa.save")}</Button>
        </div>
      </section>

      <aside className="space-y-2">
        <h2 className="text-sm font-semibold">{t("spa.history")}</h2>
        {mine.length === 0 && <p className="text-xs text-muted-foreground">{t("spa.noHistory")}</p>}
        {mine.map((r) => {
          const st = statusOf(r, liveId);
          return (
            <div key={r.id} className="rounded-lg border border-border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("rounded-md px-2 py-0.5 font-medium", st === "spa.status.live" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{t(st)}</span>
                <span className="tabular-nums text-muted-foreground">{new Date(r.publish_at ?? r.created_at).toLocaleString()}</span>
              </div>
              {r.note && <p className="mt-1.5 text-foreground">{r.note}</p>}
              <div className="mt-2 flex gap-3">
                <button type="button" className="min-h-8 text-primary hover:underline" onClick={() => setContent(r.content)}>{t("spa.useVersion")}</button>
                {st !== "spa.status.old" && (
                  <button type="button" className="min-h-8 text-muted-foreground hover:text-destructive" onClick={() => cancel.mutate(r.id)}>{t("spa.cancel")}</button>
                )}
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}

function VocabEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const vi = (content["vi"] ?? {}) as Record<string, string>;
  const en = (content["en"] ?? {}) as Record<string, string>;
  const set = (lang: "vi" | "en", k: string, v: string) => {
    const cur = { ...(lang === "vi" ? vi : en) };
    if (v) cur[k] = v; else delete cur[k];
    onChange({ ...content, [lang]: cur });
  };
  return (
    <div className="space-y-3">
      {Object.keys(schoolVi).map((k) => (
        <div key={k} className="grid gap-2 sm:grid-cols-[180px_1fr_1fr] sm:items-center">
          <span className="truncate text-xs text-muted-foreground" title={k}>{t("spa.original")}: {k}</span>
          <input aria-label={`${k} vi`} value={vi[k] ?? ""} placeholder={schoolVi[k]} maxLength={120} onChange={(e) => set("vi", k, e.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
          <input aria-label={`${k} en`} value={en[k] ?? ""} placeholder={schoolEn[k]} maxLength={120} onChange={(e) => set("en", k, e.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
      ))}
    </div>
  );
}

const ROLES = [["tenant_owner", "spa.role.owner"], ["tenant_admin", "spa.role.admin"], ["manager", "spa.role.manager"]] as const;
function ScheduleEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const { t, lang } = useI18n();
  const days = (content["weekdays"] as number[]) ?? [];
  const roles = (content["roles"] as string[]) ?? [];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const dayName = (d: number) => new Date(2024, 0, d === 0 ? 7 : d).toLocaleDateString(lang === "en" ? "en" : "vi", { weekday: "short" });
  return (
    <div className="space-y-4">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={!!content["enabled"]} onChange={(e) => onChange({ ...content, enabled: e.target.checked })} />
        {t("spa.sched.enabled")}
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm">{t("spa.sched.time")}</span>
        <input type="time" value={String(content["time"] ?? "07:00")} onChange={(e) => onChange({ ...content, time: e.target.value })}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
      </label>
      <div className="space-y-1.5">
        <span className="text-sm">{t("spa.sched.days")}</span>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => onChange({ ...content, weekdays: toggle(days, d) })}
              className={cn("min-h-10 min-w-11 rounded-md border px-2 text-sm", days.includes(d) ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>{dayName(d)}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm">{t("spa.sched.roles")}</span>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(([r, l]) => (
            <button key={r} type="button" aria-pressed={roles.includes(r)} onClick={() => onChange({ ...content, roles: toggle(roles, r) })}
              className={cn("min-h-10 rounded-md border px-3 text-sm", roles.includes(r) ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>{t(l)}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("spa.sched.note")}</p>
    </div>
  );
}
