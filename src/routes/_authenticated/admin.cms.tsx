import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
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
  saveCmsEntry,
  setLeadWorkspace,
  type CmsEntry,
  type CmsKind,
} from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";

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
};

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
          : d.kind === "pricing"
            ? { price: d.price, features: items, featured: d.featured }
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

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as CmsKind)}>
          <TabsList>
            <TabsTrigger value="service">{t("cms.kind.service")}</TabsTrigger>
            <TabsTrigger value="pricing">{t("cms.kind.pricing")}</TabsTrigger>
            <TabsTrigger value="article">{t("cms.kind.article")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button className="ml-auto h-11 gap-2" onClick={() => setDraft(toDraft(kind))}>
          <Plus className="h-4 w-4" /> {t("cms.new")}
        </Button>
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border">
        {list.isLoading && <Skeleton className="m-4 h-12" />}
        {list.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{t("cms.empty")}</p>
        )}
        {list.data?.map((e) => (
          <div key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{e.title}</span>
                <Badge variant={e.status === "published" ? "default" : "secondary"}>
                  {t(e.status === "published" ? "cms.published" : "cms.draft")}
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
              onClick={() => setDraft(toDraft(kind, e))}
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
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
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
              <F id="c-body" label={t("cms.body")}>
                <Textarea
                  id="c-body"
                  rows={draft.kind === "article" ? 10 : 3}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </F>
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
              {draft.kind === "pricing" && (
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
