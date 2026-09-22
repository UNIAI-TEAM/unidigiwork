import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FolderKanban,
  Gauge,
  GitBranch,
  History,
  Library,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useActiveTenant } from "@/features/tenants/hooks";
import { listCalendarEvents } from "@/lib/api/calendar.functions";
import { listProjects, getProject, type ProjectWithStats } from "@/lib/api/projects.functions";
import { listPeople, getPerson } from "@/lib/api/people.functions";
import { listKnowledgeArticles, getKnowledgeArticle } from "@/lib/api/knowledge.functions";
import { listWorkflows, getWorkflow } from "@/lib/api/workflows.functions";
import { getAiBrainOverview, getProposalTracking } from "@/lib/api/ai-brain.functions";
import {
  listAiSkills,
  getAiSkillsPermission,
  setAiSkillEnabled,
} from "@/lib/api/ai-skills.functions";
import { listWorkflowAgents } from "@/lib/api/workflow-agents.functions";
import {
  listHumanAgents,
  saveHumanAgent,
  setHumanAgentRolePolicy,
  type AssignRole,
} from "@/lib/api/human-agents.functions";
import { listDecisions } from "@/lib/api/decisions.functions";
import { listWorkApprovals } from "@/lib/api/work-deliverables.functions";
import { getReportOverview } from "@/lib/api/reports.functions";
import { getCeoOverview } from "@/lib/api/ceo.functions";
import { getMyAdminAccess, getAdminStats } from "@/lib/api/admin.functions";
import { listPlans, getActiveSubscription } from "@/lib/api/billing.functions";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { toast } from "sonner";

type Copy = { search: string; empty: string; loading: string; noWorkspace: string };
const copy = {
  vi: {
    search: "Tìm kiếm…",
    empty: "Chưa có dữ liệu phù hợp.",
    loading: "Đang tải…",
    noWorkspace: "Hãy chọn một không gian làm việc.",
  },
  en: {
    search: "Search…",
    empty: "No matching data.",
    loading: "Loading…",
    noWorkspace: "Select a workspace first.",
  },
};

