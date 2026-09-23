import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { listWorkspaces } from "@/lib/api/workspaces.functions";
import { listWorkGraphAssignees } from "@/lib/api/work-graph.functions";
import {
  askConversationIntelligence,
  approveExtractionProposal,
  dismissExtractionProposal,
  extractWorkFromConversationSource,
  listExtractionProposals,
  type ExtractionProposalDTO,
} from "@/lib/api/conversation-work.functions";

type SourceType = "CHAT_CHANNEL" | "IMPORT";

const NONE = "__none__";

function ProposalCard({
  proposal,
  workspaces,
  people,
  onDone,
}: {
  proposal: ExtractionProposalDTO;
  workspaces: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(proposal.title);
  const [description, setDescription] = useState(proposal.description ?? "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(NONE);
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  const needsWork = proposal.kind === "TASK" || proposal.kind === "COMMITMENT";

  const approve = useMutation({
    mutationFn: async () =>
      approveExtractionProposal({
        data: {
          proposalId: proposal.id,
          title: title.trim(),
          description: description.trim() || null,
          workspaceId: needsWork ? workspaceId || null : null,
          assigneeId: assigneeId !== NONE ? assigneeId : null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          priority,
        },
      }),
    onSuccess: () => {
      toast.success(t("cw.approved"));
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const dismiss = useMutation({
    mutationFn: async () => dismissExtractionProposal({ data: { proposalId: proposal.id } }),
    onSuccess: () => {
      toast.success(t("cw.dismissed"));
      onDone();
    },
  });

  if (proposal.status !== "PENDING") {
    return (
      <li className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {t(`cw.kind${proposal.kind}` as never)}
          </Badge>
          <span className="truncate font-medium">{proposal.title}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {proposal.status === "APPROVED" ? t("cw.approved") : t("cw.dismissed")}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className="grid gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {t(`cw.kind${proposal.kind}` as never)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t("cw.confidence")}: {Math.round(proposal.confidence * 100)}%
        </span>
        {proposal.missingFields.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {t("cw.missing")}: {proposal.missingFields.join(", ")}
          </Badge>
        )}
      </div>

      <Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

      {proposal.evidence && (
        <blockquote className="border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
          {t("cw.evidence")}: {proposal.evidence}
        </blockquote>
      )}

      {needsWork && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("cw.workspace")}</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("cw.workspaceRequired")} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("cw.assignee")}</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("cw.assigneeEmpty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("cw.assigneeEmpty")}</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("cw.due")}</Label>
            <Input
              type="datetime-local"
              className="h-11"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("cw.priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          className="h-11 flex-1"
          disabled={approve.isPending || (needsWork && !workspaceId)}
          onClick={() => approve.mutate()}
        >
          {approve.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span className="ml-2">{t("cw.approve")}</span>
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate()}
        >
          <X className="h-4 w-4" />
          <span className="ml-2">{t("cw.dismiss")}</span>
        </Button>
      </div>
    </li>
  );
}

export function ConversationIntelligencePanel({
  sourceType,
  sourceId,
}: {
  sourceType: SourceType;
  sourceId: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState<{
    answer: string;
    citations: Array<{ excerpt: string }>;
  } | null>(null);

  const proposalsQuery = useQuery({
    queryKey: ["extraction-proposals", sourceType, sourceId],
    queryFn: () => listExtractionProposals({ data: { sourceType, sourceId } }),
  });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: () => listWorkspaces() });
  const peopleQuery = useQuery({
    queryKey: ["work-graph-assignees"],
    queryFn: () => listWorkGraphAssignees(),
  });

  const extract = useMutation({
    mutationFn: async () => extractWorkFromConversationSource({ data: { sourceType, sourceId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["extraction-proposals", sourceType, sourceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const ask = useMutation({
    mutationFn: async (question: string) =>
      askConversationIntelligence({ data: { sourceType, sourceId, question } }),
    onSuccess: (res) => setAnswer(res),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const quick: Array<[string, string]> = [
    [t("cw.catchUp"), "Tóm tắt ngắn gọn những gì tôi chưa đọc trong hội thoại này."],
    [t("cw.decided"), "Những quyết định nào đã được chốt trong hội thoại này?"],
    [t("cw.stillOpen"), "Những việc nào còn đang treo, chưa có kết luận?"],
    [t("cw.promises"), "Có lời hứa hay cam kết nào với khách hàng/đối tác không?"],
  ];

  return (
    <div className="grid content-start gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium">{t("cw.intelligence")}</p>
        <div className="flex flex-wrap gap-2">
          {quick.map(([label, question]) => (
            <Button
              key={label}
              variant="outline"
              className="h-11 text-xs"
              disabled={ask.isPending}
              onClick={() => ask.mutate(question)}
            >
              {label}
            </Button>
          ))}
        </div>
        {ask.isPending && <p className="text-xs text-muted-foreground">{t("cw.asking")}</p>}
        {answer && (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm">{answer.answer}</p>
            {answer.citations.length > 0 && (
              <div className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">{t("cw.citations")}</p>
                {answer.citations.map((c, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground"
                  >
                    {c.excerpt}
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{t("cw.proposals")}</p>
          <Button
            className="ml-auto h-11"
            disabled={extract.isPending}
            onClick={() => extract.mutate()}
          >
            {extract.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-2">{extract.isPending ? t("cw.extracting") : t("cw.extract")}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("cw.aiHint")}</p>
        {proposalsQuery.data && proposalsQuery.data.length > 0 ? (
          <ul className="grid gap-3">
            {proposalsQuery.data.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                workspaces={(workspacesQuery.data ?? []).map((w) => ({ id: w.id, name: w.name }))}
                people={peopleQuery.data ?? []}
                onDone={() =>
                  void qc.invalidateQueries({
                    queryKey: ["extraction-proposals", sourceType, sourceId],
                  })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("cw.noProposals")}</p>
        )}
      </div>
    </div>
  );
}
