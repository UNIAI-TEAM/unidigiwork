// Kết quả công việc — trang soạn thảo, phiên bản, bình luận, xem xét và trợ lý AI.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bold,
  Check,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  History,
  Italic,
  Layers,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  Quote,
  Save,
  Search,
  Share2,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Underline,
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
import { DocxRoundTripPanel } from "@/components/work-products/docx-roundtrip-panel";
import { FileType2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useI18n, localeTag } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DocumentPreview } from "@/components/work-products/document-preview";
import { EngineBenchmarkPanel } from "@/components/work-products/engine-benchmark";
import { workEntityHref } from "@/domain/work-graph/route-resolver";
import {
  WP_STATUSES,
  changeWorkDeliverableStatus,
  commentWorkDeliverable,
  decideWorkDeliverableReview,
  deleteWorkDeliverable,
  exportWorkDeliverableArtifact,
  getWorkDeliverableArtifactUrl,
  getWorkDeliverable,
  listWorkDeliverables,
  listWorkDeliverableContext,
  listWorkDeliverableLinks,
  listWorkDeliverableReviewers,
  requestWorkDeliverableReview,
  resolveWorkDeliverableComment,
  restoreWorkDeliverableVersion,
  runWorkDeliverableAi,
  saveWorkDeliverableVersion,
  updateWorkDeliverable,
  listWorkProductShares,
  listShareableWorkspaces,
  shareWorkProduct,
  unshareWorkProduct,
  updateWorkProductShare,
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
  const { data: shareData } = useQuery({
    queryKey: ["work-deliverable-shares", id],
    queryFn: () => listWorkProductShares({ data: { id } }),
  });
  const { data: shareWorkspaces } = useQuery({
    queryKey: ["wp-shareable-workspaces"],
    queryFn: () => listShareableWorkspaces(),
  });
  const [shareKind, setShareKind] = useState<"WORKSPACE" | "USER">("WORKSPACE");
  const [shareTarget, setShareTarget] = useState<string>("");
  const [sharePerm, setSharePerm] = useState<"VIEW" | "EDIT">("VIEW");
  const [shareExpiry, setShareExpiry] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const shareOptions =
    shareKind === "USER" ? (shareWorkspaces?.people ?? []) : (shareWorkspaces?.workspaces ?? []);
  async function addShare() {
    if (!shareTarget) return;
    setSharing(true);
    try {
      await shareWorkProduct({
        data: {
          id,
          targetType: shareKind,
          targetId: shareTarget,
          permission: sharePerm,
          status: "ACTIVE",
          expiresAt: shareExpiry ? new Date(shareExpiry).toISOString() : null,
          idempotencyKey: `wp-share-${id}-${shareTarget}-${sharePerm}-${shareExpiry || "none"}`,
        },
      });
      await qc.invalidateQueries({ queryKey: ["work-deliverable-shares", id] });
      setShareTarget("");
      setShareExpiry("");
      toast.success(t("wp.share.added"));
    } catch {
      toast.error(t("wp.share.error"));
    }
    setSharing(false);
  }
  async function patchShare(
    shareId: string,
    patch: { permission?: "VIEW" | "EDIT"; status?: "ACTIVE" | "REVOKED"; expiresAt?: string | null },
  ) {
    try {
      await updateWorkProductShare({
        data: { shareId, ...patch, idempotencyKey: `wp-share-upd-${shareId}-${Date.now()}` },
      });
      await qc.invalidateQueries({ queryKey: ["work-deliverable-shares", id] });
      toast.success(t("wp.share.updated"));
    } catch {
      toast.error(t("wp.share.error"));
    }
  }
  async function removeShare(shareId: string) {
    try {
      await unshareWorkProduct({ data: { shareId, idempotencyKey: `wp-unshare-${shareId}` } });
      await qc.invalidateQueries({ queryKey: ["work-deliverable-shares", id] });
      toast.success(t("wp.share.removed"));
    } catch {
      toast.error(t("wp.share.error"));
    }
  }

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [aiAction, setAiAction] = useState<(typeof AI_ACTIONS)[number]>("IMPROVE");
  const [instruction, setInstruction] = useState("");
  const [aiOut, setAiOut] = useState("");
  // Ghi nhận việc nội dung hiện tại có dùng AI + nguồn ngữ cảnh lúc áp dụng, để snapshot lưu đúng provenance.
  const [aiApplied, setAiApplied] = useState(false);
  const [aiProvenance, setAiProvenance] = useState<Array<{ type: string; id: string; title: string; stamp: string | null }>>([]);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [comment, setComment] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const { data: documents } = useQuery({
    queryKey: ["work-deliverables", { limit: 60 }],
    queryFn: () => listWorkDeliverables({ data: { limit: 60 } }),
  });

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

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)").matches;
    setLeftPanelOpen(desktop);
    setRightPanelOpen(desktop);
  }, []);

  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag(lang), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    [lang],
  );

  const activeSources = (sources ?? []).filter((s) => enabled[`${s.type}:${s.id}`]);
  const canEdit = data?.canEdit ?? false;
  const visibleDocuments = (documents ?? []).filter((item) =>
    item.title.toLocaleLowerCase().includes(documentSearch.trim().toLocaleLowerCase()),
  );

  const wrapSelection = (before: string, after = before) => {
    if (!canEdit) return;
    const start = selection.start;
    const end = selection.end;
    const selected = content.slice(start, end);
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    setDirty(true);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  /** Chèn khối ở đầu dòng hiện tại (tiêu đề, danh sách, trích dẫn…). */
  const applyLinePrefix = (prefix: string) => {
    if (!canEdit) return;
    const start = content.lastIndexOf("\n", Math.max(selection.start - 1, 0)) + 1;
    const cleaned = content.slice(start).replace(/^(#{1,3}\s+|[-*•]\s+|\d+[.)]\s+|>\s+)/, "");
    setContent(`${content.slice(0, start)}${prefix}${cleaned}`);
    setDirty(true);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  /** Chèn một khối mới (bảng, ngắt trang) tại vị trí con trỏ. */
  const insertBlock = (snippet: string) => {
    if (!canEdit) return;
    const at = selection.start;
    setContent(`${content.slice(0, at)}\n${snippet}\n${content.slice(at)}`);
    setDirty(true);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

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
          aiGenerated: aiApplied || aiOut !== "",
          provenance: (aiApplied ? aiProvenance : activeSources.map((s) => ({ type: s.type, id: s.id, title: s.title, stamp: s.stamp }))) as any,
        },
      });
    },
    onSuccess: (res) => {
      setDirty(false);
      setAiApplied(false);
      setAiProvenance([]);
      toast.success(t("wp.snapshotDone").replace("{v}", String(res.version)));
      invalidate();
    },
    onError: () => toast.error(t("wp.saveFailed")),
  });

  const exportArtifact = useMutation({
    mutationFn: async (format: "DOCX" | "XLSX" | "PPTX" | "PDF") => {
      setExportingFormat(format);
      if (dirty) await updateWorkDeliverable({ data: { id, title: title.trim() || undefined, content } });
      return exportWorkDeliverableArtifact({ data: { idempotencyKey: crypto.randomUUID(), id, format } });
    },
    onSuccess: (res: any) => {
      setDirty(false);
      setExportingFormat(null);
      toast.success(t("wp.files.exported").replace("{f}", String(res?.artifact?.format ?? "")));
      invalidate();
    },
    onError: () => {
      setExportingFormat(null);
      toast.error(t("wp.files.exportFailed"));
    },
  });

  const downloadArtifact = async (artifactId: string) => {
    try {
      const { url } = await getWorkDeliverableArtifactUrl({ data: { artifactId } });
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error(t("wp.files.downloadFailed"));
    }
  };

  const runAi = useMutation({
    mutationFn: (prompt?: string) =>
      runWorkDeliverableAi({
        data: {
          id,
          action: aiAction,
          locale: lang,
          instruction: (prompt ?? instruction).trim() || undefined,
          selection: content.slice(selection.start, selection.end) || undefined,
          // Chỉ gửi định danh; máy chủ tự nạp nội dung nguồn theo quyền.
          sources: activeSources.map((s) => ({ type: s.type, id: s.id })),
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
    setAiApplied(true);
    setAiProvenance(activeSources.map((s) => ({ type: s.type, id: s.id, title: s.title, stamp: s.stamp })));
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
  const isImportedDocx = (product as { origin?: string }).origin === "IMPORTED_DOCX";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar active="work-products" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <header className="border-b bg-card px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" aria-label={t("wp.back")}>
              <Link to="/work-products"><ArrowLeft /></Link>
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate font-heading text-lg font-semibold">{t("wp.title")}</h1>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm text-muted-foreground">{title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{dirty ? t("wp.save") : t("wp.saved")} · v{product.current_version}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setLeftPanelOpen((value) => !value)} aria-label="Danh sách tài liệu">
              <PanelLeft />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setRightPanelOpen((value) => !value)} aria-label={t("wp.tab.ai")}>
              <PanelRight />
            </Button>
            <Button variant="outline" onClick={() => snapshot.mutate()} disabled={!canEdit || snapshot.isPending} className="hidden gap-2 sm:inline-flex">
              {snapshot.isPending ? <Loader2 className="animate-spin" /> : <History />}
              {t("wp.snapshot")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canEdit || !dirty || save.isPending} className="gap-2">
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              <span className="hidden sm:inline">{t("wp.save")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("wp.delete")}
              disabled={!canEdit}
              onClick={() => {
                if (!window.confirm(t("wp.deleteConfirm"))) return;
                deleteWorkDeliverable({ data: { idempotencyKey: crypto.randomUUID(), id } }).then(() => {
                  toast.success(t("wp.deleted"));
                  navigate({ to: "/work-products" });
                });
              }}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          {leftPanelOpen && (
            <aside className="fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r bg-card shadow-md lg:static lg:z-auto lg:w-64 lg:shadow-none">
              <div className="border-b p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{t("wp.title")}</p>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="icon-sm" aria-label={t("wp.new")}>
                      <Link to="/work-products"><MoreHorizontal /></Link>
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setLeftPanelOpen(false)} aria-label="Đóng danh sách"><PanelLeft /></Button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder={t("wp.search")} className="h-9 bg-background pl-9" />
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <nav className="space-y-1 p-2" aria-label={t("wp.title")}>
                  {visibleDocuments.map((item) => (
                    <Link
                      key={item.id}
                      to="/work-products/$id"
                      params={{ id: item.id }}
                      className={cn(
                        "flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2",
                        item.id === id && "bg-primary/10 text-primary",
                      )}
                    >
                      <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {t(`wp.type.${item.business_type}` as never)} · v{item.current_version}
                        </span>
                      </span>
                    </Link>
                  ))}
                </nav>
              </ScrollArea>
            </aside>
          )}

          <section className="flex min-w-0 flex-1 flex-col bg-surface">
            <div className="flex min-h-12 items-center gap-1 overflow-x-auto border-b bg-card px-3">
              <Select
                value={product.status}
                disabled={!canEdit}
                onValueChange={(value) =>
                  changeWorkDeliverableStatus({ data: { idempotencyKey: crypto.randomUUID(), id, status: value as (typeof WP_STATUSES)[number] } })
                    .then(invalidate)
                    .catch(() => toast.error(t("wp.saveFailed")))
                }
              >
                <SelectTrigger className="mr-2 h-8 w-[145px] border-0 bg-surface-2 shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>{WP_STATUSES.map((status) => <SelectItem key={status} value={status}>{t(`wp.status.${status}` as never)}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" onClick={() => wrapSelection("**")} aria-label={t("wp.editor.bold")}><Bold /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => wrapSelection("_")} aria-label={t("wp.editor.italic")}><Italic /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => wrapSelection("<u>", "</u>")} aria-label={t("wp.editor.underline")}><Underline /></Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("# ")} aria-label={t("wp.editor.h1")}><Heading1 /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("## ")} aria-label={t("wp.editor.h2")}><Heading2 /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("### ")} aria-label={t("wp.editor.h3")}><Heading3 /></Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("- ")} aria-label={t("wp.editor.bullet")}><List /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("1. ")} aria-label={t("wp.editor.numbered")}><ListOrdered /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => applyLinePrefix("> ")} aria-label={t("wp.editor.quote")}><Quote /></Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => insertBlock("| Cột 1 | Cột 2 |\n| --- | --- |\n|  |  |")}
                aria-label={t("wp.editor.table")}
              >
                <TableIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => insertBlock("---")} aria-label={t("wp.editor.pagebreak")}><Minus /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => wrapSelection("[", "](https://)")} aria-label={t("wp.editor.link")}><Link2 /></Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button
                variant={previewMode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewMode((v) => !v)}
                className="gap-1.5"
              >
                {previewMode ? <Pencil /> : <Eye />}
                <span className="hidden sm:inline">{previewMode ? t("wp.editor.edit") : t("wp.editor.preview")}</span>
              </Button>
              <div className="ml-auto flex items-center gap-2 pr-2 text-xs text-muted-foreground">
                <Badge variant="outline">{t(`wp.type.${product.business_type}` as never)}</Badge>
                {data.workspace?.name && <span className="hidden xl:inline">{data.workspace.name}</span>}
              </div>
            </div>
            {!canEdit && <p className="border-b px-5 py-2 text-xs text-muted-foreground">{t("wp.readonly")}</p>}
            <ScrollArea className="min-h-0 flex-1">
              {previewMode ? (
                <div className="my-5 px-4 sm:my-8 sm:px-8">
                  <DocumentPreview
                    title={title}
                    content={content}
                    businessType={product.business_type as string}
                    version={product.current_version}
                  />
                </div>
              ) : (
                <div className="mx-auto my-5 min-h-[calc(100vh-13rem)] w-[calc(100%-2rem)] max-w-[820px] border bg-card shadow-sm sm:my-8 sm:w-[calc(100%-4rem)]">
                  <div className="px-6 py-8 sm:px-12 sm:py-12 lg:px-16">
                    <Input
                      value={title}
                      readOnly={!canEdit}
                      onChange={(event) => { setTitle(event.target.value); setDirty(true); }}
                      aria-label={t("wp.create.name")}
                      className="h-auto border-0 px-0 font-heading text-3xl font-semibold shadow-none focus-visible:ring-0"
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-b pb-5 text-xs text-muted-foreground">
                      <span>{t(`wp.status.${product.status}` as never)}</span><span>·</span><span>v{product.current_version}</span><span>·</span><span>{fmt.format(new Date(product.updated_at))}</span>
                    </div>
                    <Textarea
                      ref={editorRef}
                      value={content}
                      readOnly={!canEdit}
                      onChange={(event) => { setContent(event.target.value); setDirty(true); }}
                      onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
                      className="mt-6 min-h-[760px] resize-none border-0 bg-transparent px-0 font-sans text-[15px] leading-8 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              )}
            </ScrollArea>
          </section>

          {rightPanelOpen && <aside className="fixed inset-x-0 bottom-0 top-28 z-40 w-full shrink-0 border-l bg-card shadow-md sm:left-auto sm:w-[360px] xl:static xl:z-auto xl:shadow-none">
            <Tabs defaultValue="ai" className="flex h-full flex-col">
              <div className="border-b px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></span>
                  <div className="flex-1"><p className="text-sm font-semibold">{t("wp.tab.ai")}</p><p className="text-xs text-muted-foreground">UNI Assistant</p></div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setRightPanelOpen(false)} aria-label="Đóng trợ lý"><PanelRight /></Button>
                </div>
              </div>
              <TabsList className={cn("mx-3 mt-3 grid", isImportedDocx ? "grid-cols-9" : "grid-cols-8")}>
                <TabsTrigger value="ai" aria-label={t("wp.tab.ai")}><Sparkles /></TabsTrigger>
                <TabsTrigger value="context" aria-label={t("wp.tab.context")}><Layers /></TabsTrigger>
                <TabsTrigger value="versions" aria-label={t("wp.tab.versions")}><History /></TabsTrigger>
                <TabsTrigger value="comments" aria-label={t("wp.tab.comments")}><MessageSquare /></TabsTrigger>
                <TabsTrigger value="review" aria-label={t("wp.tab.review")}><UserCheck /></TabsTrigger>
                <TabsTrigger value="links" aria-label={t("wp.tab.links")}><Link2 /></TabsTrigger>
                <TabsTrigger value="files" aria-label={t("wp.files.tab")}><Download /></TabsTrigger>
                <TabsTrigger value="share" aria-label={t("wp.share.tab")}><Share2 /></TabsTrigger>
                {isImportedDocx && (
                  <TabsTrigger value="docx" aria-label="Tài liệu Word"><FileType2 /></TabsTrigger>
                )}
              </TabsList>

              <ScrollArea className="min-h-0 flex-1 px-4 pb-5">
                {/* AI */}
                <TabsContent value="ai" className="mt-4 space-y-4">
                  <Message from="assistant">
                    <MessageContent>
                      <MessageResponse>{t("wp.ai.selectionHint")}</MessageResponse>
                    </MessageContent>
                  </Message>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_ACTIONS.map((a) => (
                      <Button
                        key={a}
                        type="button"
                        variant={aiAction === a ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setAiAction(a)}
                        className="justify-start"
                      >
                        {t(`wp.ai.${a}` as never)}
                      </Button>
                    ))}
                  </div>
                  <PromptInput onSubmit={(message) => { setInstruction(message.text); runAi.mutate(message.text); }} className="bg-background">
                    <PromptInputTextarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t("wp.ai.instruction")} />
                    <PromptInputFooter className="justify-between">
                      <span className="text-[11px] text-muted-foreground">{activeSources.length} {t("wp.tab.context")}</span>
                      <PromptInputSubmit status={runAi.isPending ? "submitted" : undefined} disabled={runAi.isPending} />
                    </PromptInputFooter>
                  </PromptInput>
                  {runAi.isPending && <Shimmer className="text-sm">{`${t("wp.ai.run")}...`}</Shimmer>}
                  {aiOut && (
                    <div className="border-t pt-4">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("wp.ai.result")}</p>
                      <Message from="assistant"><MessageContent><MessageResponse>{aiOut}</MessageResponse></MessageContent></Message>
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
                              {(r as { self?: boolean }).self ? `${r.name} ${t("wp.review.self")}` : r.name}
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
                <TabsContent value="files" className="mt-0 space-y-3">
                  <div>
                    <p className="text-sm font-medium">{t("wp.files.export")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("wp.files.hint")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["DOCX", "XLSX", "PPTX", "PDF"] as const).map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant="outline"
                          disabled={!canEdit || exportArtifact.isPending}
                          onClick={() => exportArtifact.mutate(f)}
                          className="gap-2"
                        >
                          {exportArtifact.isPending && exportingFormat === f ? <Loader2 className="animate-spin" /> : <FileText />}
                          {f}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(data.artifacts ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">{t("wp.files.empty")}</p>
                    )}
                    {(data.artifacts ?? []).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg border bg-background p-3">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {a.format} · v{a.version}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{fmt.format(new Date(a.created_at))}</p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("wp.files.download")}
                          onClick={() => downloadArtifact(a.id)}
                        >
                          <Download />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <EngineBenchmarkPanel workProductId={product.id} version={product.current_version} />
                </TabsContent>


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

                <TabsContent value="share" className="mt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">{t("wp.share.hint")}</p>
                  {shareData?.canManage && (
                    <div className="space-y-2 rounded-lg border bg-background p-3">
                      <Select
                        value={shareKind}
                        onValueChange={(v) => {
                          setShareKind(v as "WORKSPACE" | "USER");
                          setShareTarget("");
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WORKSPACE">{t("wp.share.kindWorkspace")}</SelectItem>
                          <SelectItem value="USER">{t("wp.share.kindUser")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={shareTarget} onValueChange={setShareTarget}>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              shareKind === "USER" ? t("wp.share.pickUser") : t("wp.share.pickWorkspace")
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {shareOptions
                            .filter((w) => !(shareData?.shares ?? []).some((s) => s.targetId === w.id))
                            .map((w) => (
                              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select value={sharePerm} onValueChange={(v) => setSharePerm(v as "VIEW" | "EDIT")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIEW">{t("wp.share.view")}</SelectItem>
                          <SelectItem value="EDIT">{t("wp.share.edit")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground" htmlFor="wp-share-expiry">
                          {t("wp.share.expiry")}
                        </label>
                        <Input
                          id="wp-share-expiry"
                          type="datetime-local"
                          value={shareExpiry}
                          onChange={(e) => setShareExpiry(e.target.value)}
                        />
                      </div>
                      <Button size="sm" className="w-full gap-2" disabled={!shareTarget || sharing} onClick={addShare}>
                        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        {t("wp.share.add")}
                      </Button>
                    </div>
                  )}
                  {(shareData?.shares ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("wp.share.empty")}</p>
                  )}
                  {(shareData?.shares ?? []).map((s) => (
                    <div key={s.id} className="space-y-2 rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {s.targetType === "USER" ? t("wp.share.kindUser") : t("wp.share.kindWorkspace")}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-sm">{s.targetName}</span>
                        <Badge
                          variant={s.status === "REVOKED" || s.expired ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {s.status === "REVOKED"
                            ? t("wp.share.revoked")
                            : s.expired
                              ? t("wp.share.expired")
                              : t("wp.share.active")}
                        </Badge>
                        {shareData?.canManage && (
                          <Button variant="ghost" size="icon-sm" aria-label={t("wp.share.remove")} onClick={() => removeShare(s.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {s.permission === "EDIT" ? t("wp.share.edit") : t("wp.share.view")}
                        </Badge>
                        <span>
                          {s.expiresAt
                            ? `${t("wp.share.expiresAt")}: ${fmt.format(new Date(s.expiresAt))}`
                            : t("wp.share.noExpiry")}
                        </span>
                      </div>
                      {shareData?.canManage && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patchShare(s.id, { permission: s.permission === "EDIT" ? "VIEW" : "EDIT" })
                            }
                          >
                            {s.permission === "EDIT" ? t("wp.share.view") : t("wp.share.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patchShare(s.id, { status: s.status === "REVOKED" ? "ACTIVE" : "REVOKED" })
                            }
                          >
                            {s.status === "REVOKED" ? t("wp.share.restore") : t("wp.share.revoke")}
                          </Button>
                          {s.expiresAt && (
                            <Button size="sm" variant="ghost" onClick={() => patchShare(s.id, { expiresAt: null })}>
                              {t("wp.share.clearExpiry")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {isImportedDocx && (
                  <TabsContent value="docx" className="mt-0">
                    <DocxRoundTripPanel
                      productId={id}
                      activeSources={activeSources.map((s) => ({ type: s.type, id: s.id }))}
                    />
                  </TabsContent>
                )}
              </ScrollArea>
            </Tabs>
          </aside>}
        </div>
      </main>
    </div>
  );
}
