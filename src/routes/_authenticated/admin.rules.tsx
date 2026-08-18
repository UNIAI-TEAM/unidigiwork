import { createFileRoute } from "@tanstack/react-router";
import { useI18n, type Key } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ListFilter, Pencil, Plus, Sparkles, Tag, Trash2, X } from "lucide-react";
import {
  deleteAdminRule,
  listAdminRules,
  toggleAdminRule,
  upsertAdminRule,
} from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/rules")({
  head: () => ({
    meta: [
      { title: "Quy tắc hệ thống — UNIWORK" },
      { name: "description", content: "Quản lý quy tắc thông báo, nhãn và tự động hóa." },
    ],
  }),
  component: AdminRulesPage,
});

type Kind = "notification" | "label" | "automation";
const KIND_META: Record<Kind, { label: string; icon: typeof Bell; tint: string }> = {
  notification: { label: "adm.rule.notification", icon: Bell, tint: "bg-primary/15 text-primary" },
  label: { label: "adm.rule.label", icon: Tag, tint: "bg-amber-500/15 text-amber-300" },
  automation: { label: "adm.rule.automation", icon: Sparkles, tint: "bg-violet-500/15 text-violet-300" },
};

type Rule = Awaited<ReturnType<typeof listAdminRules>>[number];

type FormState = {
  id?: string;
  name: string;
  description: string;
  kind: Kind;
  is_enabled: boolean;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  kind: "notification",
  is_enabled: true,
};

function AdminRulesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["admin", "rules"],
    queryFn: () => listAdminRules(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "rules"] });
  const upsertMut = useMutation({
    mutationFn: (v: FormState) =>
      upsertAdminRule({
        data: {
          id: v.id,
          name: v.name,
          description: v.description || null,
          kind: v.kind,
          condition: {},
          action: {},
          is_enabled: v.is_enabled,
        },
      }),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_enabled: boolean }) => toggleAdminRule({ data: v }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAdminRule({ data: { id } }),
    onSuccess: invalidate,
  });

  const filtered = useMemo(
    () => (filter === "all" ? rules : rules.filter((r) => r.kind === filter)),
    [rules, filter],
  );

  const startEdit = (r: Rule) =>
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      kind: r.kind as Kind,
      is_enabled: r.is_enabled,
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5 text-xs">
            {(["all", "notification", "label", "automation"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded px-2.5 py-1 transition-colors ${
                  filter === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "all" ? t("adm.52") : t(KIND_META[k].label as Key)}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length}/{rules.length} quy tắc
          </span>
          <button
            onClick={() => setForm({ ...emptyForm })}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("adm.59")}
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("adm.60")}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
              <ListFilter className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">{t("adm.61")}</div>
            <p className="text-xs text-muted-foreground">
              {t("adm.62")}
            </p>
            <button
              onClick={() => setForm({ ...emptyForm })}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> {t("adm.63")}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = KIND_META[r.kind as Kind];
              const Icon = meta.icon;
              return (
                <li key={r.id} className="flex items-start gap-3 p-4 hover:bg-surface-2/30">
                  <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${meta.tint}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {t(meta.label as Key)}
                      </span>
                      {!r.is_enabled && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {t("adm.64")}
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Cập nhật: {new Date(r.updated_at).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-primary"
                        checked={r.is_enabled}
                        onChange={(e) => toggleMut.mutate({ id: r.id, is_enabled: e.target.checked })}
                      />
                      {t("adm.65")}
                    </label>
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded-md border border-border bg-surface p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={t("adm.66")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Xóa quy tắc "${r.name}"?`)) deleteMut.mutate(r.id);
                      }}
                      className="rounded-md border border-border bg-surface p-1.5 text-muted-foreground hover:text-destructive"
                      aria-label={t("em.42")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="rounded-2xl border border-border bg-surface p-4">
        {!form ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">
              <Plus className="h-5 w-5" />
            </div>
            <div>Chọn t("adm.59") hoặc chỉnh sửa quy tắc để bắt đầu.</div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) return;
              upsertMut.mutate(form);
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{form.id ? t("adm.67") : t("adm.68")}</h2>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                aria-label={t("em.116")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t("adm.69")}</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-md bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder={t("adm.70")}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t("adm.71")}</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-md bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder={t("adm.72")}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t("adm.73")}</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
                className="rounded-md bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {(Object.keys(KIND_META) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_META[k].label as Key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={form.is_enabled}
                onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
              />
              <span>{t("adm.74")}</span>
            </label>
            {upsertMut.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {(upsertMut.error as Error).message}
              </div>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("adm.75")}
              </button>
              <button
                type="submit"
                disabled={upsertMut.isPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {upsertMut.isPending ? t("em.115") : form.id ? t("adm.76") : t("adm.77")}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}