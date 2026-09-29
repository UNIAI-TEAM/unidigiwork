import { withAppShell } from "@/components/page-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Network, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import {
  deleteSchoolDepartment,
  listSchoolDepartments,
  saveSchoolDepartment,
  type SchoolDepartment,
} from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/school-org")({
  head: () => ({
    meta: [
      { title: "Tổ chuyên môn — UNIWORK" },
      { name: "description", content: "Ban Giám hiệu quản lý tổ chuyên môn và mời thành viên vào trường." },
      { property: "og:title", content: "Tổ chuyên môn — UNIWORK" },
      { property: "og:description", content: "Ban Giám hiệu quản lý tổ chuyên môn và mời thành viên vào trường." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(SchoolOrgPage),
});

function SchoolOrgPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const listFn = useServerFn(listSchoolDepartments);
  const saveFn = useServerFn(saveSchoolDepartment);
  const delFn = useServerFn(deleteSchoolDepartment);
  const q = useQuery({ queryKey: ["school-departments"], queryFn: () => listFn() });
  const d = q.data;

  const err = (e: unknown) => {
    const k = `sorg.err.${e instanceof Error ? e.message : ""}`;
    const v = t(k as never);
    return v === k ? t("sorg.err.FAILED") : v;
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["school-departments"] });
    qc.invalidateQueries({ queryKey: ["school-staff"] });
    qc.invalidateQueries({ queryKey: ["school-ops"] });
  };

  const [form, setForm] = useState<{ id: string | null; name: string; description: string } | null>(null);
  const [del, setDel] = useState<SchoolDepartment | null>(null);
  const [target, setTarget] = useState("");

  const save = useMutation({
    mutationFn: (v: { id: string | null; name: string; description: string }) =>
      saveFn({ data: { id: v.id, name: v.name, description: v.description.trim() || null } }),
    onSuccess: () => { toast.success(t("sorg.saved")); setForm(null); refresh(); },
    onError: (e) => toast.error(err(e)),
  });
  const remove = useMutation({
    mutationFn: (v: { id: string; targetId: string }) => delFn({ data: v }),
    onSuccess: () => { toast.success(t("sorg.deleted")); setDel(null); refresh(); },
    onError: (e) => toast.error(err(e)),
  });

  const others = d?.departments.filter((x) => x.id !== del?.id) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("sorg.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("sorg.desc")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/school-ops" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm hover:bg-accent">
            <ArrowLeft className="h-4 w-4" /> {t("nav.schoolOps")}
          </Link>
          {d?.isBgh && (
            <Link to="/school-staff" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm hover:bg-accent">
              <UserPlus className="h-4 w-4" /> {t("sorg.invite")}
            </Link>
          )}
        </div>
      </header>

      {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
      {q.isError && <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{t("sorg.err.FAILED")}</p>}
      {d && !d.enabled && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p>}

      {d?.enabled && (
        <>
          {!d.isBgh && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t("sorg.readOnly")}</p>}
          {d.isBgh && !form && (
            <Button className="min-h-11 gap-2" onClick={() => setForm({ id: null, name: "", description: "" })}>
              <Plus className="h-4 w-4" /> {t("sorg.new")}
            </Button>
          )}
          {form && (
            <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
              <Input className="h-11" maxLength={80} placeholder={t("sorg.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input className="h-11" maxLength={300} placeholder={t("sorg.descField")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="flex gap-2">
                <Button className="min-h-11" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate(form)}>
                  {form.id ? t("sorg.save") : t("sorg.create")}
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>{t("sorg.cancel")}</Button>
              </div>
            </section>
          )}

          {d.departments.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("sorg.empty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {d.departments.map((x) => (
                <li key={x.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{x.name}</p>
                    {x.description && <p className="text-sm text-muted-foreground">{x.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{t("sorg.members").replace("{n}", String(x.member_count))}</p>
                  </div>
                  {d.isBgh && (
                    <div className="flex gap-2">
                      <Button variant="outline" className="min-h-11 gap-2" onClick={() => setForm({ id: x.id, name: x.name, description: x.description ?? "" })}>
                        <Pencil className="h-4 w-4" /> {t("sorg.edit")}
                      </Button>
                      <Button variant="outline" className="min-h-11 gap-2 text-destructive" onClick={() => { setDel(x); setTarget(""); }}>
                        <Trash2 className="h-4 w-4" /> {t("sorg.delete")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sorg.deleteTitle").replace("{name}", del?.name ?? "")}</DialogTitle>
            <DialogDescription>{others.length ? t("sorg.deleteHint") : t("sorg.needOther")}</DialogDescription>
          </DialogHeader>
          {others.length > 0 && (
            <select aria-label={t("sorg.target")} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t("sorg.target")}</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setDel(null)}>{t("sorg.cancel")}</Button>
            <Button variant="destructive" className="min-h-11" disabled={!target || remove.isPending} onClick={() => del && remove.mutate({ id: del.id, targetId: target })}>
              {t("sorg.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
