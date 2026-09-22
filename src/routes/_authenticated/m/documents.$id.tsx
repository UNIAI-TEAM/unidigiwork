import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  FileText,
  Loader2,
  Pencil,
  Save,
  Share2,
  UserRound,
} from "lucide-react";
import {
  getDocument,
  listDocumentAccessLogs,
  listDocumentShareCandidates,
  listDocumentShares,
  logDocumentAccess,
  revokeDocumentShare,
  shareDocument,
  updateDocument,
} from "@/lib/api/documents.functions";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/m/documents/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết tài liệu — UNIWORK" },
      { name: "description", content: "Đọc và quản lý tài liệu UNIWORK trên điện thoại." },
      { property: "og:title", content: "Chi tiết tài liệu — UNIWORK" },
      { property: "og:description", content: "Đọc và quản lý tài liệu UNIWORK trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileDocumentDetail,
});

type ShareLevel = "view" | "comment" | "edit" | "manage";

function MobileDocumentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", folder: "", content: "" });
  const [candidateId, setCandidateId] = useState("");
  const [shareLevel, setShareLevel] = useState<ShareLevel>("view");

  const detail = useQuery({
    queryKey: ["m-document", id],
    queryFn: () => getDocument({ data: { documentId: id } }),
    retry: false,
  });
  const sharing = useQuery({
    queryKey: ["m-document-sharing", id],
    queryFn: async () => {
      const [candidates, current] = await Promise.all([
        listDocumentShareCandidates({ data: { documentId: id } }),
        listDocumentShares({ data: { documentId: id } }),
      ]);
      return { candidates, ...current };
    },
    retry: false,
  });
  const access = useQuery({
    queryKey: ["m-document-access", id],
    queryFn: () => listDocumentAccessLogs({ data: { documentId: id, limit: 50 } }),
    retry: false,
  });

  useEffect(() => {
    if (!detail.data) return;
    setDraft({
      title: detail.data.document.title,
      folder: detail.data.document.folder,
      content: detail.data.document.content,
    });
    void logDocumentAccess({
      data: { documentId: id, action: "view", context: { surface: "pwa" } },
    }).catch(() => {});
  }, [detail.data, id]);

  const save = useMutation({
    mutationFn: () =>
      updateDocument({
        data: {
          documentId: id,
          title: draft.title.trim(),
          folder: draft.folder.trim(),
          content: draft.content,
          expectedRowVersion: detail.data?.document.row_version,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["m-document", id] });
      await queryClient.invalidateQueries({ queryKey: ["m-documents"] });
      setEditing(false);
      toast.success(t("m.doc.saved"));
    },
    onError: () => toast.error(t("m.doc.actionError")),
  });
  const addShare = useMutation({
    mutationFn: () =>
      shareDocument({
        data: {
          documentId: id,
          principalType: "user",
          principalId: candidateId,
          level: shareLevel,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["m-document-sharing", id] });
      setCandidateId("");
      toast.success(t("m.doc.shared"));
    },
    onError: () => toast.error(t("m.doc.actionError")),
  });
  const revokeShare = useMutation({
    mutationFn: (share: { principalType: "user" | "workspace" | "tenant"; principalId: string }) =>
      revokeDocumentShare({
        data: { documentId: id, ...share, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["m-document-sharing", id] });
      toast.success(t("m.doc.revoked"));
    },
    onError: () => toast.error(t("m.doc.actionError")),
  });

  if (detail.isLoading)
    return (
      <div className="p-4">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  if (!detail.data)
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p>{t("m.doc.openError")}</p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => void detail.refetch()}>
          {t("m.doc.retry")}
        </Button>
      </div>
    );

  const { document, versions, workspace } = detail.data;
  const remainingCandidates = (sharing.data?.candidates ?? []).filter(
    (candidate) =>
      !(sharing.data?.shares ?? []).some(
        (share) => share.principalType === "user" && share.principalId === candidate.userId,
      ),
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => void navigate({ to: "/m/documents" })}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">{t("m.doc.back")}</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{document.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {workspace?.name ?? document.folder}
          </p>
        </div>
      </header>

      <Tabs defaultValue="content" className="min-w-0">
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="content" className="min-h-11 shrink-0">
            {t("m.doc.content")}
          </TabsTrigger>
          <TabsTrigger value="info" className="min-h-11 shrink-0">
            {t("m.doc.info")}
          </TabsTrigger>
          <TabsTrigger value="versions" className="min-h-11 shrink-0">
            {t("m.doc.versions")}
          </TabsTrigger>
          <TabsTrigger value="sharing" className="min-h-11 shrink-0">
            {t("m.doc.sharing")}
          </TabsTrigger>
          <TabsTrigger value="access" className="min-h-11 shrink-0">
            {t("m.doc.access")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-3">
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button
                  className="min-h-11"
                  disabled={!draft.title.trim() || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {save.isPending ? t("m.doc.saving") : t("m.doc.save")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setEditing(false);
                    setDraft({
                      title: document.title,
                      folder: document.folder,
                      content: document.content,
                    });
                  }}
                >
                  {t("m.doc.cancel")}
                </Button>
              </>
            ) : (
              <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t("m.doc.edit")}
              </Button>
            )}
          </div>
          {editing ? (
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-doc-title">{t("m.doc.titleLabel")}</Label>
                <Input
                  id="edit-doc-title"
                  className="h-11"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, title: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-doc-folder">{t("m.doc.folderLabel")}</Label>
                <Input
                  id="edit-doc-folder"
                  className="h-11"
                  value={draft.folder}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, folder: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-doc-content">{t("m.doc.contentLabel")}</Label>
                <Textarea
                  id="edit-doc-content"
                  className="min-h-[52vh]"
                  value={draft.content}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, content: event.target.value }))
                  }
                />
              </div>
            </div>
          ) : (
            <article className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <Badge variant="outline">{document.folder}</Badge>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-7">
                {document.content || t("m.doc.emptyContent")}
              </div>
            </article>
          )}
        </TabsContent>

        <TabsContent value="info" className="mt-4 grid gap-3">
          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("m.doc.folderLabel")}</p>
              <p className="mt-1 font-medium">{document.folder}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("m.doc.updated")}</p>
              <p className="mt-1 font-medium">{date(document.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("m.doc.tags")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {document.tags.length ? (
                  document.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">{t("m.doc.noTags")}</span>
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="versions" className="mt-4 grid gap-2">
          {versions.length ? (
            versions.map((version) => (
              <section key={version.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">{fmt(t("m.doc.version"), { n: version.version })}</Badge>
                  <span className="text-xs text-muted-foreground">{date(version.created_at)}</span>
                </div>
                {version.comment ? <p className="mt-2 text-sm">{version.comment}</p> : null}
                {version.author_name ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {fmt(t("m.doc.author"), { name: version.author_name })}
                  </p>
                ) : null}
              </section>
            ))
          ) : (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              {t("m.doc.noVersions")}
            </p>
          )}
        </TabsContent>

        <TabsContent value="sharing" className="mt-4 space-y-3">
          {sharing.data?.canManage ? (
            <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
              <div className="grid gap-2">
                <Label>{t("m.doc.shareWith")}</Label>
                <Select value={candidateId} onValueChange={setCandidateId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("m.doc.shareWith")} />
                  </SelectTrigger>
                  <SelectContent>
                    {remainingCandidates.map((candidate) => (
                      <SelectItem key={candidate.userId} value={candidate.userId}>
                        {candidate.displayName ?? candidate.email ?? candidate.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("m.doc.shareLevel")}</Label>
                <Select
                  value={shareLevel}
                  onValueChange={(value) => setShareLevel(value as ShareLevel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["view", "comment", "edit", "manage"] as const).map((level) => (
                      <SelectItem key={level} value={level}>
                        {t(`m.doc.level.${level}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="min-h-11"
                disabled={!candidateId || addShare.isPending}
                onClick={() => addShare.mutate()}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t("m.doc.share")}
              </Button>
            </section>
          ) : null}
          {sharing.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (sharing.data?.shares ?? []).length ? (
            (sharing.data?.shares ?? []).map((share) => (
              <section
                key={`${share.principalType}-${share.principalId}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <UserRound className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{share.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {share.sublabel ?? t(`m.doc.level.${share.level as ShareLevel}`)}
                  </p>
                </div>
                {sharing.data?.canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    disabled={revokeShare.isPending}
                    onClick={() =>
                      revokeShare.mutate({
                        principalType: share.principalType,
                        principalId: share.principalId,
                      })
                    }
                  >
                    {t("m.doc.revoke")}
                  </Button>
                ) : null}
              </section>
            ))
          ) : (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              {remainingCandidates.length ? t("m.doc.noShares") : t("m.doc.noCandidates")}
            </p>
          )}
        </TabsContent>

        <TabsContent value="access" className="mt-4 grid gap-2">
          {access.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (access.data ?? []).length ? (
            (access.data ?? []).map((entry) => (
              <section
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
              >
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{entry.actorName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("m.doc.viewed")} · {date(entry.occurredAt)}
                  </p>
                </div>
              </section>
            ))
          ) : (
            <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              {t("m.doc.accessEmpty")}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
