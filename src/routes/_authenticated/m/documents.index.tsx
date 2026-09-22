import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Search } from "lucide-react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { createDocument, listDocuments } from "@/lib/api/documents.functions";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/m/documents/")({
  head: () => ({
    meta: [
      { title: "Tài liệu mobile — UNIWORK" },
      { name: "description", content: "Danh sách tài liệu UNIWORK trên điện thoại." },
      { property: "og:title", content: "Tài liệu mobile — UNIWORK" },
      { property: "og:description", content: "Danh sách tài liệu UNIWORK trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileDocumentsPage,
});

function MobileDocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { workspaceId, workspaces } = useActiveWorkspace();
  const activeId = workspaceId ?? workspaces[0]?.id;
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("all");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", folder: "My Documents", content: "" });
  const documents = useQuery({
    queryKey: ["m-documents", activeId],
    enabled: Boolean(activeId),
    queryFn: () => listDocuments({ data: { workspaceId: activeId as string, limit: 100 } }),
  });
  const term = search.trim().toLowerCase();
  const folders = [...new Set((documents.data ?? []).map((item) => item.folder).filter(Boolean))];
  const items = (documents.data ?? []).filter((item) => {
    const matchesTerm = !term || `${item.title} ${item.folder}`.toLowerCase().includes(term);
    return matchesTerm && (folder === "all" || item.folder === folder);
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createDocument({
        data: {
          workspaceId: activeId as string,
          title: draft.title.trim(),
          folder: draft.folder.trim() || "My Documents",
          tags: [],
          idempotencyKey: crypto.randomUUID(),
        },
      });
      const documentId = typeof created === "string" ? created : created.id;
      if (draft.content.trim()) {
        const { updateDocument } = await import("@/lib/api/documents.functions");
        await updateDocument({
          data: { documentId, content: draft.content, idempotencyKey: crypto.randomUUID() },
        });
      }
      return documentId;
    },
    onSuccess: async (documentId) => {
      await queryClient.invalidateQueries({ queryKey: ["m-documents", activeId] });
      setCreating(false);
      setDraft({ title: "", folder: "My Documents", content: "" });
      toast.success(t("m.doc.created"));
      void navigate({ to: "/m/documents/$id", params: { id: documentId } });
    },
    onError: () => toast.error(t("m.doc.actionError")),
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">{t("m.doc.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("m.doc.subtitle")}</p>
      </header>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("m.doc.search")}
          aria-label={t("m.doc.search")}
          className="h-11 pl-9"
        />
      </div>
      {folders.length ? (
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger aria-label={t("m.doc.folderLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("m.doc.folder.all")}</SelectItem>
            {folders.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {!activeId ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          {t("m.doc.noWorkspace")}
        </p>
      ) : documents.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : documents.isError ? (
        <div className="rounded-xl border border-border p-4 text-sm">
          <p>{t("m.doc.loadError")}</p>
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void documents.refetch()}
          >
            {t("m.doc.retry")}
          </Button>
        </div>
      ) : items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <MobileListItem
              key={item.id}
              title={item.title}
              subtitle={item.folder}
              meta={new Date(item.updated_at).toLocaleDateString("vi-VN")}
              icon={<FileText className="h-5 w-5 text-primary" />}
              onClick={() => void navigate({ to: "/m/documents/$id", params: { id: item.id } })}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("m.doc.empty")}
        </p>
      )}
      <MobileFAB label={t("m.doc.create")} onClick={() => setCreating(true)} />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("m.doc.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-title">{t("m.doc.titleLabel")}</Label>
              <Input
                id="doc-title"
                className="h-11"
                value={draft.title}
                placeholder={t("m.doc.titlePlaceholder")}
                onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-folder">{t("m.doc.folderLabel")}</Label>
              <Input
                id="doc-folder"
                className="h-11"
                value={draft.folder}
                placeholder={t("m.doc.folderPlaceholder")}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, folder: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-content">{t("m.doc.contentLabel")}</Label>
              <Textarea
                id="doc-content"
                className="min-h-36"
                value={draft.content}
                placeholder={t("m.doc.contentPlaceholder")}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, content: event.target.value }))
                }
              />
            </div>
            <Button
              className="min-h-11"
              disabled={!activeId || !draft.title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t("m.doc.saving") : t("m.doc.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