function Page({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
function State({ loading, empty, text }: { loading?: boolean; empty?: boolean; text: Copy }) {
  if (loading)
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {text.empty}
      </div>
    );
  return null;
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-11 pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
function useCopy() {
  const { lang } = useI18n();
  return copy[lang === "en" ? "en" : "vi"];
}
function useWorkspaceId() {
  const { workspaceId, workspaces } = useActiveWorkspace();
  return workspaceId ?? workspaces[0]?.id ?? "";
}
const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";

function useOpsCopy() {
  const { t, lang } = useI18n();
  const text = (key: Key, vars?: Record<string, string | number>) => {
    let value = t(key);
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replace(`{${name}}`, String(replacement));
    }
    return value;
  };
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat(localeTag(lang), {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  return { text, date };
}

function StatusBadge({ value }: { value: string }) {
  const { text } = useOpsCopy();
  const key = `ops.status.${value}` as Key;
  return <Badge variant="outline">{text(key) === key ? value : text(key)}</Badge>;
}

export function MobileProjectsPage() {
  const c = useCopy(),
    { text } = useOpsCopy(),
    navigate = useNavigate(),
    workspaceId = useWorkspaceId(),
    [q, setQ] = useState("");
  const fn = useServerFn(listProjects);
  const query = useQuery({
    queryKey: ["m-projects", workspaceId],
    queryFn: () => fn({ data: { workspaceId, limit: 100 } }),
    enabled: !!workspaceId,
  });
  const rows = useMemo(
    () =>
      ((query.data ?? []) as ProjectWithStats[]).filter((p) =>
        `${p.name} ${p.code ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [query.data, q],
  );
  return (
    <Page
      title={text("ops.projects.title")}
      subtitle={text("ops.projects.subtitle", { count: rows.length })}
    >
      <SearchBox value={q} onChange={setQ} placeholder={c.search} />
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((p) => (
          <li key={p.id}>
            <MobileListItem
              title={p.name}
              subtitle={p.description ?? p.code ?? undefined}
              meta={`${text("ops.projects.progress", { done: p.taskDone, total: p.taskTotal })}${p.taskOverdue ? ` · ${text("ops.projects.overdue", { count: p.taskOverdue })}` : ""}`}
              icon={<FolderKanban className="h-5 w-5" />}
              badge={<StatusBadge value={p.status} />}
              onClick={() =>
                void navigate({ to: "/m/projects/$id" as never, params: { id: p.id } as never })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileProjectDetail({ id }: { id: string }) {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    navigate = useNavigate(),
    fn = useServerFn(getProject);
  const q = useQuery({
    queryKey: ["m-project", id],
    queryFn: () => fn({ data: { projectId: id } }),
  });
  const data = q.data as any;
  return (
    <Page
      title={data?.project?.name ?? text("ops.projects.title")}
      subtitle={data?.project?.description ?? undefined}
      action={
        <Button className="h-11 w-11" size="icon" variant="ghost" onClick={() => history.back()}>
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{text("ops.common.back")}</span>
        </Button>
      }
    >
      <State loading={q.isLoading} empty={!q.isLoading && !data} text={c} />
      {data ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              [text("ops.projects.tasks"), data.tasks?.length ?? 0],
              [
                text("ops.projects.done"),
                data.tasks?.filter((x: any) => x.status === "done").length ?? 0,
              ],
              [text("ops.projects.due"), date(data.project.due_date)],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-1 truncate font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <ul className="grid gap-2">
            {(data.tasks ?? []).map((t: any) => (
              <li key={t.id}>
                <MobileListItem
                  title={t.title}
                  subtitle={t.assignees?.map((a: any) => a.name).join(", ")}
                  meta={
                    t.due_at
                      ? `${text("ops.projects.due")} ${date(t.due_at)}`
                      : text("ops.projects.noDue")
                  }
                  badge={<Badge variant="secondary">{t.status}</Badge>}
                  onClick={() => void navigate({ to: "/m/tasks/$id", params: { id: t.id } })}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Page>
  );
}
export function MobileCalendarPage() {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    navigate = useNavigate(),
    workspaceId = useWorkspaceId(),
    [q, setQ] = useState("");
  const fn = useServerFn(listCalendarEvents);
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 45);
  const query = useQuery({
    queryKey: ["m-calendar", workspaceId],
    queryFn: () =>
      fn({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          ...(workspaceId ? { workspaceId } : {}),
        },
      }),
  });
  const rows = (query.data ?? []).filter((e) => e.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title={text("ops.calendar.title")} subtitle={text("ops.calendar.subtitle")}>
      <SearchBox value={q} onChange={setQ} placeholder={c.search} />
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((e) => (
          <li key={`${e.kind}-${e.id}`}>
            <MobileListItem
              title={e.title}
              subtitle={e.project ?? e.location ?? undefined}
              meta={date(e.at)}
              icon={<CalendarDays className="h-5 w-5" />}
              badge={<Badge variant="outline">{text(`ops.calendar.${e.kind}` as Key)}</Badge>}
              onClick={() =>
                void navigate({
                  to: (e.kind === "meeting" ? "/m/meet/$id" : "/m/tasks/$id") as never,
                  params: { id: e.id } as never,
                })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobilePeoplePage() {
  const c = useCopy(),
    { text } = useOpsCopy(),
    navigate = useNavigate(),
    [q, setQ] = useState("");
  const fn = useServerFn(listPeople);
  const query = useQuery({ queryKey: ["m-people"], queryFn: () => fn() });
  const rows = (query.data?.people ?? []).filter((p) =>
    `${p.name} ${p.department} ${p.title}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Page
      title={text("ops.people.title")}
      subtitle={text("ops.people.subtitle", { count: rows.length })}
    >
      <SearchBox value={q} onChange={setQ} placeholder={c.search} />
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((p) => (
          <li key={p.id}>
            <MobileListItem
              title={p.name}
              subtitle={[p.title, p.department].filter(Boolean).join(" · ")}
              meta={p.email}
              icon={<Users className="h-5 w-5" />}
              badge={<Badge variant="secondary">{p.role}</Badge>}
              onClick={() =>
                void navigate({ to: "/m/people/$id" as never, params: { id: p.id } as never })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobilePersonDetail({ id }: { id: string }) {
  const c = useCopy(),
    { text } = useOpsCopy(),
    fn = useServerFn(getPerson);
  const q = useQuery({ queryKey: ["m-person", id], queryFn: () => fn({ data: { userId: id } }) });
  const p = q.data?.person;
  return (
    <Page title={p?.name ?? text("ops.people.profile")} subtitle={p?.title || p?.department}>
      <State loading={q.isLoading} empty={!q.isLoading && !p} text={c} />
      {p ? (
        <div className="grid gap-3">
          {[
            [text("ops.people.email"), p.email],
            [text("ops.people.phone"), p.phone],
            [text("ops.people.department"), p.department],
            [text("ops.people.team"), p.team],
            [text("ops.people.location"), p.location],
            [text("ops.people.role"), p.role],
            [text("ops.people.skills"), p.skills.join(", ")],
            [text("ops.people.about"), p.about],
          ].map(([k, v]) => (
            <div key={k} className="border-b border-border py-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="mt-1 break-words text-sm">{v || "—"}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Page>
  );
}

export function MobileKnowledgePage() {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    navigate = useNavigate(),
    [q, setQ] = useState("");
  const fn = useServerFn(listKnowledgeArticles);
  const query = useQuery({
    queryKey: ["m-knowledge", q],
    queryFn: () => fn({ data: { status: "all", search: q } }),
  });
  const rows = query.data?.articles ?? [];
  return (
    <Page title={text("ops.knowledge.title")} subtitle={text("ops.knowledge.subtitle")}>
      <SearchBox value={q} onChange={setQ} placeholder={c.search} />
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((a) => (
          <li key={a.id}>
            <MobileListItem
              title={a.title}
              subtitle={a.summary}
              meta={`${a.category} · ${date(a.updatedAt)}`}
              icon={<Library className="h-5 w-5" />}
              badge={<StatusBadge value={a.status} />}
              onClick={() =>
                void navigate({
                  to: "/m/knowledge/$slug" as never,
                  params: { slug: a.slug } as never,
                })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileKnowledgeDetail({ slug }: { slug: string }) {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    fn = useServerFn(getKnowledgeArticle);
  const query = useQuery({
    queryKey: ["m-knowledge", slug],
    queryFn: () => fn({ data: { slug } }),
  });
  const article = query.data?.article;
  return (
    <Page
      title={article?.title ?? text("ops.knowledge.title")}
      subtitle={article?.summary}
      action={
        <Button className="h-11 w-11" size="icon" variant="ghost" onClick={() => history.back()}>
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{text("ops.common.back")}</span>
        </Button>
      }
    >
      <State loading={query.isLoading} empty={!query.isLoading && !article} text={c} />
      {article ? (
        <article className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={article.status} />
            <Badge variant="secondary">{article.category}</Badge>
            <span className="text-xs text-muted-foreground">
              {text("ops.knowledge.views", { count: article.viewCount })} ·{" "}
              {date(article.updatedAt)}
            </span>
          </div>
          {article.tags.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">{text("ops.knowledge.tags")}</h2>
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <h2 className="mb-3 text-base font-semibold">{text("ops.knowledge.content")}</h2>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {article.content}
            </div>
          </section>
        </article>
      ) : null}
    </Page>
  );
}
export function MobileWorkflowsPage() {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    navigate = useNavigate(),
    workspaceId = useWorkspaceId();
  const fn = useServerFn(listWorkflows);
  const query = useQuery({
    queryKey: ["m-workflows", workspaceId],
    queryFn: () => fn({ data: { workspaceId, limit: 100 } }),
    enabled: !!workspaceId,
  });
  const rows = (query.data ?? []) as any[];
  return (
    <Page title={text("ops.workflows.title")} subtitle={text("ops.workflows.subtitle")}>
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((w) => (
          <li key={w.id}>
            <MobileListItem
              title={w.name}
              subtitle={w.description ?? undefined}
              meta={date(w.updated_at)}
              icon={<Workflow className="h-5 w-5" />}
              badge={<StatusBadge value={w.status} />}
              onClick={() =>
                void navigate({ to: "/m/workflows/$id" as never, params: { id: w.id } as never })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileWorkflowDetail({ id }: { id: string }) {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    fn = useServerFn(getWorkflow),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: ["m-workflow", id],
    queryFn: () => fn({ data: { workflowId: id } }),
  });
  const data = query.data as any;
  const definition = data?.workflow?.definition as { steps?: unknown[] } | undefined;
  return (
    <Page
      title={data?.workflow?.name ?? text("ops.workflows.title")}
      subtitle={data?.workflow?.description ?? undefined}
      action={
        <Button className="h-11 w-11" size="icon" variant="ghost" onClick={() => history.back()}>
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{text("ops.common.back")}</span>
        </Button>
      }
    >
      <State loading={query.isLoading} empty={!query.isLoading && !data} text={c} />
      {data ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusBadge value={data.workflow.status} />
            <Badge variant="secondary">
              {text("ops.workflows.steps", { count: definition?.steps?.length ?? 0 })}
            </Badge>
          </div>
          <section>
            <h2 className="mb-2 text-sm font-semibold">{text("ops.workflows.triggers")}</h2>
            <div className="grid gap-2">
              {data.triggers.map((trigger: any) => (
                <MobileListItem
                  key={trigger.id}
                  title={trigger.name ?? trigger.trigger_type ?? "Trigger"}
                  subtitle={trigger.event_type ?? trigger.cron_expression ?? undefined}
                  right={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold">{text("ops.workflows.runs")}</h2>
            <div className="grid gap-2">
              {data.runs.map((run: any) => (
                <MobileListItem
                  key={run.id}
                  title={run.status}
                  meta={date(run.started_at ?? run.created_at)}
                  onClick={() => void navigate({ to: `/m/workflows/${id}?run=${run.id}` as never })}
                />
              ))}
            </div>
            {!data.runs.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {text("ops.workflows.noRuns")}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </Page>
  );
}
export function MobileAiBrainPage() {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    navigate = useNavigate(),
    workspaceId = useWorkspaceId();
  const fn = useServerFn(getAiBrainOverview);
  const query = useQuery({
    queryKey: ["m-ai-brain", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId || null } }),
  });
  const d = query.data;
  return (
    <Page title={text("ops.ai.title")} subtitle={text("ops.ai.subtitle")}>
      <State loading={query.isLoading} empty={!d} text={c} />
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              [text("ops.ai.pending"), d.metrics.pending],
              [text("ops.ai.approved"), d.metrics.approvedThisWeek],
              [text("ops.ai.acceptance"), `${d.metrics.acceptanceRate}%`],
              [text("ops.ai.tokens"), d.metrics.tokensThisWeek],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-1 text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void navigate({ to: "/m/ai-brain/tracking" as never })}
            >
              {text("ops.ai.tracking")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void navigate({ to: "/m/ai-skills" })}
            >
              {text("ops.ai.skills")}
            </Button>
          </div>
          {d.disabledSkills.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">{text("ops.ai.disabledSkills")}</h2>
              <div className="flex flex-wrap gap-2">
                {d.disabledSkills.map((skill) => (
                  <Badge key={skill.id} variant="secondary">
                    {skill.name}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
          <ul className="grid gap-2">
            {d.log.map((x) => (
              <li key={x.id}>
                <MobileListItem
                  title={x.title}
                  subtitle={x.description ?? undefined}
                  meta={date(x.createdAt)}
                  icon={<BrainCircuit className="h-5 w-5" />}
                  badge={<Badge variant="outline">{x.status}</Badge>}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Page>
  );
}
export function MobileAiTrackingPage() {
  const c = useCopy(),
    { text, date } = useOpsCopy(),
    workspaceId = useWorkspaceId(),
    navigate = useNavigate();
  const fn = useServerFn(getProposalTracking);
  const query = useQuery({
    queryKey: ["m-ai-tracking", workspaceId],
    queryFn: () => fn({ data: { workspaceId, limit: 100 } }),
    enabled: !!workspaceId,
  });
  const rows = query.data ?? [];
  return (
    <Page title={text("ops.ai.tracking")}>
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <MobileListItem
              title={row.taskTitle ?? row.title}
              subtitle={[row.workerName, ...row.assignees.map((a) => a.name)]
                .filter(Boolean)
                .join(" · ")}
              meta={`${date(row.taskUpdatedAt ?? row.createdAt)}${row.taskProgress !== null ? ` · ${row.taskProgress}%` : ""}`}
              badge={<Badge variant="outline">{row.taskStatus ?? row.status}</Badge>}
              onClick={
                row.taskId
                  ? () =>
                      void navigate({ to: "/m/tasks/$id", params: { id: row.taskId as string } })
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileAiSkillsPage() {
  const c = useCopy(),
    { text } = useOpsCopy(),
    qc = useQueryClient(),
    workspaceId = useWorkspaceId();
  const fn = useServerFn(listAiSkills);
  const permissionFn = useServerFn(getAiSkillsPermission);
  const toggleFn = useServerFn(setAiSkillEnabled);
  const query = useQuery({
    queryKey: ["m-ai-skills", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId || null } }),
  });
  const permission = useQuery({
    queryKey: ["m-ai-skills-permission", workspaceId],
    queryFn: () => permissionFn({ data: { workspaceId: workspaceId || null } }),
  });
  const toggle = useMutation({
    mutationFn: (input: { skillId: string; enabled: boolean }) => toggleFn({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-ai-skills"] }),
    onError: () => toast.error(c.empty),
  });
  const rows = (query.data ?? []) as any[];
  return (
    <Page title={text("ops.skill.title")} subtitle={text("ops.skill.subtitle")}>
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((s) => (
          <li key={s.id}>
            <MobileListItem
              title={s.name}
              subtitle={s.description}
              meta={(s.action_types ?? []).join(" · ")}
              icon={<Sparkles className="h-5 w-5" />}
              badge={
                <Badge variant={s.enabled ? "default" : "secondary"}>
                  {s.enabled ? text("ops.human.enabled") : text("ops.human.disabled")}
                </Badge>
              }
              right={
                permission.data?.canEdit ? (
                  <Switch
                    aria-label={s.name}
                    checked={Boolean(s.enabled)}
                    disabled={toggle.isPending}
                    onCheckedChange={(enabled) => toggle.mutate({ skillId: s.id, enabled })}
                  />
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileWorkflowAgentsPage() {
  const c = useCopy(),
    workspaceId = useWorkspaceId();
  const fn = useServerFn(listWorkflowAgents);
  const query = useQuery({
    queryKey: ["m-workflow-agents", workspaceId],
    queryFn: () => fn({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });
  const rows = (query.data ?? []) as any[];
  return (
    <Page title="AI Agents" subtitle="Agent vận hành quy trình">
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((a) => (
          <li key={a.id}>
            <MobileListItem
              title={a.name}
              subtitle={a.description ?? undefined}
              meta={dateText(a.updated_at ?? a.created_at)}
              icon={<Bot className="h-5 w-5" />}
              badge={
                <Badge variant={a.enabled ? "default" : "secondary"}>
                  {a.enabled ? "Bật" : "Tắt"}
                </Badge>
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileHumanAgentsPage() {
  const c = useCopy(),
    { text } = useOpsCopy(),
    qc = useQueryClient(),
    fn = useServerFn(listHumanAgents);
  const saveFn = useServerFn(saveHumanAgent);
  const policyFn = useServerFn(setHumanAgentRolePolicy);
  const query = useQuery({ queryKey: ["m-human-agents"], queryFn: () => fn() });
  const rows = query.data?.agents ?? [];
  const save = useMutation({
    mutationFn: (agent: (typeof rows)[number]) =>
      saveFn({
        data: {
          userId: agent.userId,
          enabled: !agent.enabled,
          workEmail: agent.workEmail,
          domains: agent.domains,
          maxOpenTasks: agent.maxOpenTasks,
          note: agent.note,
          assignRole: agent.assignRole,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-human-agents"] }),
    onError: () => toast.error(c.empty),
  });
  const policy = useMutation({
    mutationFn: (input: { role: AssignRole; canReceiveTasks: boolean }) =>
      policyFn({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-human-agents"] }),
    onError: () => toast.error(c.empty),
  });
  return (
    <Page title={text("ops.human.title")} subtitle={text("ops.human.subtitle")}>
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      {query.data?.canManage ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{text("ops.human.rolePolicies")}</h2>
          <div className="grid gap-2">
            {(["admin", "manager", "staff"] as AssignRole[]).map((role) => (
              <div
                key={role}
                className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3"
              >
                <span className="text-sm font-medium">{role}</span>
                <Switch
                  aria-label={role}
                  checked={query.data?.rolePolicies[role]}
                  disabled={policy.isPending}
                  onCheckedChange={(canReceiveTasks) => policy.mutate({ role, canReceiveTasks })}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <ul className="grid gap-2">
        {rows.map((a) => (
          <li key={a.userId}>
            <MobileListItem
              title={a.name}
              subtitle={a.workEmail || a.accountEmail}
              meta={text("ops.human.capacity", { open: a.openTasks, max: a.maxOpenTasks })}
              icon={<BriefcaseBusiness className="h-5 w-5" />}
              badge={<Badge variant={a.enabled ? "default" : "secondary"}>{a.assignRole}</Badge>}
              right={
                query.data?.canManage ? (
                  <Switch
                    aria-label={a.name}
                    checked={a.enabled}
                    disabled={save.isPending}
                    onCheckedChange={() => save.mutate(a)}
                  />
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileDecisionsPage() {
  const c = useCopy(),
    fn = useServerFn(listDecisions);
  const query = useQuery({
    queryKey: ["m-decisions"],
    queryFn: () => fn({ data: { status: "ALL", limit: 100 } }),
  });
  const rows = query.data ?? [];
  return (
    <Page title="Quyết định" subtitle="Quyết định và trạng thái xác nhận">
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((d) => (
          <li key={d.id}>
            <MobileListItem
              title={d.title}
              subtitle={d.detail ?? undefined}
              meta={`${d.workspaceName ?? ""} · ${dateText(d.updatedAt)}`}
              icon={<GitBranch className="h-5 w-5" />}
              badge={<Badge variant="outline">{d.status}</Badge>}
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileApprovalsPage() {
  const c = useCopy(),
    navigate = useNavigate(),
    fn = useServerFn(listWorkApprovals);
  const query = useQuery({
    queryKey: ["m-approvals"],
    queryFn: () => fn({ data: { scope: "PENDING", limit: 50 } }),
  });
  const rows = query.data ?? [];
  return (
    <Page title="Phê duyệt" subtitle="Kết quả công việc đang chờ xem xét">
      <State loading={query.isLoading} empty={!rows.length} text={c} />
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.reviewId}>
            <MobileListItem
              title={r.productTitle}
              subtitle={r.workspaceName ?? undefined}
              meta={`Phiên bản ${r.version ?? r.currentVersion}${r.dueAt ? ` · Hạn ${dateText(r.dueAt)}` : ""}`}
              icon={<FileCheck2 className="h-5 w-5" />}
              badge={
                <Badge variant={r.stale ? "destructive" : "outline"}>
                  {r.stale ? "Đã cũ" : r.status}
                </Badge>
              }
              onClick={() =>
                void navigate({ to: "/m/work-products/$id", params: { id: r.productId } })
              }
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileReportsPage() {
  const c = useCopy(),
    workspaceId = useWorkspaceId(),
    fn = useServerFn(getReportOverview);
  const query = useQuery({
    queryKey: ["m-reports", workspaceId],
    queryFn: () => fn({ data: { ...(workspaceId ? { workspaceId } : {}) } }),
  });
  const d = query.data;
  return (
    <Page title="Báo cáo" subtitle="Tổng hợp 30 ngày gần nhất">
      <State loading={query.isLoading} empty={!d} text={c} />
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Công việc", d.kpis.tasks],
              ["Cuộc họp", d.kpis.meetings],
              ["Tài liệu", d.kpis.documents],
              ["Hoàn thành", d.tasks_by_status.done],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-1 text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <ul className="grid gap-2">
            {d.workspaces.map((w) => (
              <li key={w.id}>
                <MobileListItem
                  title={w.name}
                  subtitle={`${w.members} thành viên · ${w.tasks} công việc`}
                  meta={`${w.progress}% hoàn thành`}
                  icon={<Gauge className="h-5 w-5" />}
                  badge={<Badge variant="outline">{w.status}</Badge>}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Page>
  );
}
export function MobileCeoPage() {
  const c = useCopy(),
    workspaceId = useWorkspaceId(),
    fn = useServerFn(getCeoOverview);
  const query = useQuery({
    queryKey: ["m-ceo", workspaceId],
    queryFn: () => fn({ data: { period: "month", workspaceId: workspaceId || null } }),
  });
  const d = query.data;
  return (
    <Page title="Điều hành" subtitle="Tiến độ, chất lượng và năng suất tổ chức">
      <State loading={query.isLoading} empty={!d} text={c} />
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Tổng việc", d.totals.tasks.current],
              ["Hoàn thành", d.totals.completed.current],
              ["Đang chạy", d.totals.inProgress],
              ["Quá hạn", d.totals.overdue],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-1 text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Hiệu suất</p>
            <p className="mt-3 text-3xl font-semibold">{d.kpi.score ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              Điểm KPI · AI xử lý {d.split.aiSharePct}% công việc
            </p>
          </div>
        </>
      ) : null}
    </Page>
  );
}
export function MobileAdminPage() {
  const c = useCopy(),
    accessFn = useServerFn(getMyAdminAccess),
    statsFn = useServerFn(getAdminStats);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const stats = useQuery({
    queryKey: ["m-admin-stats"],
    queryFn: () => statsFn(),
    enabled: access.data?.canRead === true,
  });
  const d = stats.data;
  if (access.data && !access.data.canRead)
    return (
      <Page title="Quản trị">
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          Bạn không có quyền truy cập.
        </div>
      </Page>
    );
  return (
    <Page title="Quản trị" subtitle="Tổng quan hệ thống">
      <State loading={access.isLoading || stats.isLoading} empty={!d} text={c} />
      {d ? (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Người dùng", d.users],
            ["Không gian", d.workspaces],
            ["Tài liệu", d.documents],
            ["Thông báo", d.notifications],
            ["Quy tắc", d.rules],
            ["Luồng email", d.email_threads],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="mt-1 text-xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Page>
  );
}
export function MobileBillingPage() {
  const c = useCopy(),
    tenant = useActiveTenant(),
    plansFn = useServerFn(listPlans),
    subFn = useServerFn(getActiveSubscription);
  const tenantId = (tenant.data as any)?.tenantId ?? (tenant.data as any)?.id ?? "";
  const plans = useQuery({ queryKey: ["m-plans"], queryFn: () => plansFn() });
  const sub = useQuery({
    queryKey: ["m-subscription", tenantId],
    queryFn: () => subFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  return (
    <Page
      title="Gói & Thanh toán"
      subtitle={sub.data ? `${sub.data.planName} · ${sub.data.status}` : "Các gói hiện có"}
    >
      <State loading={plans.isLoading || sub.isLoading} empty={!plans.data?.length} text={c} />
      <ul className="grid gap-2">
        {(plans.data ?? []).map((p) => (
          <li key={p.id}>
            <MobileListItem
              title={p.name}
              subtitle={p.description ?? undefined}
              meta={`${p.features.filter((f) => f.enabled).length} tính năng`}
              icon={<CircleDollarSign className="h-5 w-5" />}
              badge={p.id === sub.data?.planId ? <Badge>Đang dùng</Badge> : undefined}
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}
export function MobileModuleHub({ kind }: { kind: "hr" | "meetings" }) {
  const navigate = useNavigate();
  const isHr = kind === "hr";
  return (
    <Page
      title={isHr ? "Quản lý nhân sự" : "Quản lý lịch họp"}
      subtitle={isHr ? "Nhân sự thật và năng lực nhận việc" : "Lịch họp và hoạt động liên quan"}
    >
      <div className="grid gap-2">
        {(isHr
          ? [
              { t: "Danh bạ nhân sự", s: "Hồ sơ, vai trò và kỹ năng", to: "/m/people", i: Users },
              {
                t: "Human Agent",
                s: "Năng lực và tải công việc",
                to: "/m/human-agents",
                i: BriefcaseBusiness,
              },
            ]
          : [
              {
                t: "Lịch",
                s: "Cuộc họp, công việc và deadline",
                to: "/m/calendar",
                i: CalendarDays,
              },
              { t: "Phòng họp", s: "Cuộc họp sắp tới và đã diễn ra", to: "/m/meet", i: Clock3 },
            ]
        ).map((x) => (
          <MobileListItem
            key={x.to}
            title={x.t}
            subtitle={x.s}
            icon={<x.i className="h-5 w-5" />}
            onClick={() => void navigate({ to: x.to as never })}
          />
        ))}
      </div>
    </Page>
  );
}
export function MobileAdminHub() {
  const navigate = useNavigate();
  return (
    <Page title="Quản trị">
      <div className="grid gap-2">
        {[
          { t: "Tổng quan hệ thống", to: "/m/admin/overview", i: ShieldCheck },
          { t: "Nhân sự", to: "/m/hr", i: Users },
          { t: "Điều hành", to: "/m/ceo", i: Activity },
          { t: "Báo cáo", to: "/m/reports", i: ListChecks },
          { t: "Gói & Thanh toán", to: "/m/billing", i: CircleDollarSign },
          { t: "Lịch sử quyết định", to: "/m/decisions", i: History },
        ].map((x) => (
          <MobileListItem
            key={x.to}
            title={x.t}
            icon={<x.i className="h-5 w-5" />}
            onClick={() => void navigate({ to: x.to as never })}
          />
        ))}
      </div>
    </Page>
  );
}
