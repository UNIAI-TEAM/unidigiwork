// Kết quả công việc — trang soạn thảo, phiên bản, bình luận, xem xét và trợ lý AI.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  History,
  Layers,
  Loader2,
  MessageSquare,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localeTag } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { workEntityHref } from "@/domain/work-graph/route-resolver";
import {
  WP_STATUSES,
  changeWorkDeliverableStatus,
  commentWorkDeliverable,
  decideWorkDeliverableReview,
  deleteWorkDeliverable,
  getWorkDeliverable,
  listWorkDeliverableContext,
  listWorkDeliverableLinks,
  listWorkDeliverableReviewers,
  requestWorkDeliverableReview,
  resolveWorkDeliverableComment,
  restoreWorkDeliverableVersion,
  runWorkDeliverableAi,
  saveWorkDeliverableVersion,
  updateWorkDeliverable,
} from "@/lib/api/work-deliverables.functions";

export const Route = createFileRoute("/_authenticated/work-products_/$id")({
  head: () => ({
    meta: [
      { title: "Soạn kết quả công việc — UNIWORK" },
      {
        name: "description",
        content: "Soạn thảo cùng nhân sự AI với nguồn ngữ cảnh chọn lọc, phiên bản bất biến và quy trình duyệt.",
      },
      { property: "og:title", content: "Soạn kết quả công việc — UNIWORK" },
      {
        property: "og:description",
        content: "Trình soạn thảo kết quả công việc với AI, phiên bản và xem xét trong UNIWORK.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkProductDetail,
});

const AI_ACTIONS = ["ASK", "IMPROVE", "SHORTEN", "EXPAND", "REWRITE", "TRANSLATE", "DRAFT", "NEXT_STEPS"] as const;

function WorkProductDetail() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-deliverable", id],
    queryFn: () => getWorkDeliverable({ data: { id } }),
  });
  const { data: sources } = useQuery({
    queryKey: ["work-deliverable-context", id],
    queryFn: () => listWorkDeliverableContext({ data: { id } }),
  });
  const { data: links } = useQuery({
    queryKey: ["work-deliverable-links", id],
    queryFn: () => listWorkDeliverableLinks({ data: { id } }),
  });
  const { data: reviewers } = useQuery({
    queryKey: ["work-deliverable-reviewers", id],
    queryFn: () => listWorkDeliverableReviewers({ data: { id } }),
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [aiAction, setAiAction] = useState<(typeof AI_ACTIONS)[number]>("IMPROVE");
  const [instruction, setInstruction] = useState("");
  const [aiOut, setAiOut] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [comment, setComment] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (!data?.product) return;
    setTitle(data.product.title);
    setContent(data.product.content ?? "");
    setDirty(false);
  }, [data?.product?.id, data?.product?.current_version]);

  useEffect(() => {
    if (!sources) return;
    setEnabled((prev) => {
      const next = { ...prev };
      for (const s of sources) {
        const k = `${s.type}:${s.id}`;
        if (next[k] === undefined) next[k] = s.type === "WORKSPACE" || s.type === "MEETING_ARTIFACT";
      }
      return next;
    });
  }, [sources]);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag(lang), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    [lang],
  );

  const activeSources = (sources ?? []).filter((s) => enabled[`${s.type}:${s.id}`]);
  const canEdit = data?.canEdit ?? false;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["work-deliverable", id] });
    qc.invalidateQueries({ queryKey: ["work-deliverables"] });
  };

  const save = useMutation({
    mutationFn: () => updateWorkDeliverable({ data: { id, title: title.trim() || undefined, content } }),
    onSuccess: () => {
      setDirty(false);
      toast.success(t("wp.saved"));
      invalidate();
    },
    onError: () => toast.error(t("wp.saveFailed")),
  });

  const snapshot = useMutation({
    mutationFn: async () => {
      if (dirty) await updateWorkDeliverable({ data: { id, title: title.trim() || undefined, content } });
      return saveWorkDeliverableVersion({
        data: {
          idempotencyKey: crypto.randomUUID(),
          id,
          aiGenerated: aiOut !== "",
          provenance: activeSources.map((s) => ({ type: s.type, id: s.id, title: s.title, stamp: s.stamp })),
        },
      });
    },
    onSuccess: (res) => {
      setDirty(false);
      toast.success(t("wp.snapshotDone").replace("{v}", String(res.version)));
      invalidate();
    },
    onError: () => toast.error(t("wp.saveFailed")),
  });

  const runAi = useMutation({
    mutationFn: () =>
      runWorkDeliverableAi({
        data: {
          id,
          action: aiAction,
          locale: lang,
          instruction: instruction.trim() || undefined,
          selection: content.slice(selection.start, selection.end) || undefined,
          sources: activeSources.map((s) => ({
            type: s.type,
            id: s.id,
            title: s.title,
            snippet: s.snippet,
            stamp: s.stamp,
          })),
        },
      }),
    onSuccess: (res) => setAiOut(res.output),
    onError: () => toast.error(t("wp.ai.failed")),
  });

  const applyAi = (mode: "insert" | "replace") => {
    if (!aiOut) return;
    const next =
      mode === "replace" && selection.end > selection.start
        ? content.slice(0, selection.start) + aiOut + content.slice(selection.end)
        : `${content}\n\n${aiOut}`;
    setContent(next);
    setDirty(true);
    setAiOut("");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data?.product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">{t("wp.notFound")}</p>
        <Button asChild variant="outline">
          <Link to="/work-products">{t("wp.back")}</Link>
        </Button>
      </div>
    );
  }

  const product = data.product;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="work-products" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
          {/* Editor */}
          <section className="min-w-0 flex-1 px-4 py-5 sm:px-6">
            <Link
              to="/work-products"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("wp.back")}
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`wp.type.${product.business_type}` as never)}</Badge>
              <Badge variant="secondary">{t(`wp.status.${product.status}` as never)}</Badge>
              <span className="text-xs text-muted-foreground">v{product.current_version}</span>
              {data.workspace?.name && <span className="text-xs text-muted-foreground">· {data.workspace.name}</span>}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {canEdit && (
                  <Select
                    value={product.status}
                    onValueChange={(v) =>
                      changeWorkDeliverableStatus({ data: { idempotencyKey: crypto.randomUUID(), id, status: v as (typeof WP_STATUSES)[number] } })
                        .then(invalidate)
                        .catch(() => toast.error(t("wp.saveFailed")))
                    }
                  >
                    <SelectTrigger className="h-9 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WP_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`wp.status.${s}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" onClick={() => snapshot.mutate()} disabled={!canEdit || snapshot.isPending} className="gap-2">
                  {snapshot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                  {t("wp.snapshot")}
                </Button>
                <Button onClick={() => save.mutate()} disabled={!canEdit || !dirty || save.isPending} className="gap-2">
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("wp.save")}
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("wp.delete")}
                    onClick={() => {
                      if (!window.confirm(t("wp.deleteConfirm"))) return;
                      deleteWorkDeliverable({ data: { idempotencyKey: crypto.randomUUID(), id } }).then(() => {
                        toast.success(t("wp.deleted"));
                        navigate({ to: "/work-products" });
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>

            {!canEdit && <p className="mt-3 text-xs text-muted-foreground">{t("wp.readonly")}</p>}

            <Input
              value={title}
              readOnly={!canEdit}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              className="mt-4 h-auto border-0 px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
            />

            <Textarea
              ref={editorRef}
              value={content}
              readOnly={!canEdit}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              onSelect={(e) => {
                const el = e.currentTarget;
                setSelection({ start: el.selectionStart, end: el.selectionEnd });
              }}
              className="mt-3 min-h-[60vh] resize-none rounded-xl border bg-card p-4 font-mono text-sm leading-relaxed"
            />
          </section>

          {/* Panel phải */}
          <aside className="w-full shrink-0 border-t bg-card/40 xl:w-[400px] xl:border-l xl:border-t-0">
            <Tabs defaultValue="ai" className="flex h-full flex-col">
              <TabsList className="m-3 grid grid-cols-3">
                <TabsTrigger value="ai" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> {t("wp.tab.ai")}
                </TabsTrigger>
                <TabsTrigger value="context" className="gap-1">
                  <Layers className="h-3.5 w-3.5" /> {t("wp.tab.context")}
                </TabsTrigger>
                <TabsTrigger value="versions" className="gap-1">
                  <History className="h-3.5 w-3.5" /> {t("wp.tab.versions")}
                </TabsTrigger>
              </TabsList>
              <TabsList className="mx-3 mb-3 grid grid-cols-3">
                <TabsTrigger value="comments" className="gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> {t("wp.tab.comments")}
                </TabsTrigger>
                <TabsTrigger value="review" className="gap-1">
                  <UserCheck className="h-3.5 w-3.5" /> {t("wp.tab.review")}
                </TabsTrigger>
                <TabsTrigger value="links">{t("wp.tab.links")}</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[70vh] px-3 pb-6">
                {/* AI */}
                <TabsContent value="ai" className="mt-0 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {AI_ACTIONS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAiAction(a)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          aiAction === a ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                        )}
                      >
                        {t(`wp.ai.${a}` as never)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {activeSources.length === 0 ? t("wp.ai.noSource") : t("wp.ai.selectionHint")}
                  </p>
                  <Textarea
                    rows={3}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={t("wp.ai.instruction")}
                  />
                  <Button onClick={() => runAi.mutate()} disabled={runAi.isPending} className="w-full gap-2">
                    {runAi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("wp.ai.run")}
                  </Button>
                  {aiOut && (
                    <div className="rounded-lg border bg-background p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("wp.ai.result")}</p>
                      <p className="whitespace-pre-wrap text-sm">{aiOut}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => applyAi("insert")} disabled={!canEdit}>
                          {t("wp.ai.insert")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyAi("replace")}
                          disabled={!canEdit || selection.end <= selection.start}
                        >
                          {t("wp.ai.replace")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(aiOut)}>
                          {t("wp.ai.copy")}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Nguồn ngữ cảnh */}
                <TabsContent value="context" className="mt-0 space-y-3">
                  <div>
                    <p className="text-sm font-medium">{t("wp.context.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("wp.context.hint")}</p>
                  </div>
                  {(sources ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("wp.context.empty")}</p>}
                  {(sources ?? []).map((s) => {
                    const k = `${s.type}:${s.id}`;
                    return (
                      <div key={k} className="flex items-start gap-3 rounded-lg border bg-background p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {s.type}
                            </Badge>
                            <p className="truncate text-sm font-medium">{s.title}</p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.snippet}</p>
                        </div>
                        <Switch
                          checked={!!enabled[k]}
                          onCheckedChange={(v) => setEnabled((p) => ({ ...p, [k]: v }))}
                          aria-label={s.title}
                        />
                      </div>
                    );
                  })}
                </TabsContent>

                {/* Phiên bản */}
                <TabsContent value="versions" className="mt-0 space-y-2">
                  {data.versions.length === 0 && <p className="text-sm text-muted-foreground">{t("wp.versions.empty")}</p>}
                  {data.versions.map((v: any) => (
                    <div key={v.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">v{v.version}</span>
                        {v.ai_generated && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Sparkles className="h-3 w-3" /> {t("wp.versions.byAi")}
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{fmt.format(new Date(v.created_at))}</span>
                      </div>
                      {v.authorName && <p className="mt-1 text-xs text-muted-foreground">{v.authorName}</p>}
                      {Array.isArray(v.provenance) && v.provenance.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] font-medium text-muted-foreground">{t("wp.versions.provenance")}</p>
                          <ul className="mt-1 space-y-0.5">
                            {v.provenance.map((p: any, i: number) => (
                              <li key={i} className="truncate text-[11px] text-muted-foreground">
                                [{p.type}] {p.title}
                                {p.stamp ? ` · ${p.stamp}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() =>
                            restoreWorkDeliverableVersion({
                              data: { idempotencyKey: crypto.randomUUID(), id, version: v.version },
                            }).then(() => {
                              toast.success(t("wp.versions.restored"));
                              invalidate();
                            })
                          }
                        >
                          {t("wp.versions.restore")}
                        </Button>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {/* Bình luận */}
                <TabsContent value="comments" className="mt-0 space-y-3">
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t("wp.comments.placeholder")}
                    />
                    <Button
                      size="sm"
                      disabled={!comment.trim()}
                      onClick={() =>
                        commentWorkDeliverable({
                          data: { idempotencyKey: crypto.randomUUID(), id, body: comment.trim() },
                        }).then(() => {
                          setComment("");
                          invalidate();
                        })
                      }
                    >
                      {t("wp.comments.send")}
                    </Button>
                  </div>
                  {data.comments.length === 0 && <p className="text-sm text-muted-foreground">{t("wp.comments.empty")}</p>}
                  {data.comments.map((c: any) => (
                    <div key={c.id} className={cn("rounded-lg border bg-background p-3", c.resolved_at && "opacity-60")}>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium">{c.authorName ?? "—"}</p>
                        <span className="ml-auto text-[11px] text-muted-foreground">{fmt.format(new Date(c.created_at))}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-7 gap-1 px-2 text-xs"
                        onClick={() =>
                          resolveWorkDeliverableComment({
                            data: { idempotencyKey: crypto.randomUUID(), commentId: c.id, resolved: !c.resolved_at },
                          }).then(invalidate)
                        }
                      >
                        <Check className="h-3 w-3" />
                        {c.resolved_at ? t("wp.comments.reopen") : t("wp.comments.resolve")}
                      </Button>
                    </div>
                  ))}
                </TabsContent>

                {/* Xem xét */}
                <TabsContent value="review" className="mt-0 space-y-3">
                  {(reviewers ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("wp.review.noReviewer")}</p>
                  ) : (
                    <div className="space-y-2 rounded-lg border bg-background p-3">
                      <p className="text-sm font-medium">{t("wp.review.request")}</p>
                      <Select value={reviewerId} onValueChange={setReviewerId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("wp.review.reviewer")} />
                        </SelectTrigger>
                        <SelectContent>
                          {(reviewers ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder={t("wp.review.note")}
                      />
                      <Button
                        size="sm"
                        disabled={!reviewerId}
                        onClick={() =>
                          requestWorkDeliverableReview({
                            data: {
                              idempotencyKey: crypto.randomUUID(),
                              id,
                              reviewerId,
                              note: reviewNote.trim() || undefined,
                            },
                          }).then(() => {
                            setReviewNote("");
                            setReviewerId("");
                            invalidate();
                          })
                        }
                      >
                        {t("wp.review.send")}
                      </Button>
                    </div>
                  )}

                  {data.reviews.length === 0 && <p className="text-sm text-muted-foreground">{t("wp.review.empty")}</p>}
                  {data.reviews.map((r: any) => (
                    <div key={r.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{r.reviewerName ?? "—"}</p>
                        <Badge variant="outline" className="text-[10px]">
                          v{r.version}
                        </Badge>
                        <span className="ml-auto text-[11px] text-muted-foreground">{r.status}</span>
                      </div>
                      {r.decision_note && <p className="mt-1 text-xs text-muted-foreground">{r.decision_note}</p>}
                      {r.status === "PENDING" && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              decideWorkDeliverableReview({
                                data: { idempotencyKey: crypto.randomUUID(), reviewId: r.id, decision: "APPROVED" },
                              }).then(invalidate)
                            }
                          >
                            {t("wp.review.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              decideWorkDeliverableReview({
                                data: {
                                  idempotencyKey: crypto.randomUUID(),
                                  reviewId: r.id,
                                  decision: "CHANGES_REQUESTED",
                                },
                              }).then(invalidate)
                            }
                          >
                            {t("wp.review.changes")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {/* Liên kết Work Graph */}
                <TabsContent value="links" className="mt-0 space-y-2">
                  {(links ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("wp.links.empty")}</p>}
                  {(links ?? []).map((l) => (
                    <div key={l.edgeId} className="flex items-center gap-2 rounded-lg border bg-background p-3">
                      <Badge variant="outline" className="text-[10px]">
                        {l.entityType}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">{l.relationship}</span>
                      <a
                        href={workEntityHref(l.entityType, l.entityId)}
                        className="ml-auto text-xs text-primary hover:underline"
                      >
                        {t("wp.links.open")}
                      </a>
                    </div>
                  ))}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </aside>
        </div>
      </main>
    </div>
  );
}
