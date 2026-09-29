import { withAppShell } from "@/components/page-shell";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listSchoolDepartments } from "@/lib/api/school-ops.functions";
import { listDeptPlans, type DeptPlan } from "@/lib/api/school-plans.functions";

export const Route = createFileRoute("/_authenticated/school-dept-progress")({
  head: () => ({
    meta: [
      { title: "Tiến độ tổ — UniWork" },
      { name: "description", content: "Tổ trưởng theo dõi lịch đăng bài, bài tập chưa xong và lịch dạy đã lên lớp." },
      { property: "og:title", content: "Tiến độ tổ — UniWork" },
      { property: "og:description", content: "Tổ trưởng theo dõi lịch đăng bài, bài tập chưa xong và lịch dạy đã lên lớp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(DeptProgressPage),
});

const RANGES = [7, 14, 30] as const;
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const DONE = ["done", "canceled"];

function DeptProgressPage() {
  const { t } = useI18n();
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const [dept, setDept] = useState<string | null>(null);
  const { from, to, now } = useMemo(() => {
    const n = new Date();
    return { now: n, from: new Date(n.getTime() - days * 86400000), to: new Date(n.getTime() + days * 86400000) };
  }, [days]);

  const listFn = useServerFn(listDeptPlans);
  const q = useQuery({
    queryKey: ["school-dept-progress", dept, days],
    queryFn: () => listFn({ data: { department: dept, from: from.toISOString(), to: to.toISOString() } }),
  });
  const deptFn = useServerFn(listSchoolDepartments);
  const dq = useQuery({ queryKey: ["school-departments"], queryFn: () => deptFn(), enabled: q.data?.role === "bgh" });

  const d = q.data;
  const current = d?.dept ?? null;
  const items = d?.items ?? [];
  const t0 = now.getTime();
  const posted = items.filter((i) => i.starts_at && new Date(i.starts_at).getTime() <= t0)
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));
  const openAssign = items.filter((i) => i.kind === "assignment" && !DONE.includes(i.task_status ?? ""))
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const taught = items.filter((i) => i.kind === "lesson" && new Date(i.ends_at ?? i.starts_at ?? 0).getTime() <= t0)
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));
  const lessons = items.filter((i) => i.kind === "lesson" && new Date(i.starts_at ?? 0).getTime() <= t0 + days * 86400000);
  const overdue = openAssign.filter((i) => i.starts_at && new Date(i.starts_at).getTime() < t0).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sdg.title")}{current ? ` · ${current}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{t("sdg.desc")}</p>
        </div>
      </div>

      {d?.role === "bgh" && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {(dq.data?.departments ?? []).map((x) => (
            <button key={x.id} onClick={() => setDept(x.name)} aria-pressed={current === x.name}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm ${current === x.name ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      {d && !d.enabled ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdp.disabled")}</p>
      ) : d && !current ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{d.role === "bgh" ? t("sdp.pickDept") : t("sdp.noDept")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
                className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm ${days === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                ±{r} {t("sdg.days")}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t("sdg.posted")} value={posted.length} />
            <Stat label={t("sdg.openAssign")} value={openAssign.length} />
            <Stat label={t("sdg.overdue")} value={overdue} warn={overdue > 0} />
            <Stat label={t("sdg.taught")} value={`${taught.length}/${lessons.length}`} />
          </div>

          {q.isLoading ? <p className="text-sm text-muted-foreground">…</p> : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title={t("sdg.openAssign")} items={openAssign} empty={t("sdg.emptyAssign")} render={(i) => {
                const late = i.starts_at && new Date(i.starts_at).getTime() < t0;
                return <span className={late ? "text-destructive" : "text-muted-foreground"}>{late ? t("sdg.late") : t("sdg.due")} {fmt(i.starts_at)}</span>;
              }} />
              <Section title={t("sdg.taught")} items={taught} empty={t("sdg.emptyTaught")} render={(i) => <span className="text-muted-foreground">{fmt(i.starts_at)}</span>} />
              <div className="lg:col-span-2">
                <Section title={t("sdg.timeline")} items={posted} empty={t("sdg.emptyPosted")} render={(i) => (
                  <span className="text-muted-foreground">{t(`sdp.kind.${i.kind}` as "sdp.kind.lesson")} · {fmt(i.starts_at)}</span>
                )} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, items, empty, render }: { title: string; items: DeptPlan[]; empty: string; render: (i: DeptPlan) => React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title} <span className="text-muted-foreground">({items.length})</span></h2>
      {items.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((i) => (
            <li key={i.id} className="space-y-0.5 p-3 text-sm">
              <div className="break-words font-medium">{i.title}{i.class_name ? ` · ${i.class_name}` : ""}</div>
              <div className="flex flex-wrap gap-x-2 text-xs">{render(i)}{i.author_name && <span className="text-muted-foreground">· {i.author_name}</span>}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
