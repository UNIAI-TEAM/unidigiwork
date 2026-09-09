// Kết quả công việc — danh sách, bộ lọc và tạo mới.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, LayoutGrid, List as ListIcon, X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { FilterPageHeader } from "@/components/filter-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, localeTag } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  BUSINESS_TYPES,
  WP_STATUSES,
  createWorkDeliverable,
  listWorkDeliverables,
} from "@/lib/api/work-deliverables.functions";

export const Route = createFileRoute("/_authenticated/work-products")({
  head: () => ({
    meta: [
      { title: "Kết quả công việc — UNIWORK" },
      {
        name: "description",
        content: "Từ ngữ cảnh công việc đến sản phẩm hoàn chỉnh: đề xuất, báo cáo, phân tích được soạn cùng nhân sự AI.",
      },
      { property: "og:title", content: "Kết quả công việc — UNIWORK" },
      {
        property: "og:description",
        content: "Từ ngữ cảnh công việc đến sản phẩm hoàn chỉnh, có phiên bản, nguồn gốc AI và quy trình duyệt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkProductsPage,
});

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  IN_REVIEW: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CHANGES_REQUESTED: "bg-destructive/15 text-destructive",
  APPROVED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  FINAL: "bg-primary/15 text-primary",
  ARCHIVED: "bg-muted text-muted-foreground",
};

function WorkProductsPage() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useSidebarState();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [businessType, setBusinessType] = useState<string>("ALL");
  const [workspaceId, setWorkspaceId] = useState<string>("ALL");
  const [mine, setMine] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: workspaces } = useQuery({
    queryKey: ["wp-workspaces"],
    queryFn: async () => {
      const { data } = await supabase.from("workspaces").select("id, name").is("deleted_at", null).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const filters = {
    search: search.trim() || undefined,
    status: status === "ALL" ? null : (status as (typeof WP_STATUSES)[number]),
    businessType: businessType === "ALL" ? null : (businessType as (typeof BUSINESS_TYPES)[number]),
    workspaceId: workspaceId === "ALL" ? null : workspaceId,
    mine,
  };

  const { data: items, isLoading, isError } = useQuery({
    queryKey: ["work-deliverables", filters],
    queryFn: () => listWorkDeliverables({ data: filters }),
  });

  const hasFilters = search.trim() !== "" || status !== "ALL" || businessType !== "ALL" || workspaceId !== "ALL" || mine;
  const clearFilters = () => {
    setSearch("");
    setStatus("ALL");
    setBusinessType("ALL");
    setWorkspaceId("ALL");
    setMine(false);
  };

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag(lang), { day: "2-digit", month: "2-digit", year: "numeric" }),
    [lang],
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="work-products" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <FilterPageHeader
              crumbs={[{ label: t("nav.group.knowledge") }, { label: t("wp.title") }]}
              title={t("wp.title")}
              description={t("wp.subtitle")}
            />
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("wp.new")}
            </Button>
          </div>

          {/* Bộ lọc */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("wp.search")}
                className="pl-9"
                aria-label={t("wp.search")}
              />
            </div>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder={t("wp.allWorkspaces")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("wp.allWorkspaces")}</SelectItem>
                {(workspaces ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("wp.allTypes")}</SelectItem>
                {BUSINESS_TYPES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {t(`wp.type.${b}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("wp.allStatuses")}</SelectItem>
                {WP_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`wp.status.${s}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={mine ? "default" : "outline"} onClick={() => setMine((v) => !v)}>
              {t("wp.mine")}
            </Button>
            <div className="ml-auto flex items-center gap-1">
              {hasFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} aria-label={t("wp.clearFilters")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView(view === "list" ? "grid" : "list")}
                aria-label={t("wp.toggleView")}
              >
                {view === "list" ? <LayoutGrid className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <WeeklyReportCard workspaceId={workspaceId === "ALL" ? null : workspaceId} />



          {isLoading && (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("wp.loading")}
            </div>
          )}
          {isError && <p className="py-16 text-sm text-destructive">{t("wp.error")}</p>}

          {!isLoading && !isError && (items ?? []).length === 0 && (
            <Card className="flex flex-col items-center gap-3 border-dashed py-16 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t("wp.empty")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t("wp.emptyHint")}</p>
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> {t("wp.new")}
              </Button>
            </Card>
          )}

          <div className={cn(view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2")}>
            {(items ?? []).map((it: any) => (
              <Link
                key={it.id}
                to="/work-products/$id"
                params={{ id: it.id }}
                className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{it.title}</p>
                      <Badge variant="outline">{t(`wp.type.${it.business_type}` as never)}</Badge>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_TONE[it.status] ?? "")}>
                        {t(`wp.status.${it.status}` as never)}
                      </span>
                      {it.ai_generated && (
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="h-3 w-3" /> AI
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{it.description || "—"}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {[
                        it.workspaceName,
                        it.ownerName,
                        `v${it.current_version}`,
                        fmt.format(new Date(it.updated_at)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaces={workspaces ?? []}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["work-deliverables"] });
          navigate({ to: "/work-products/$id", params: { id } });
        }}
      />
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  workspaces,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaces: Array<{ id: string; name: string }>;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [businessType, setBusinessType] = useState<string>("PROPOSAL");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>("NONE");
  const [useTemplate, setUseTemplate] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep(1);
    setTitle("");
    setBusinessType("PROPOSAL");
    setDescription("");
    setWorkspaceId("NONE");
    setUseTemplate(true);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await createWorkDeliverable({
        data: {
          idempotencyKey: crypto.randomUUID(),
          title: title.trim(),
          businessType: businessType as (typeof BUSINESS_TYPES)[number],
          description: description.trim() || undefined,
          workspaceId: workspaceId === "NONE" ? null : workspaceId,
          primaryContextType: workspaceId === "NONE" ? null : "WORKSPACE",
          primaryContextId: workspaceId === "NONE" ? null : workspaceId,
          useTemplate,
        },
      });
      onOpenChange(false);
      reset();
      onCreated(res.id);
    } catch {
      toast.error(t("wp.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 1 ? t("wp.create.step1") : t("wp.create.step2")}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("wp.create.type")}</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUSINESS_TYPES.filter((b) => b !== "OTHER").map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBusinessType(b)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      businessType === b ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    {t(`wp.type.${b}` as never)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} />
              {t("wp.create.template")}
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="wp-title">
                {t("wp.create.name")}
              </label>
              <Input id="wp-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="wp-desc">
                {t("wp.create.description")}
              </label>
              <Textarea id="wp-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("wp.create.context")}</label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t("wp.create.noContext")}</SelectItem>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              {t("wp.create.back")}
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>{t("wp.create.next")}</Button>
          ) : (
            <Button onClick={submit} disabled={busy || !title.trim()} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("wp.create.submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
