import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  addCommitmentNote,
  createCommitment,
  listCommitmentEvents,
  listCommitments,
  setCommitmentStatus,
  type CommitmentDTO,
  type CommitmentStatus,
} from "@/lib/api/commitments.functions";

const STATUSES: CommitmentStatus[] = ["OPEN", "IN_PROGRESS", "FULFILLED", "BROKEN", "CANCELED"];

export const Route = createFileRoute("/_authenticated/commitments")({
  head: () => ({
    meta: [
      { title: "Cam kết · UNIWORK" },
      {
        name: "description",
        content:
          "Theo dõi lời hứa với khách hàng và đối tác: trạng thái, người phụ trách và tiến trình.",
      },
      { property: "og:title", content: "Cam kết · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi lời hứa với khách hàng và đối tác trong UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommitmentsPage,
});

function CommitmentsPage() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CommitmentStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ["commitments", statusFilter],
    queryFn: () =>
      listCommitments({
        data: { status: statusFilter === "ALL" ? null : statusFilter, limit: 100 },
      }),
  });

  const eventsQuery = useQuery({
    queryKey: ["commitment-events", selected],
    queryFn: () => listCommitmentEvents({ data: { commitmentId: selected! } }),
    enabled: Boolean(selected),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["commitments"] });
    queryClient.invalidateQueries({ queryKey: ["commitment-events"] });
  };

  const statusMut = useMutation({
    mutationFn: (input: { commitmentId: string; status: CommitmentStatus }) =>
      setCommitmentStatus({ data: input }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: (input: { commitmentId: string; note: string }) =>
      addCommitmentNote({ data: input }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });

  const selectedItem = (listQuery.data ?? []).find((c) => c.id === selected) ?? null;
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-US" : "vi-VN");

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <header className="mb-5 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">{t("cm.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("cm.subtitle")}</p>
            </div>
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="ml-2">{t("cm.new")}</span>
            </Button>
          </header>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant={statusFilter === "ALL" ? "default" : "outline"}
              size="sm"
              className="min-h-11"
              onClick={() => setStatusFilter("ALL")}
            >
              {t("cm.all")}
            </Button>
            {STATUSES.map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className="min-h-11"
                onClick={() => setStatusFilter(s)}
              >
                {t(`cm.status.${s}`)}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="grid content-start gap-2">
              {(listQuery.data ?? []).length === 0 && (
                <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
                  {t("cm.empty")}
                </p>
              )}
              {(listQuery.data ?? []).map((c: CommitmentDTO) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`min-h-11 rounded-2xl border px-4 py-3 text-left transition ${
                    selected === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface hover:bg-muted/50"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Handshake className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{c.title}</span>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {t(`cm.status.${c.status}`)}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {c.counterparty ? `${c.counterparty} · ` : ""}
                    {c.dueAt ? `${t("cm.dueAt")}: ${fmt(c.dueAt)} · ` : ""}
                    {c.sourceType
                      ? c.sourceType === "IMPORT"
                        ? t("cm.sourceImport")
                        : t("cm.sourceChat")
                      : t("cm.sourceManual")}
                  </span>
                </button>
              ))}
            </section>

            {selectedItem && (
              <aside className="grid content-start gap-4 rounded-2xl border border-border bg-surface p-4">
                <div>
                  <h2 className="text-base font-semibold">{selectedItem.title}</h2>
                  {selectedItem.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description}</p>
                  )}
                  {selectedItem.sourceExcerpt && (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                      {selectedItem.sourceExcerpt}
                    </blockquote>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("cm.statusChanged")}
                  </p>
                  <Select
                    value={selectedItem.status}
                    onValueChange={(v) =>
                      statusMut.mutate({
                        commitmentId: selectedItem.id,
                        status: v as CommitmentStatus,
                      })
                    }
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`cm.status.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("cm.timeline")}</p>
                  <ul className="grid gap-2 text-sm">
                    {(eventsQuery.data ?? []).map((e) => (
                      <li key={e.id} className="rounded-xl border border-border p-2.5">
                        <span className="text-xs text-muted-foreground">{fmt(e.createdAt)}</span>
                        <p className="mt-0.5">
                          {e.eventType === "CREATED" && t("cm.created")}
                          {e.eventType === "STATUS_CHANGED" &&
                            `${t(`cm.status.${e.fromStatus}`)} → ${t(`cm.status.${e.toStatus}`)}`}
                          {e.eventType === "NOTE" && e.note}
                        </p>
                        {e.eventType === "STATUS_CHANGED" && e.note && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <NoteForm
                    onSubmit={(note) => noteMut.mutate({ commitmentId: selectedItem.id, note })}
                    disabled={noteMut.isPending}
                  />
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>

      <CreateCommitmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          invalidate();
          setSelected(id);
        }}
      />
    </div>
  );
}

function NoteForm({ onSubmit, disabled }: { onSubmit: (note: string) => void; disabled: boolean }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return;
        onSubmit(note.trim());
        setNote("");
      }}
    >
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("cm.notePlaceholder")}
        className="min-h-11"
      />
      <Button type="submit" variant="outline" className="min-h-11" disabled={disabled}>
        {t("cm.addNote")}
      </Button>
    </form>
  );
}

function CreateCommitmentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [dueAt, setDueAt] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createCommitment({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          counterparty: counterparty.trim() || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          idempotencyKey: `manual:${title.trim().toLowerCase()}`,
        },
      }),
    onSuccess: (r) => {
      toast.success(t("cm.created"));
      setTitle("");
      setDescription("");
      setCounterparty("");
      setDueAt("");
      onOpenChange(false);
      onCreated(r.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("cm.new")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createMut.mutate();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("cm.titlePlaceholder")}
            className="min-h-11"
            required
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("cm.title")}
            rows={3}
          />
          <Input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder={t("cm.counterpartyPlaceholder")}
            className="min-h-11"
          />
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="min-h-11"
          />
          <Button type="submit" className="min-h-11" disabled={createMut.isPending}>
            {t("cm.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
