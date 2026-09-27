import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ExternalLink,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Markdown } from "@/components/marketing/markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteCmsEntry,
  getCmsAdminState,
  listCmsEntries,
  reorderCmsEntries,
  saveCmsEntry,
  setLeadWorkspace,
  type CmsEntry,
  type CmsKind,
} from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { ConsultationRouting } from "@/components/marketing/consultation-routing";

export const Route = createFileRoute("/_authenticated/admin/cms")({
  head: () => ({
    meta: [
      { title: "Website & CMS — UNIWORK" },
      {
        name: "description",
        content: "Quản trị dịch vụ, bảng giá và bài viết của website UniWork.",
      },
    ],
  }),
  component: AdminCmsPage,
});

type Draft = {
  id?: string;
  kind: CmsKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  list: string;
  price: string;
  icon: string;
  category: string;
  featured: boolean;
  published: boolean;
  sortOrder: number;
  period: string;
  cta: string;
  coverPath: string | null;
  coverUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  publishAt: string;
};

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
type StatusFilter = "all" | "published" | "scheduled" | "draft";
const statusOf = (e: CmsEntry): Exclude<StatusFilter, "all"> =>
  e.status !== "published"
    ? "draft"
    : e.publishAt && new Date(e.publishAt) > new Date()
      ? "scheduled"
      : "published";

