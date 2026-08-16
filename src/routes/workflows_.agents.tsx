// WORKFLOW & AGENT BUILDER V1 — điều kiện → AI đề xuất → người duyệt.
// Không có execute tự động: mọi thay đổi dữ liệu chỉ xảy ra khi người dùng bấm xác nhận trên thẻ đề xuất.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Plus, Play, Sparkles, Trash2, Pencil, ShieldCheck, History, Loader2, ArrowLeft } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  listWorkflowAgents,
  saveWorkflowAgent,
  setWorkflowAgentEnabled,
  deleteWorkflowAgent,
  evaluateWorkflowAgent,
  recordAgentProposal,
  listWorkflowAgentRuns,
  assertAgentActionAllowed,
  type AgentEvaluation,
} from "@/lib/api/workflow-agents.functions";
import { proposeAiAction } from "@/lib/api/ai-actions.functions";
import { ActionProposalCard } from "@/components/ai/action-proposal-card";
import type { ProposedAiAction } from "@/domain/ai-actions/contracts";
import { AI_ACTION_TOOLS, AI_ACTION_TYPES, AI_ACTION_SOURCES, type AiActionType, type AiActionSource } from "@/domain/ai-actions/contracts";
import {
  AGENT_TRIGGERS,
  AGENT_TRIGGER_LABELS,
  CONDITION_OPERATORS,
  OPERATOR_LABELS,
  AI_ACTION_SOURCE_LABELS,
  normalizeAllowedActionTypes,
  normalizeAllowedSources,
  buildAgentQuery,
  conditionFieldsFor,
  describeCondition,
  type AgentCondition,
  type AgentTrigger,
} from "@/domain/workflow-agents/contracts";

