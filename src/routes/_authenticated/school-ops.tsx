import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Sparkles } from "lucide-react";
import { createSchoolBrief, getSchoolOps, type SchoolBrief } from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/school-ops")({
  head: () => ({
    meta: [
      { title: "Điều hành trường học — UNIWORK" },
      { name: "description", content: "Bảng tổng hợp tổ chuyên môn và bản tin điều hành cho Ban Giám hiệu." },
      { property: "og:title", content: "Điều hành trường học — UNIWORK" },
      { property: "og:description", content: "Bảng tổng hợp tổ chuyên môn và bản tin điều hành cho Ban Giám hiệu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchoolOps,
});

function SchoolOps() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [ws, setWs] = useState<string | null>(null);
  const fetchOps = useServerFn(getSchoolOps);
  const gen = useServerFn(createSchoolBrief);
  const q = useQuery({ queryKey: ["school-ops", ws], queryFn: () => fetchOps({ data: { workspaceId: ws } }) });
  const m = useMutation({
    mutationFn: () => gen({ data: { workspaceId: ws, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (r) => {
      if (r.status === "no_data") toast.info(t("sops.noData"));
      else if (r.status === "error") toast.error(t("sops.error"));
      qc.invalidateQueries({ queryKey: ["school-ops"] });
    },
    onError: (e) => toast.error(e instanceof Error && e.message === "FORBIDDEN" ? t("sops.forbidden") : t("sops.error")),
  });

  const d = q.data;
  const latest = d?.briefs.find((b) => b.status === "ok");
  const canGen = !!d && (ws !== null || d.isLeader);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("sops.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("sops.desc")}</p>
          </div>
        </div>
        {d?.enabled && d.isLeader && (
          <Link to="/school-pack" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm hover:bg-accent">
            {t("spa.open")}
          </Link>
        )}
      </header>

      {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
      {d && !d.enabled && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p>}

      {d?.enabled && (
        <>
          <section className="rounded-xl border bg-card shadow-sm">
            {d.depts.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">{t("sops.noDepts")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm tabular-nums">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-3 font-medium">{t("sops.dept")}</th>
                      <th className="px-3 py-3 text-right font-medium">{t("sops.open")}</th>
                      <th className="px-3 py-3 text-right font-medium">{t("sops.overdue")}</th>
                      <th className="px-3 py-3 text-right font-medium">{t("sops.blocked")}</th>
                      <th className="px-3 py-3 text-right font-medium">{t("sops.done7")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("sops.meet7")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.isLeader && (
                      <Row active={ws === null} onClick={() => setWs(null)} name={t("sops.all")}
                        v={d.depts.reduce((a, r) => [a[0] + r.open_tasks, a[1] + r.overdue, a[2] + r.blocked, a[3] + r.done_7d, a[4] + r.meetings_7d], [0, 0, 0, 0, 0])} bold />
                    )}
                    {d.depts.map((r) => (
                      <Row key={r.workspace_id} active={ws === r.workspace_id} onClick={() => setWs(r.workspace_id)} name={r.name}
                        v={[r.open_tasks, r.overdue, r.blocked, r.done_7d, r.meetings_7d]} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {t("sops.brief")} · {ws ? d.depts.find((x) => x.workspace_id === ws)?.name : t("sops.all")}
                </h2>
                <Button className="min-h-11" disabled={!canGen || m.isPending} onClick={() => m.mutate()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {m.isPending ? t("sops.generating") : t("sops.generate")}
                </Button>
              </div>
              {latest ? <BriefBody b={latest} lang={lang} /> : <p className="text-sm text-muted-foreground">{t("sops.empty")}</p>}
            </div>
            <aside className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">{t("sops.history")}</h3>
              <ul className="space-y-2 text-sm">
                {d.briefs.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span className="tabular-nums">{new Date(b.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB")}</span>
                    <span className={cn("text-xs", b.status === "ok" ? "text-muted-foreground" : "text-destructive")}>
                      {b.status === "ok" ? t(b.trigger === "scheduled" ? "sops.scheduled" : "sops.manual") : t(b.status === "no_data" ? "sops.noData" : "sops.error")}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ name, v, active, onClick, bold }: { name: string; v: number[]; active: boolean; onClick: () => void; bold?: boolean }) {
  return (
    <tr onClick={onClick} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/50", active && "bg-primary/5")}>
      <td className={cn("px-4 py-3", bold && "font-semibold")}>{name}</td>
      {v.map((n, i) => (
        <td key={i} className={cn("px-3 py-3 text-right", i === 1 && n > 0 && "font-medium text-destructive", i === 4 && "pr-4")}>{n}</td>
      ))}
    </tr>
  );
}

function BriefBody({ b, lang }: { b: SchoolBrief; lang: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <p className="text-xs text-muted-foreground tabular-nums">{new Date(b.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB")}</p>
      {b.content.split("\n").map((line, i) =>
        line.startsWith("## ") ? (
          <h3 key={i} className="pt-2 font-semibold">{line.slice(3)}</h3>
        ) : line.trim() ? (
          <p key={i}>{line.replace(/\*\*/g, "")}</p>
        ) : null,
      )}
    </div>
  );
}