const toDraft = (kind: CmsKind, e?: CmsEntry): Draft => ({
  id: e?.id,
  kind,
  slug: e?.slug ?? "",
  title: e?.title ?? "",
  summary: e?.summary ?? "",
  body: e?.body ?? "",
  list: ((e?.data.steps ?? e?.data.features ?? []) as string[]).join("\n"),
  price: String(e?.data.price ?? ""),
  icon: String(e?.data.icon ?? ""),
  category: String(e?.data.category ?? ""),
  featured: !!e?.data.featured,
  published: e ? e.status === "published" : false,
  sortOrder: e?.sortOrder ?? 0,
  period: String(e?.data.period ?? ""),
  cta: String(e?.data.cta ?? ""),
  coverPath: e?.coverPath ?? null,
  coverUrl: e?.coverUrl ?? null,
  seoTitle: e?.seoTitle ?? "",
  seoDescription: e?.seoDescription ?? "",
  publishAt: toLocalInput(e?.publishAt),
});

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function AdminCmsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [kind, setKind] = useState<CmsKind>("service");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const reorderFn = useServerFn(reorderCmsEntries);
  const stateFn = useServerFn(getCmsAdminState);
  const listFn = useServerFn(listCmsEntries);
  const saveFn = useServerFn(saveCmsEntry);
  const delFn = useServerFn(deleteCmsEntry);
  const leadFn = useServerFn(setLeadWorkspace);

  const state = useQuery({ queryKey: ["cms-admin-state"], queryFn: () => stateFn() });
  const list = useQuery({
    queryKey: ["cms-admin", kind],
    queryFn: () => listFn({ data: { kind } }),
    enabled: !!state.data?.isAdmin,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cms-admin"] });
    void qc.invalidateQueries({ queryKey: ["cms-public"] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const items = d.list
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const data: Record<string, unknown> =
        d.kind === "service"
          ? { icon: d.icon || undefined, steps: items }
          : d.kind === "pricing" || d.kind === "plan"
            ? {
                price: d.price,
                features: items,
                featured: d.featured,
                ...(d.kind === "plan" ? { period: d.period, cta: d.cta } : {}),
              }
            : { category: d.category };
      return saveFn({
        data: {
          id: d.id ?? null,
          kind: d.kind,
          slug: d.slug || slugify(d.title),
          title: d.title,
          summary: d.summary || null,
          body: d.body || null,
          data,
          status: d.published ? "published" : "draft",
          sortOrder: d.sortOrder,
          coverPath: d.coverPath,
          seoTitle: d.seoTitle || null,
          seoDescription: d.seoDescription || null,
          publishAt: d.publishAt ? new Date(d.publishAt).toISOString() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("cms.saved"));
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("cms.deleted"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const lead = useMutation({
    mutationFn: (id: string | null) => leadFn({ data: { workspaceId: id } }),
    onSuccess: () => {
      toast.success(t("cms.saved"));
      void qc.invalidateQueries({ queryKey: ["cms-admin-state"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter(
      (e) =>
        (filter === "all" || statusOf(e) === filter) &&
        (!term || e.title.toLowerCase().includes(term) || e.slug.includes(term)),
    );
  }, [list.data, q, filter]);
  const canReorder = !q.trim() && filter === "all";
  const move = (idx: number, dir: -1 | 1) => {
    const ids = (list.data ?? []).map((e) => e.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate(ids);
  };
  const wrap = (before: string, after = "", placeholder = "") => {
    const el = bodyRef.current;
    if (!el || !draft) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + before + sel + after + value.slice(b);
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + sel.length);
    });
  };
  const uploadCover = async (file: File) => {
    if (!draft) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh ≤ 5MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${draft.kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("cms-media").upload(path, file, {
      contentType: file.type,
    });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = await supabase.storage.from("cms-media").createSignedUrl(path, 3600);
    setUploading(false);
    setDraft((d) => (d ? { ...d, coverPath: path, coverUrl: data?.signedUrl ?? null } : d));
  };

  if (state.isLoading) return <Skeleton className="m-6 h-40 rounded-2xl" />;
  if (!state.data?.isAdmin)
    return <p className="p-6 text-sm text-muted-foreground">{t("cms.noAccess")}</p>;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("cms.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("cms.desc")}</p>
        </div>
        <Button asChild variant="outline" className="h-11 gap-2">
          <Link to="/uniwork" target="_blank">
            <ExternalLink className="h-4 w-4" /> {t("cms.view")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-border p-4">
        <Label htmlFor="cms-lead">{t("cms.lead")}</Label>
        <select
          id="cms-lead"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={state.data.leadWorkspaceId ?? ""}
          onChange={(e) => lead.mutate(e.target.value || null)}
        >
          <option value="">{t("cms.none")}</option>
          {state.data.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("cms.leadHint")}</p>
      </div>

      <ConsultationRouting leadWorkspaceId={state.data.leadWorkspaceId} />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as CmsKind)}>
          <TabsList>
            <TabsTrigger value="service">{t("cms.kind.service")}</TabsTrigger>
            <TabsTrigger value="pricing">{t("cms.kind.pricing")}</TabsTrigger>
            <TabsTrigger value="article">{t("cms.kind.article")}</TabsTrigger>
            <TabsTrigger value="plan">{t("cms.kind.plan")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          className="ml-auto h-11 gap-2"
          onClick={() => {
            setBodyTab("write");
            setDraft({ ...toDraft(kind), sortOrder: ((list.data?.length ?? 0) + 1) * 10 });
          }}
        >
          <Plus className="h-4 w-4" /> {t("cms.new")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder={t("cms.search")}
            aria-label={t("cms.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="status"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
        >
          <option value="all">{t("cms.filter.all")}</option>
          <option value="published">{t("cms.published")}</option>
          <option value="scheduled">{t("cms.scheduled")}</option>
          <option value="draft">{t("cms.draft")}</option>
        </select>
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border">
        {list.isLoading && <Skeleton className="m-4 h-12" />}
        {list.data && rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{t("cms.empty")}</p>
        )}
        {rows.map((e, idx) => (
          <div key={e.id} className="flex min-h-14 items-center gap-2 px-3 py-2">
            {canReorder && (
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  className="h-6 w-11 p-0"
                  aria-label={t("cms.moveUp")}
                  disabled={idx === 0 || reorder.isPending}
                  onClick={() => move(idx, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  className="h-6 w-11 p-0"
                  aria-label={t("cms.moveDown")}
                  disabled={idx === rows.length - 1 || reorder.isPending}
                  onClick={() => move(idx, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {e.coverUrl ? (
              <img src={e.coverUrl} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{e.title}</span>
                <Badge variant={statusOf(e) === "published" ? "default" : "secondary"}>
                  {t(
                    statusOf(e) === "published"
                      ? "cms.published"
                      : statusOf(e) === "scheduled"
                        ? "cms.scheduled"
                        : "cms.draft",
                  )}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                /{e.slug} · {e.summary}
              </p>
            </div>
            <Button
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={t("cms.edit")}
              onClick={() => {
                setBodyTab("write");
                setDraft(toDraft(kind, e));
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={t("cms.delete")}
              onClick={() => confirm(`${t("cms.delete")}: ${e.title}?`) && del.mutate(e.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("cms.edit") : t("cms.new")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3">
              <F id="c-title" label={t("cms.titleF")}>
                <Input
                  id="c-title"
                  className="h-11"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </F>
              <F id="c-slug" label={t("cms.slug")}>
                <Input
                  id="c-slug"
                  className="h-11"
                  placeholder={slugify(draft.title)}
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
                />
              </F>
              <F id="c-sum" label={t("cms.summary")}>
                <Textarea
                  id="c-sum"
                  rows={2}
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                />
              </F>
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Label htmlFor="c-body" className="mr-auto">
                    {t("cms.body")}
                  </Label>
                  <Tabs value={bodyTab} onValueChange={(v) => setBodyTab(v as "write" | "preview")}>
                    <TabsList>
                      <TabsTrigger value="write">{t("cms.write")}</TabsTrigger>
                      <TabsTrigger value="preview">{t("cms.preview")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {bodyTab === "write" ? (
                  <>
                    <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
                      {(
                        [
                          [Bold, "cms.fmt.bold", () => wrap("**", "**", "…")],
                          [Italic, "cms.fmt.italic", () => wrap("*", "*", "…")],
                          [Heading2, "cms.fmt.h2", () => wrap("\n## ", "", "…")],
                          [List, "cms.fmt.list", () => wrap("\n- ", "", "…")],
                          [Link2, "cms.fmt.link", () => wrap("[", "](https://)", "…")],
                        ] as const
                      ).map(([Icon, key, fn]) => (
                        <Button
                          key={key}
                          type="button"
                          variant="ghost"
                          className="h-11 w-11 p-0"
                          aria-label={t(key)}
                          title={t(key)}
                          onClick={fn}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      id="c-body"
                      ref={bodyRef}
                      rows={draft.kind === "article" ? 12 : 5}
                      className="font-mono text-sm"
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    />
                  </>
                ) : (
                  <div className="min-h-40 rounded-lg border border-border p-4">
                    <Markdown source={draft.body} />
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label>{t("cms.cover")}</Label>
                {draft.coverUrl && (
                  <img
                    src={draft.coverUrl}
                    alt=""
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="h-11 gap-2" disabled={uploading}>
                    <label>
                      <ImagePlus className="h-4 w-4" /> {t("cms.upload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadCover(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                  {draft.coverPath && (
                    <Button
                      variant="ghost"
                      className="h-11"
                      onClick={() => setDraft({ ...draft, coverPath: null, coverUrl: null })}
                    >
                      {t("cms.removeCover")}
                    </Button>
                  )}
                </div>
              </div>
              {draft.kind !== "article" && (
                <F
                  id="c-list"
                  label={t(draft.kind === "service" ? "cms.listService" : "cms.listPricing")}
                >
                  <Textarea
                    id="c-list"
                    rows={4}
                    value={draft.list}
                    onChange={(e) => setDraft({ ...draft, list: e.target.value })}
                  />
                </F>
              )}
              {draft.kind === "service" && (
                <F id="c-icon" label={t("cms.icon")}>
                  <select
                    id="c-icon"
                    className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                    value={draft.icon}
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  >
                    {["", "building", "scale", "calculator", "signature", "receipt"].map((i) => (
                      <option key={i} value={i}>
                        {i || "—"}
                      </option>
                    ))}
                  </select>
                </F>
              )}
              {(draft.kind === "pricing" || draft.kind === "plan") && (
                <>
                  <F id="c-price" label={t("cms.price")}>
                    <Input
                      id="c-price"
                      className="h-11"
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    />
                  </F>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <Switch
                      checked={draft.featured}
                      onCheckedChange={(v) => setDraft({ ...draft, featured: v })}
                    />{" "}
                    {t("cms.featured")}
                  </label>
                  {draft.kind === "plan" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <F id="c-period" label={t("cms.period")}>
                        <Input
                          id="c-period"
                          className="h-11"
                          value={draft.period}
                          onChange={(e) => setDraft({ ...draft, period: e.target.value })}
                        />
                      </F>
                      <F id="c-cta" label={t("cms.cta")}>
                        <Input
                          id="c-cta"
                          className="h-11"
                          value={draft.cta}
                          onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                        />
                      </F>
                    </div>
                  )}
                </>
              )}
              {draft.kind === "article" && (
                <F id="c-cat" label={t("cms.category")}>
                  <Input
                    id="c-cat"
                    className="h-11"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                </F>
              )}
              <F id="c-order" label={t("cms.order")}>
                <Input
                  id="c-order"
                  type="number"
                  className="h-11"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
                />
              </F>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Switch
                  checked={draft.published}
                  onCheckedChange={(v) => setDraft({ ...draft, published: v })}
                />{" "}
                {t("cms.published")}
              </label>
              <F id="c-at" label={t("cms.publishAt")}>
                <Input
                  id="c-at"
                  type="datetime-local"
                  className="h-11"
                  value={draft.publishAt}
                  onChange={(e) => setDraft({ ...draft, publishAt: e.target.value })}
                />
              </F>
              <div className="grid gap-3 rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{t("cms.seo")}</p>
                <F id="c-seot" label={t("cms.seoTitle")}>
                  <Input
                    id="c-seot"
                    className="h-11"
                    maxLength={200}
                    placeholder={draft.title}
                    value={draft.seoTitle}
                    onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })}
                  />
                </F>
                <F id="c-seod" label={`${t("cms.seoDesc")} (${draft.seoDescription.length}/160)`}>
                  <Textarea
                    id="c-seod"
                    rows={2}
                    maxLength={400}
                    placeholder={draft.summary}
                    value={draft.seoDescription}
                    onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })}
                  />
                </F>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="h-11"
              disabled={!draft?.title || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {t("cms.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