export const Route = createFileRoute("/workflows_/agents")({
  head: () => ({
    meta: [
      { title: "Agent Builder · UNIWORK" },
      { name: "description", content: "Thiết kế agent theo điều kiện: AI đề xuất, con người phê duyệt, không tự động thực thi." },
      { property: "og:title", content: "Agent Builder · UNIWORK" },
      { property: "og:description", content: "Điều kiện → AI đề xuất → phê duyệt. Không có agent tự trị." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentBuilderPage,
});

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: AgentTrigger;
  conditions: AgentCondition[] | null;
  action_type: AiActionType;
  allowed_action_types: string[] | null;
  allowed_sources: string[] | null;
  instruction: string;
  enabled: boolean;
};

const emptyDraft = (workspaceId: string) => ({
  id: null as string | null,
  workspaceId,
  name: "",
  description: "",
  triggerType: "TASK_OVERDUE" as AgentTrigger,
  conditions: [] as AgentCondition[],
  actionType: "CREATE_TASK" as AiActionType,
  allowedActionTypes: [...AI_ACTION_TYPES] as AiActionType[],
  allowedSources: ["WORKFLOW_AGENT"] as AiActionSource[],
  instruction: "",
  enabled: true,
});

function AgentBuilderPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const [evaluation, setEvaluation] = useState<(AgentEvaluation & { agentName: string }) | null>(null);
  const [proposals, setProposals] = useState<ProposedAiAction[]>([]);
  const [proposing, setProposing] = useState<string | null>(null);

  const wsQuery = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const workspaces = (wsQuery.data ?? []) as { id: string; name: string }[];
  const activeWs = workspaceId || workspaces[0]?.id || "";

  const agentsQuery = useQuery({
    queryKey: ["workflow-agents", activeWs],
    queryFn: () => listWorkflowAgents({ data: { workspaceId: activeWs } }),
    enabled: !!activeWs,
  });
  const agents = (agentsQuery.data ?? []) as unknown as AgentRow[];

  const runsQuery = useQuery({
    queryKey: ["workflow-agent-runs", activeWs],
    queryFn: () => listWorkflowAgentRuns({ data: { workspaceId: activeWs, limit: 20 } }),
    enabled: !!activeWs,
  });

  const save = useServerFn(saveWorkflowAgent);
  const toggle = useServerFn(setWorkflowAgentEnabled);
  const remove = useServerFn(deleteWorkflowAgent);
  const evaluate = useServerFn(evaluateWorkflowAgent);
  const propose = useServerFn(proposeAiAction);
  const record = useServerFn(recordAgentProposal);
  const assertAllowed = useServerFn(assertAgentActionAllowed);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workflow-agents", activeWs] });
    qc.invalidateQueries({ queryKey: ["workflow-agent-runs", activeWs] });
  };

  const saveMutation = useMutation({
    mutationFn: async (d: NonNullable<typeof draft>) =>
      save({
        data: {
          id: d.id,
          workspaceId: d.workspaceId,
          name: d.name,
          description: d.description || undefined,
          triggerType: d.triggerType,
          conditions: d.conditions,
          actionType: d.actionType,
          allowedActionTypes: d.allowedActionTypes.length ? d.allowedActionTypes : [d.actionType],
          allowedSources: d.allowedSources.length ? d.allowedSources : ["WORKFLOW_AGENT"],
          instruction: d.instruction,
          enabled: d.enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu agent");
      setDraft(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được agent"),
  });

  const runMutation = useMutation({
    mutationFn: async (a: AgentRow) => ({ agent: a, res: await evaluate({ data: { agentId: a.id } }) }),
    onSuccess: ({ agent, res }) => {
      setProposals([]);
      setEvaluation({ ...res, agentName: agent.name });
      invalidate();
      if (!res.matches.length) toast.info("Không có bản ghi nào khớp điều kiện");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không chạy được agent"),
  });

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === evaluation?.agentId) ?? null,
    [agents, evaluation],
  );

  const onPropose = async (candidateId: string) => {
    if (!activeAgent) return;
    const candidate = evaluation?.matches.find((m) => m.id === candidateId);
    if (!candidate) return;
    setProposing(candidateId);
    try {
      await assertAllowed({ data: { agentId: activeAgent.id, actionType: activeAgent.action_type, source: "WORKFLOW_AGENT" } });
      const proposal = await propose({
        data: {
          query: buildAgentQuery(
            { instruction: activeAgent.instruction, actionType: activeAgent.action_type, triggerType: activeAgent.trigger_type },
            candidate,
          ),
          actionType: activeAgent.action_type,
          source: "WORKFLOW_AGENT",
          workspaceId: activeWs,
          targetTaskId: activeAgent.action_type === "UPDATE_TASK_FIELDS" ? candidate.id : null,
        },
      });
      setProposals((p) => [proposal, ...p.filter((x) => x.actionId !== proposal.actionId)]);
      await record({ data: { agentId: activeAgent.id, proposalId: proposal.actionId, status: "PROPOSED" } });
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo được đề xuất");
      await record({ data: { agentId: activeAgent.id, status: "FAILED", error: String(e?.message ?? "") } }).catch(() => {});
    } finally {
      setProposing(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link to="/workflows" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Workflows
              </Link>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Bot className="h-6 w-6 text-primary" /> Agent Builder
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Điều kiện → AI đề xuất → bạn phê duyệt. Agent không bao giờ tự thực thi.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={activeWs} onValueChange={setWorkspaceId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Chọn không gian" /></SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={!activeWs} onClick={() => setDraft(emptyDraft(activeWs))}>
                <Plus className="mr-1.5 h-4 w-4" /> Tạo agent
              </Button>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Chế độ an toàn V1: agent chỉ đọc dữ liệu và sinh đề xuất. Mọi thay đổi cần bạn xác nhận trên thẻ đề xuất
              (không có tuỳ chọn tự động thực thi).
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-3">
              {agentsQuery.isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
              {!agentsQuery.isLoading && agents.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Chưa có agent nào. Tạo agent đầu tiên để tự động phát hiện việc cần xử lý.
                </div>
              )}
              {agents.map((a) => {
                const fields = conditionFieldsFor(a.trigger_type);
                const conds = a.conditions ?? [];
                return (
                  <article key={a.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{a.name}</h2>
                        {a.description && <p className="mt-0.5 text-sm text-muted-foreground">{a.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">{AGENT_TRIGGER_LABELS[a.trigger_type]}</Badge>
                          <Badge variant="outline">{AI_ACTION_TOOLS[a.action_type]?.label ?? a.action_type}</Badge>
                          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Cần phê duyệt</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Allowlist:</span>
                          {normalizeAllowedActionTypes(a.allowed_action_types).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[11px]">{AI_ACTION_TOOLS[t]?.label ?? t}</Badge>
                          ))}
                          {normalizeAllowedSources(a.allowed_sources).map((s) => (
                            <Badge key={s} variant="outline" className="text-[11px]">{AI_ACTION_SOURCE_LABELS[s]}</Badge>
                          ))}
                        </div>
                        {conds.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Điều kiện: {conds.map((c) => describeCondition(c, fields)).join(" và ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={a.enabled}
                          onCheckedChange={async (v) => {
                            await toggle({ data: { agentId: a.id, enabled: v } });
                            invalidate();
                          }}
                        />
                        <Button size="sm" variant="outline" onClick={() => runMutation.mutate(a)} disabled={runMutation.isPending}>
                          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          <span className="ml-1.5 hidden sm:inline">Chạy điều kiện</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              id: a.id,
                              workspaceId: activeWs,
                              name: a.name,
                              description: a.description ?? "",
                              triggerType: a.trigger_type,
                              conditions: a.conditions ?? [],
                              actionType: a.action_type,
                              allowedActionTypes: normalizeAllowedActionTypes(a.allowed_action_types),
                              allowedSources: normalizeAllowedSources(a.allowed_sources),
                              instruction: a.instruction ?? "",
                              enabled: a.enabled,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            await remove({ data: { agentId: a.id } });
                            toast.success("Đã xoá agent");
                            invalidate();
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {evaluation && (
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold">
                    Kết quả điều kiện · {evaluation.agentName}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Đã quét {evaluation.evaluated} bản ghi · {evaluation.matches.length} khớp điều kiện.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {evaluation.matches.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                        <span className="min-w-0 text-sm">{m.summary}</span>
                        <Button size="sm" variant="secondary" disabled={proposing === m.id} onClick={() => onPropose(m.id)}>
                          {proposing === m.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                          Tạo đề xuất
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {proposals.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Đề xuất chờ bạn phê duyệt</h3>
                  {proposals.map((p) => <ActionProposalCard key={p.actionId} proposal={p} />)}
                </section>
              )}
            </section>

            <aside className="rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> Lịch sử agent</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {(runsQuery.data ?? []).map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("vi-VN")}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={r.status === "NO_MATCH" ? "outline" : "secondary"}>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{r.matched_count} khớp</span>
                    </span>
                  </li>
                ))}
                {(runsQuery.data ?? []).length === 0 && <li className="text-muted-foreground">Chưa có lần chạy nào.</li>}
              </ul>
            </aside>
          </div>
        </main>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{draft?.id ? "Sửa agent" : "Tạo agent"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tên agent</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="VD: Nhắc việc quá hạn" />
              </div>
              <div className="space-y-1.5">
                <Label>Mô tả</Label>
                <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Điều kiện kích hoạt</Label>
                  <Select value={draft.triggerType} onValueChange={(v) => setDraft({ ...draft, triggerType: v as AgentTrigger, conditions: [] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGENT_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{AGENT_TRIGGER_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Hành động AI đề xuất</Label>
                  <Select value={draft.actionType} onValueChange={(v) => setDraft({ ...draft, actionType: v as AiActionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {draft.allowedActionTypes.map((t) => <SelectItem key={t} value={t}>{AI_ACTION_TOOLS[t].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Chỉ liệt kê các loại đang bật trong allowlist bên dưới.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <Label className="text-sm">Allowlist AI Action</Label>
                    <p className="text-xs text-muted-foreground">
                      Bật/tắt loại hành động và nguồn mà agent này được phép đề xuất. Ngoài danh sách này, hệ thống chặn ở cả UI và máy chủ.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Loại hành động</p>
                  {AI_ACTION_TYPES.map((t) => {
                    const on = draft.allowedActionTypes.includes(t);
                    const last = on && draft.allowedActionTypes.length === 1;
                    return (
                      <div key={t} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{AI_ACTION_TOOLS[t].label}</p>
                          <p className="text-xs text-muted-foreground">Rủi ro {AI_ACTION_TOOLS[t].risk} · luôn cần phê duyệt</p>
                        </div>
                        <Switch
                          checked={on}
                          disabled={last}
                          onCheckedChange={(v) => {
                            const next = v
                              ? [...draft.allowedActionTypes, t]
                              : draft.allowedActionTypes.filter((x) => x !== t);
                            if (!next.length) return;
                            setDraft({
                              ...draft,
                              allowedActionTypes: AI_ACTION_TYPES.filter((x) => next.includes(x)),
                              actionType: next.includes(draft.actionType) ? draft.actionType : next[0]!,
                            });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nguồn được phép</p>
                  {AI_ACTION_SOURCES.map((s) => {
                    const on = draft.allowedSources.includes(s);
                    const last = on && draft.allowedSources.length === 1;
                    return (
                      <div key={s} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3">
                        <p className="truncate text-sm">{AI_ACTION_SOURCE_LABELS[s]}</p>
                        <Switch
                          checked={on}
                          disabled={last}
                          onCheckedChange={(v) => {
                            const next = v ? [...draft.allowedSources, s] : draft.allowedSources.filter((x) => x !== s);
                            if (!next.length) return;
                            setDraft({ ...draft, allowedSources: AI_ACTION_SOURCES.filter((x) => next.includes(x)) });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Bộ lọc điều kiện (AND)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        conditions: [...draft.conditions, { field: conditionFieldsFor(draft.triggerType)[0]!.field, operator: "eq", value: "" }],
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Thêm điều kiện
                  </Button>
                </div>
                {draft.conditions.map((c, i) => {
                  const fields = conditionFieldsFor(draft.triggerType);
                  const def = fields.find((f) => f.field === c.field);
                  const update = (patch: Partial<AgentCondition>) =>
                    setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                      <Select value={c.field} onValueChange={(v) => update({ field: v, value: "" })}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fields.map((f) => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={c.operator} onValueChange={(v) => update({ operator: v as AgentCondition["operator"] })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPERATORS.map((o) => <SelectItem key={o} value={o}>{OPERATOR_LABELS[o]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {c.operator !== "is_empty" && c.operator !== "is_not_empty" && (
                        def?.kind === "enum" ? (
                          <Select value={c.value} onValueChange={(v) => update({ value: v })}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="Giá trị" /></SelectTrigger>
                            <SelectContent>
                              {def.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="w-40"
                            type={def?.kind === "number" ? "number" : "text"}
                            value={c.value}
                            onChange={(e) => update({ value: e.target.value })}
                            placeholder="Giá trị"
                          />
                        )
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label>Hướng dẫn cho AI</Label>
                <Textarea
                  rows={3}
                  value={draft.instruction}
                  onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
                  placeholder="VD: tạo công việc theo dõi và nhắc người phụ trách xử lý trong 2 ngày"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Bắt buộc phê duyệt</p>
                  <p className="text-xs text-muted-foreground">Không thể tắt trong V1 — agent chỉ được đề xuất.</p>
                </div>
                <Switch checked disabled />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>Huỷ</Button>
            <Button
              disabled={!draft?.name.trim() || saveMutation.isPending}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Lưu agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}