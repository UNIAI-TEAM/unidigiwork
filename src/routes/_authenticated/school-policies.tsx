import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { listPolicyDocs, savePolicyMeta, askPolicy, type PolicyDoc, type PolicyStatus, type PolicyAnswer } from "@/lib/api/school-policy.functions";

export const Route = createFileRoute("/_authenticated/school-policies")({
  head: () => ({
    meta: [
      { title: "Quy chế & văn bản trường học — UniWork" },
      { name: "description", content: "Ghi số văn bản, ngày hiệu lực, tổ áp dụng và hỏi quy chế có dẫn nguồn." },
      { property: "og:title", content: "Quy chế & văn bản trường học — UniWork" },
      { property: "og:description", content: "Ghi số văn bản, ngày hiệu lực, tổ áp dụng và hỏi quy chế có dẫn nguồn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoliciesPage,
});

const STATUSES: PolicyStatus[] = ["effective", "approved", "draft", "expired", "superseded", "withdrawn", "unknown"];

function PoliciesPage() {
  const { t } = useI18n();
  const fn = useServerFn(listPolicyDocs);
  const q = useQuery({ queryKey: ["school-policies"], queryFn: () => fn() });
  const [edit, setEdit] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("spl.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("spl.desc")}</p>
        </div>
      </div>
      {q.data && !q.data.enabled ? <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p> : (
        <>
          <AskBox />
          <section className="space-y-3">
            <h2 className="text-lg font-medium">{t("spl.docs")}</h2>
            {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
            {q.data && q.data.docs.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("spl.noDocs")}</p>}
            <div className="grid gap-3">
              {(q.data?.docs ?? []).map((doc) => (
                <article key={doc.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-medium">{doc.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {doc.meta?.doc_number ? `${t("spl.number")}: ${doc.meta.doc_number} · ` : ""}
                        {t(`spl.st.${doc.meta?.status ?? "unknown"}`)}
                        {doc.meta?.effective_from ? ` · ${t("spl.from")} ${doc.meta.effective_from}` : ""}
                        {doc.meta?.effective_to ? ` → ${doc.meta.effective_to}` : ""}
                        {` · ${doc.meta?.department || t("sops.all")}`}
                      </p>
                    </div>
                    {q.data?.canEdit && (
                      <Button variant="outline" className="h-11" onClick={() => setEdit(edit === doc.id ? null : doc.id)}>{t("spl.editMeta")}</Button>
                    )}
                  </div>
                  {edit === doc.id && <MetaForm doc={doc} depts={q.data?.depts ?? []} onDone={() => setEdit(null)} />}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetaForm({ doc, depts, onDone }: { doc: PolicyDoc; depts: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const save = useServerFn(savePolicyMeta);
  const m0 = doc.meta;
  const [f, setF] = useState({
    docNumber: m0?.doc_number ?? "", issuer: m0?.issuer ?? "", issuedAt: m0?.issued_at ?? "",
    effectiveFrom: m0?.effective_from ?? "", effectiveTo: m0?.effective_to ?? "",
    status: (m0?.status ?? "unknown") as PolicyStatus, department: m0?.department ?? "",
  });
  const mut = useMutation({
    mutationFn: () => save({ data: {
      documentId: doc.id, docNumber: f.docNumber, issuer: f.issuer,
      issuedAt: f.issuedAt || null, effectiveFrom: f.effectiveFrom || null, effectiveTo: f.effectiveTo || null,
      status: f.status, department: f.department, idempotencyKey: `pmeta:${doc.id}:${crypto.randomUUID()}`,
    } }),
    onSuccess: () => { toast.success(t("sst.saved")); qc.invalidateQueries({ queryKey: ["school-policies"] }); onDone(); },
    onError: (e: Error) => toast.error(t("spl.err"), { description: e.message }),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const field = "flex flex-col gap-1 text-sm";
  const sel = "h-11 rounded-md border bg-background px-3 text-sm";
  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <label className={field}>{t("spl.number")}<Input className="h-11" value={f.docNumber} onChange={set("docNumber")} maxLength={100} /></label>
      <label className={field}>{t("spl.issuer")}<Input className="h-11" value={f.issuer} onChange={set("issuer")} maxLength={200} /></label>
      <label className={field}>{t("spl.issuedAt")}<Input className="h-11" type="date" value={f.issuedAt} onChange={set("issuedAt")} /></label>
      <label className={field}>{t("spl.status")}
        <select className={sel} value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{t(`spl.st.${s}`)}</option>)}</select>
      </label>
      <label className={field}>{t("spl.effFrom")}<Input className="h-11" type="date" value={f.effectiveFrom} onChange={set("effectiveFrom")} /></label>
      <label className={field}>{t("spl.effTo")}<Input className="h-11" type="date" value={f.effectiveTo} onChange={set("effectiveTo")} /></label>
      <label className={field}>{t("spl.dept")}
        <select className={sel} value={f.department} onChange={set("department")}>
          <option value="">{t("sops.all")}</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit" className="h-11" disabled={mut.isPending}>{t("sst.save")}</Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>{t("smt.close")}</Button>
      </div>
    </form>
  );
}

function AskBox() {
  const { t } = useI18n();
  const ask = useServerFn(askPolicy);
  const [qText, setQ] = useState("");
  const [res, setRes] = useState<PolicyAnswer | null>(null);
  const mut = useMutation({
    mutationFn: () => ask({ data: { question: qText } }),
    onSuccess: (r) => setRes(r),
    onError: (e: Error) => toast.error(t("spl.err"), { description: e.message }),
  });
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 md:p-6">
      <h2 className="text-lg font-medium">{t("spl.ask")}</h2>
      <Textarea aria-label={t("spl.ask")} value={qText} onChange={(e) => setQ(e.target.value)} placeholder={t("spl.askPh")} maxLength={1000} rows={3} />
      <Button className="h-11" disabled={mut.isPending || qText.trim().length < 5} onClick={() => mut.mutate()}>{mut.isPending ? t("spl.asking") : t("spl.askBtn")}</Button>
      {res && (
        <div className="space-y-3 border-t pt-4">
          <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t(`spl.r.${res.status}`)}</span>
          {res.answer && <p className="whitespace-pre-wrap text-sm">{res.answer}</p>}
          {res.warnings.map((w, i) => <p key={i} className="text-xs text-destructive">{w}</p>)}
          {res.sources.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("spl.sources")}</h3>
              {res.sources.map((s, i) => (
                <div key={i} className="rounded-md border p-3 text-sm">
                  <Link to="/documents/$id" params={{ id: s.id }} className="font-medium underline">{s.title}</Link>
                  <span className="text-xs text-muted-foreground">{s.doc_number ? ` · ${s.doc_number}` : ""} · v{s.version}</span>
                  {s.quote && <blockquote className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">“{s.quote}”</blockquote>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
