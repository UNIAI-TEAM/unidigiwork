import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, FileText, Users as UsersIcon, Monitor, DollarSign, FolderKanban,
  ShieldCheck, Search as SearchIcon, MoreHorizontal, X, Maximize2, Play,
  ChevronDown, TrendingUp, TrendingDown, Activity, CheckCircle2, Clock,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/workflows")({
  head: () => ({
    meta: [
      { title: "Workflows · UNIWORK" },
      { name: "description", content: "Tự động hoá và quản lý quy trình nghiệp vụ trên UNIWORK." },
    ],
  }),
  component: WorkflowsPage,
});

type WFStatus = "active" | "paused" | "draft";
type WF = {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  catColor: string;
  icon: any;
  iconBg: string;
  status: WFStatus;
  instances: number;
  completed: number;
  avgTime: string;
  owner: string;
  ownerSeed: string;
  updated: string;
};

const workflows: WF[] = [
  { id: "w1", name: "Employee Onboarding", subtitle: "HR & Admin", category: "HR & Admin", catColor: "bg-violet-500/20 text-violet-300 border border-violet-500/30", icon: UsersIcon, iconBg: "bg-violet-500/20 text-violet-300", status: "active", instances: 18, completed: 48, avgTime: "1.8 days", owner: "Nguyễn Hương", ownerSeed: "nguyen-huong", updated: "22/05/2025" },
  { id: "w2", name: "Leave Approval Process", subtitle: "HR & Admin", category: "HR & Admin", catColor: "bg-violet-500/20 text-violet-300 border border-violet-500/30", icon: UsersIcon, iconBg: "bg-violet-500/20 text-violet-300", status: "active", instances: 32, completed: 126, avgTime: "1.2 days", owner: "Trần Thị B", ownerSeed: "tran-thi-b", updated: "22/05/2025" },
  { id: "w3", name: "IT Equipment Request", subtitle: "IT & Ops", category: "IT & Ops", catColor: "bg-sky-500/20 text-sky-300 border border-sky-500/30", icon: Monitor, iconBg: "bg-sky-500/20 text-sky-300", status: "active", instances: 15, completed: 67, avgTime: "2.6 days", owner: "Phạm Minh C", ownerSeed: "pham-minh-c", updated: "21/05/2025" },
  { id: "w4", name: "Purchase Request", subtitle: "Finance", category: "Finance", catColor: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30", icon: DollarSign, iconBg: "bg-emerald-500/20 text-emerald-300", status: "active", instances: 21, completed: 89, avgTime: "3.1 days", owner: "Lê Hoàng D", ownerSeed: "le-hoang-d", updated: "20/05/2025" },
  { id: "w5", name: "Invoice Approval", subtitle: "Finance", category: "Finance", catColor: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30", icon: DollarSign, iconBg: "bg-emerald-500/20 text-emerald-300", status: "active", instances: 16, completed: 74, avgTime: "2.3 days", owner: "Bảo Ngọc", ownerSeed: "bao-ngoc", updated: "20/05/2025" },
  { id: "w6", name: "Project Intake", subtitle: "Project Management", category: "Project Mgmt", catColor: "bg-amber-500/20 text-amber-300 border border-amber-500/30", icon: FolderKanban, iconBg: "bg-amber-500/20 text-amber-300", status: "active", instances: 9, completed: 31, avgTime: "2.7 days", owner: "Duy Anh", ownerSeed: "duy-anh", updated: "19/05/2025" },
  { id: "w7", name: "Contract Review", subtitle: "Legal & Compliance", category: "Legal & Compliance", catColor: "bg-rose-500/20 text-rose-300 border border-rose-500/30", icon: ShieldCheck, iconBg: "bg-rose-500/20 text-rose-300", status: "active", instances: 7, completed: 28, avgTime: "3.6 days", owner: "Hoàng Nam", ownerSeed: "hoang-nam", updated: "19/05/2025" },
  { id: "w8", name: "Access Request", subtitle: "IT & Ops", category: "IT & Ops", catColor: "bg-sky-500/20 text-sky-300 border border-sky-500/30", icon: Monitor, iconBg: "bg-sky-500/20 text-sky-300", status: "paused", instances: 6, completed: 23, avgTime: "1.5 days", owner: "Tuấn Nam", ownerSeed: "tuan-nam-ba", updated: "18/05/2025" },
  { id: "w9", name: "Expense Reimbursement", subtitle: "Finance", category: "Finance", catColor: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30", icon: DollarSign, iconBg: "bg-emerald-500/20 text-emerald-300", status: "active", instances: 12, completed: 51, avgTime: "2.0 days", owner: "Mỹ Linh", ownerSeed: "my-linh", updated: "18/05/2025" },
  { id: "w10", name: "Policy Exception", subtitle: "Legal & Compliance", category: "Legal & Compliance", catColor: "bg-rose-500/20 text-rose-300 border border-rose-500/30", icon: ShieldCheck, iconBg: "bg-rose-500/20 text-rose-300", status: "draft", instances: 3, completed: 0, avgTime: "-", owner: "Trần Thị B", ownerSeed: "tran-thi-b", updated: "17/05/2025" },
];

const categories = [
  { name: "HR & Admin", desc: "Onboarding, Leave, Expense…", count: 12, icon: UsersIcon, color: "bg-violet-500/20 text-violet-300" },
  { name: "IT & Ops", desc: "IT Request, Access, Changes…", count: 8, icon: Monitor, color: "bg-sky-500/20 text-sky-300" },
  { name: "Finance", desc: "Purchase, Invoice, Payment…", count: 7, icon: DollarSign, color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Project Management", desc: "Project Intake, Change Request…", count: 6, icon: FolderKanban, color: "bg-amber-500/20 text-amber-300" },
  { name: "Legal & Compliance", desc: "NDA, Contract, Compliance…", count: 5, icon: ShieldCheck, color: "bg-rose-500/20 text-rose-300" },
];

const TABS = ["overview", "requests", "approvals", "templates", "settings"] as const;
type Tab = typeof TABS[number];

function WorkflowsPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<Tab>("overview");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | WFStatus>("All");
  const [cat, setCat] = useState("All");
  const [owner, setOwner] = useState("All");
  const [selected, setSelected] = useState<WF | null>(workflows[0]);
  const [panelOpen, setPanelOpen] = useState(true);

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (status !== "All" && w.status !== status) return false;
      if (cat !== "All" && w.category !== cat) return false;
      if (owner !== "All" && w.owner !== owner) return false;
      return true;
    });
  }, [q, status, cat, owner]);

  const owners = useMemo(() => Array.from(new Set(workflows.map((w) => w.owner))), []);
  const cats = useMemo(() => Array.from(new Set(workflows.map((w) => w.category))), []);

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{t("wf.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("wf.sub")}</p>
              </div>
              <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> {t("wf.new")}
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
              {TABS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`wf.tab.${k}` as any)}
                  {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                </button>
              ))}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard label={t("wf.kpi.total")} value="42" delta="+12%" up icon={WorkflowIcon} accent="text-primary" t={t} />
              <KpiCard label={t("wf.kpi.active")} value="128" delta="+18%" up icon={Activity} accent="text-sky-300" t={t} />
              <KpiCard label={t("wf.kpi.done")} value="256" delta="+16%" up icon={CheckCircle2} accent="text-emerald-300" t={t} />
              <KpiCard label={t("wf.kpi.pending")} value="24" delta="-8%" up icon={Clock} accent="text-amber-300" t={t} />
              <KpiCard label={t("wf.kpi.avg")} value="2.4" suffix={t("wf.kpi.days")} delta="-14%" up={false} icon={Clock} accent="text-violet-300" t={t} />
            </div>

            {/* Categories */}
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {categories.map((c) => (
                <button key={c.name} className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                    <c.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{c.desc}</div>
                  <div className="text-[11px] text-muted-foreground">{c.count} {t("wf.cat.workflows")}</div>
                </button>
              ))}
              <button className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-4 text-primary transition-colors hover:bg-primary/10">
                <Plus className="h-5 w-5" />
                <div className="text-sm font-medium">{t("wf.create")}</div>
              </button>
            </div>

            {/* Filter bar */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("wf.search")}
                  className="w-full rounded-lg bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Select value={status} onChange={(v) => setStatus(v as any)} label={t("wf.filter.status")} options={["All", "active", "paused", "draft"]} renderOption={(v) => (v === "All" ? "All" : t(`wf.status.${v}` as any))} />
              <Select value={cat} onChange={setCat} label={t("wf.filter.category")} options={["All", ...cats]} />
              <Select value={owner} onChange={setOwner} label={t("wf.filter.owner")} options={["All", ...owners]} />
              <button className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                <FileText className="h-4 w-4" /> {t("wf.filter.more")}
              </button>
            </div>

            {/* Table */}
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-medium">{t("wf.col.name")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.category")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.status")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.instances")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.completed")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.time")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.owner")}</th>
                      <th className="px-3 py-3 text-left font-medium">{t("wf.col.updated")}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((w) => (
                      <tr
                        key={w.id}
                        onClick={() => { setSelected(w); setPanelOpen(true); }}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${selected?.id === w.id ? "bg-surface-2" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${w.iconBg}`}>
                              <w.icon className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <div className="font-medium">{w.name}</div>
                              <div className="text-[11px] text-muted-foreground">{w.subtitle}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${w.catColor}`}>{w.category}</span>
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={w.status} t={t} /></td>
                        <td className="px-3 py-3">{w.instances}</td>
                        <td className="px-3 py-3">{w.completed}</td>
                        <td className="px-3 py-3 text-muted-foreground">{w.avgTime}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <img src={avatar(w.ownerSeed)} className="h-6 w-6 rounded-full object-cover" alt="" />
                            <span className="whitespace-nowrap">{w.owner}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{w.updated}</td>
                        <td className="px-3 py-3 text-right">
                          <button className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <div>{t("wf.showing")} 1 {t("wf.of")} {filtered.length} {t("wf.of")} 42 {t("wf.cat.workflows")}</div>
                <div className="flex items-center gap-1">
                  <PageBtn>‹</PageBtn>
                  <PageBtn active>1</PageBtn>
                  <PageBtn>2</PageBtn>
                  <PageBtn>3</PageBtn>
                  <PageBtn>4</PageBtn>
                  <PageBtn>5</PageBtn>
                  <span className="px-1">…</span>
                  <PageBtn>{t("wf.next")} →</PageBtn>
                </div>
              </div>
            </div>
          </main>

          {selected && panelOpen && (
            <WorkflowPanel wf={selected} onClose={() => setPanelOpen(false)} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, suffix, delta, up, icon: Icon, accent, t }: { label: string; value: string; suffix?: string; delta: string; up: boolean; icon: any; accent: string; t: (k: any) => string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <div className="text-2xl font-semibold">{value}</div>
        {suffix && <div className="text-sm text-muted-foreground">{suffix}</div>}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-[11px] ${up ? "text-success" : "text-destructive"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span>{delta}</span>
        <span className="text-muted-foreground">{t("wf.kpi.vs")}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: WFStatus; t: (k: any) => string }) {
  const cls =
    status === "active"
      ? "bg-success/15 text-success border border-success/30"
      : status === "paused"
      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
      : "bg-surface-2 text-muted-foreground border border-border";
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}>{t(`wf.status.${status}`)}</span>;
}

function Select({ value, onChange, label, options, renderOption }: { value: string; onChange: (v: string) => void; label: string; options: string[]; renderOption?: (v: string) => string }) {
  return (
    <label className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-surface py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>{label}: {renderOption ? renderOption(o) : o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}

function PageBtn({ children, active }: { children: any; active?: boolean }) {
  return (
    <button className={`min-w-[28px] rounded px-2 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "hover:bg-surface-2"}`}>{children}</button>
  );
}

const PANEL_TABS = ["overview", "designer", "instances", "activity"] as const;

function WorkflowPanel({ wf, onClose, t }: { wf: WF; onClose: () => void; t: (k: any) => string }) {
  const [tab, setTab] = useState<(typeof PANEL_TABS)[number]>("overview");
  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${wf.iconBg}`}>
            <wf.icon className="h-4 w-4" />
          </div>
          <div className="font-semibold">{wf.name}</div>
          <StatusBadge status={wf.status} t={t} />
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-1 border-b border-border px-3">
        {PANEL_TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative px-3 py-2.5 text-xs font-medium transition-colors ${tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`wf.panel.${k}`)}
            {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Automated {wf.name.toLowerCase()} process — orchestrated end-to-end across stakeholders.
        </p>

        <dl className="mt-4 space-y-2.5 text-sm">
          <Row label={t("wf.panel.owner")}>
            <div className="flex items-center gap-2">
              <img src={avatar(wf.ownerSeed)} className="h-6 w-6 rounded-full object-cover" alt="" />
              <span>{wf.owner}</span>
            </div>
          </Row>
          <Row label={t("wf.panel.category")}>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${wf.catColor}`}>{wf.category}</span>
          </Row>
          <Row label={t("wf.panel.created")}><span className="text-muted-foreground">10/03/2025 10:30 AM</span></Row>
          <Row label={t("wf.panel.updated")}><span className="text-muted-foreground">{wf.updated} 09:15 AM</span></Row>
          <Row label={t("wf.panel.avg")}><span className="text-muted-foreground">{wf.avgTime}</span></Row>
        </dl>

        {/* Diagram */}
        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("wf.panel.diagram")}</div>
            <button className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
          </div>
          <Diagram />
        </div>

        {/* Recent instances */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{t("wf.panel.recent")}</div>
            <button className="text-xs text-primary hover:underline">{t("wf.panel.viewall")}</button>
          </div>
          <div className="space-y-2">
            <InstanceRow code="EMP-ONB-2025-00128" name="Nguyễn Văn Minh" seed="nv-minh" status="inprogress" date="22/05/2025" t={t} />
            <InstanceRow code="EMP-ONB-2025-00127" name="Phạm Thị Thu" seed="pt-thu" status="review" date="22/05/2025" t={t} />
            <InstanceRow code="EMP-ONB-2025-00126" name="Lê Quốc Bảo" seed="lq-bao" status="completed" date="21/05/2025" t={t} />
            <InstanceRow code="EMP-ONB-2025-00125" name="Đỗ Hải Nam" seed="dh-nam" status="completed" date="21/05/2025" t={t} />
            <InstanceRow code="EMP-ONB-2025-00124" name="Vũ Hoàng Anh" seed="vh-anh" status="completed" date="20/05/2025" t={t} />
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Play className="h-4 w-4" /> {t("wf.panel.run")}
        </button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function InstanceRow({ code, name, seed, status, date, t }: { code: string; name: string; seed: string; status: "inprogress" | "review" | "completed"; date: string; t: (k: any) => string }) {
  const cls =
    status === "completed"
      ? "bg-success/15 text-success border border-success/30"
      : status === "review"
      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
      : "bg-sky-500/15 text-sky-300 border border-sky-500/30";
  const label = status === "completed" ? t("wf.inst.completed") : status === "review" ? t("wf.inst.review") : t("wf.inst.inprogress");
  const dateLabel = status === "completed" ? t("wf.inst.completed") : t("wf.inst.started");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
      <img src={avatar(seed)} className="h-7 w-7 rounded-full object-cover" alt="" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{code}</div>
        <div className="truncate text-[11px] text-muted-foreground">{name}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
        <span className="text-[10px] text-muted-foreground">{dateLabel} {date}</span>
      </div>
    </div>
  );
}

function Diagram() {
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-[11px]">
      <Node label="Start" tone="emerald" />
      <Arrow />
      <Node label="Submit Request" tone="sky" />
      <Arrow />
      <Node label="HR Review" tone="sky" />
      <Arrow />
      <div className="relative">
        <div className="rotate-45 border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-amber-300">
          <span className="block -rotate-45 whitespace-nowrap">Approved?</span>
        </div>
        <span className="absolute -left-12 top-1/2 -translate-y-1/2 text-muted-foreground">No</span>
        <span className="absolute -right-10 top-1/2 -translate-y-1/2 text-muted-foreground">Yes</span>
      </div>
      <div className="mt-2 flex w-full justify-between gap-2 px-2">
        <Node label="Rejected" tone="rose" small />
        <Node label="Prepare Onboarding" tone="sky" small />
      </div>
      <Arrow />
      <Node label="IT Provisioning" tone="violet" />
      <Arrow />
      <Node label="Complete" tone="emerald" />
    </div>
  );
}

function Node({ label, tone, small }: { label: string; tone: "emerald" | "sky" | "violet" | "rose" | "amber"; small?: boolean }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    sky: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    violet: "bg-violet-500/20 text-violet-300 border-violet-500/40",
    rose: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  };
  return (
    <div className={`rounded-md border px-3 py-1.5 font-medium ${tones[tone]} ${small ? "text-[10px]" : ""}`}>{label}</div>
  );
}

function Arrow() {
  return <div className="h-3 w-px bg-border" />;
}