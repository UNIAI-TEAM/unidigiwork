import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listSchoolDirectives, type Directive, type DirectiveState } from "@/lib/api/school-directives.functions";

export const Route = createFileRoute("/_authenticated/school-directives")({
  head: () => ({
    meta: [
      { title: "Theo dõi chỉ đạo — UniWork" },
      { name: "description", content: "Theo dõi chỉ đạo của Ban Giám hiệu từ giao việc đến nghiệm thu." },
      { property: "og:title", content: "Theo dõi chỉ đạo — UniWork" },
      { property: "og:description", content: "Theo dõi chỉ đạo của Ban Giám hiệu từ giao việc đến nghiệm thu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectivesPage,
});

const FILTERS: Array<DirectiveState | "all"> = ["all", "decide", "blocked", "overdue", "review", "closed"];
const tone: Record<DirectiveState, string> = {
  decide: "bg-primary/10 text-primary", blocked: "bg-destructive/10 text-destructive", overdue: "bg-destructive/10 text-destructive",
  review: "bg-accent text-foreground", closed: "bg-muted text-muted-foreground", progress: "bg-muted text-foreground",
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : null);

function DirectivesPage() {
  const { t } = useI18n();
  const fn = useServerFn(listSchoolDirectives);
  const q = useQuery({ queryKey: ["school-directives"], queryFn: () => fn() });
  const [f, setF] = useState<DirectiveState | "all">("all");
  const items = q.data?.items ?? [];
  const count = (s: DirectiveState | "all") => (s === "all" ? items.length : items.filter((i) => i.state === s).length);
  const shown = f === "all" ? items : items.filter((i) => i.state === f);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sdt.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sdt.desc")}</p>
        </div>
      </div>

      {q.data && !q.data.allowed ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdt.forbidden")}</p>
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {FILTERS.map((s) => (
              <button key={s} onClick={() => setF(s)} aria-pressed={f === s}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm ${f === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                {t(`sdt.f.${s}`)} <span className="tabular-nums opacity-70">{count(s)}</span>
              </button>
            ))}
          </div>
          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {!q.isLoading && shown.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdt.empty")}</p>}
          <div className="grid gap-4">{shown.map((d) => <Card key={d.id} d={d} />)}</div>
          <p className="text-xs text-muted-foreground">{t("sdt.note")}</p>
        </>
      )}
    </div>
  );
}

function Card({ d }: { d: Directive }) {
  const { t } = useI18n();
  const done = d.tasks.filter((x) => x.status === "done").length;
  const ev = d.tasks.reduce((a, x) => a + x.evidence, 0);
  const lastUpd = d.tasks.map((x) => x.updated_at).filter(Boolean).sort().pop() ?? null;
  const steps = [
    { k: "source", on: true, at: d.meeting?.start_at ?? d.created_at },
    { k: "assign", on: d.tasks.length > 0, at: d.confirmed_at },
    { k: "update", on: !!lastUpd, at: lastUpd },
    { k: "evidence", on: ev > 0, at: null },
    { k: "accept", on: d.state === "closed", at: null },
  ];
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-medium">{d.title}</h2>
          {d.detail && <p className="mt-1 break-words text-sm text-muted-foreground">{d.detail}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${tone[d.state]}`}>{t(`sdt.f.${d.state}`)}</span>
          {d.missingEvidence && <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">{t("sdt.missingEv")}</span>}
        </div>
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {steps.map((s, i) => (
          <li key={s.k} className={`flex items-center gap-1 ${s.on ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${s.on ? "bg-primary" : "bg-border"}`} />
            {t(`sdt.tl.${s.k}`)}{s.at && s.on ? ` · ${fmt(s.at)}` : ""}{i < steps.length - 1 && <span className="ml-3 text-muted-foreground">→</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <span className="font-medium">{t("sdt.next")}:</span> {t(d.next)}
        {d.why && <span className="block text-xs text-muted-foreground">{t("sdt.why")}: {d.why}</span>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("sdt.tasks")} · <span className="tabular-nums">{done}/{d.tasks.length}</span></span>
          {d.meeting && <Link to="/meeting/$id" params={{ id: d.meeting.id }} className="inline-flex min-h-11 items-center text-xs underline">{t("sdt.openMeeting")}</Link>}
        </div>
        {d.tasks.length === 0 ? <p className="text-xs text-muted-foreground">{t("sdt.noTasks")}</p> : (
          <ul className="divide-y rounded-lg border">
            {d.tasks.map((x) => (
              <li key={x.id}>
                <Link to="/tasks/$id" params={{ id: x.id }} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-accent">
                  <span className={`min-w-0 flex-1 break-words ${x.status === "done" ? "line-through text-muted-foreground" : ""}`}>{x.title}</span>
                  <span className="text-xs text-muted-foreground">{x.owner ?? t("sdt.noOwner")}</span>
                  <span className={`text-xs tabular-nums ${x.overdue ? "text-destructive" : "text-muted-foreground"}`}>{fmt(x.due_at) ?? t("sdt.noDue")}</span>
                  <span className="text-xs text-muted-foreground">{x.evidence} {t("sdt.evidence")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
