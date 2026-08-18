import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArrowLeft, Bold, Italic, List, Link2, Image as ImageIcon, Loader2, Save, Send, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { deleteEmailDraft, getEmailDraft, saveEmailDraft, sendEmail } from "@/lib/api/emails.functions";

const searchSchema = z.object({
  draft: z.string().uuid().optional(),
  thread: z.string().uuid().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  cc: z.string().optional(),
  body: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/email_/compose")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Soạn email · UNIWORK" },
      { name: "description", content: "Soạn, lưu nháp và gửi email nội bộ trong không gian làm việc UNIWORK." },
      { property: "og:title", content: "Soạn email · UNIWORK" },
      { property: "og:description", content: "Soạn, lưu nháp và gửi email nội bộ trong không gian làm việc UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComposePage,
});

const parseList = (s: string) =>
  s.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);

function ComposePage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const nav = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();

  const loadDraft = useServerFn(getEmailDraft);
  const doSave = useServerFn(saveEmailDraft);
  const doSend = useServerFn(sendEmail);
  const doDelete = useServerFn(deleteEmailDraft);

  const [draftId, setDraftId] = useState<string | undefined>(search.draft);
  const [threadId, setThreadId] = useState<string | undefined>(search.thread);
  const [to, setTo] = useState(search.to ?? "");
  const [cc, setCc] = useState(search.cc ?? "");
  const [showCc, setShowCc] = useState(Boolean(search.cc));
  const [subject, setSubject] = useState(search.subject ?? "");
  const [body, setBody] = useState(search.body ?? "");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  {t("em.105")}
  const wrapSelection = useCallback((before: string, after = before, placeholder = t("em.106")) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }, []);

  const insertAtCursor = useCallback((text: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => (b ? `${b}\n${text}` : text));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const next = `${el.value.slice(0, start)}${text}${el.value.slice(start)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }, []);
  const dirty = useRef(false);

  const draftQ = useQuery({
    queryKey: ["email", "draft", search.draft],
    queryFn: () => loadDraft({ data: { id: search.draft! } }),
    enabled: !!search.draft,
  });

  useEffect(() => {
    const d = draftQ.data;
    if (!d) return;
    setDraftId(d.id);
    setThreadId(d.thread_id);
    setTo(d.to.join(", "));
    setCc(d.cc.join(", "));
    setShowCc(d.cc.length > 0);
    setSubject(d.subject);
    setBody(d.body);
    dirty.current = false;
  }, [draftQ.data]);

  const payload = useCallback(
    () => ({
      draft_id: draftId,
      thread_id: threadId,
      to: parseList(to),
      cc: showCc ? parseList(cc) : [],
      subject: subject.trim(),
      body,
    }),
    [draftId, threadId, to, cc, showCc, subject, body],
  );

  const saveMut = useMutation({
    mutationFn: (silent: boolean) => doSave({ data: payload() }).then((r) => ({ ...r, silent })),
    onSuccess: (r) => {
      setDraftId(r.draft_id);
      setThreadId(r.thread_id);
      setSavedAt(new Date());
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["emails"] });
      if (!r.silent) toast.success(t("em.107"));
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : t("em.108")),
  });

  const sendMut = useMutation({
    mutationFn: () => doSend({ data: { ...payload(), cc: showCc ? parseList(cc) : undefined } }),
    onSuccess: (r: { thread_id: string; unknown_recipients?: string[] }) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      if (r.unknown_recipients?.length) {
        toast.warning(`${t("em.150")}: ${r.unknown_recipients.join(", ")}`);
      } else {
        toast.success(t("em.109"));
      }
      nav({ to: "/email/$id", params: { id: r.thread_id } });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : t("em.110")),
  });

  const delMut = useMutation({
    mutationFn: () => doDelete({ data: { id: draftId! } }),
    onSuccess: () => {
      toast.success(t("em.111"));
      qc.invalidateQueries({ queryKey: ["emails"] });
      nav({ to: "/email" });
    },
  });

  // autosave
  useEffect(() => {
    if (!dirty.current) return;
    const hasContent = to.trim() || subject.trim() || body.trim();
    if (!hasContent) return;
    const t = setTimeout(() => {
      if (!saveMut.isPending && !sendMut.isPending) saveMut.mutate(true);
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, subject, body]);

  const touch =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      dirty.current = true;
      setErr(null);
      setter(v);
    };

  const canSend = parseList(to).length > 0 && subject.trim().length > 0 && !sendMut.isPending;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="email" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            <Link to="/email" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> {t("em.113")}
            </Link>

            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h1 className="text-sm font-semibold">{draftId ? t("em.102") : t("em.114")}</h1>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    {saveMut.isPending
                      ? t("em.115")
                      : savedAt
                        ? `${t("em.151")} ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                  </span>
                  <button onClick={() => nav({ to: "/email" })} className="rounded p-1 hover:bg-surface-2" aria-label={t("em.116")}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {draftQ.isLoading ? (
                <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("em.117")}
                </div>
              ) : (
                <>
                  <div className="px-5">
                    <Field label={t("em.118")}>
                      <input value={to} onChange={(e) => touch(setTo)(e.target.value)} placeholder="email@example.com" className="flex-1 bg-transparent text-sm focus:outline-none" />
                      <button type="button" onClick={() => setShowCc((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                        Cc
                      </button>
                    </Field>
                    {showCc && (
                      <Field label="Cc">
                        <input value={cc} onChange={(e) => touch(setCc)(e.target.value)} placeholder="cc@example.com" className="flex-1 bg-transparent text-sm focus:outline-none" />
                      </Field>
                    )}
                    <Field label={t("em.119")}>
                      <input value={subject} onChange={(e) => touch(setSubject)(e.target.value)} placeholder={t("em.120")} className="flex-1 bg-transparent text-sm focus:outline-none" />
                    </Field>
                  </div>

                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => touch(setBody)(e.target.value)}
                    rows={14}
                    placeholder={t("em.121")}
                    className="w-full resize-none border-t border-border bg-transparent px-5 py-4 text-sm focus:outline-none"
                  />
                </>
              )}

              {err && (
                <div className="border-t border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">{err}</div>
              )}

              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <div className="flex items-center gap-1">
                  {[
                    { icon: Bold, label: t("em.122"), run: () => wrapSelection("**") },
                    { icon: Italic, label: t("em.123"), run: () => wrapSelection("*") },
                    { icon: List, label: t("em.124"), run: () => insertAtCursor("\n- ") },
                    {
                      icon: Link2,
                      label: t("em.125"),
                      run: () => {
                        const url = window.prompt(t("em.126"), "https://");
                        if (url) wrapSelection("[", `](${url})`, t("em.152"));
                      },
                    },
                    {
                      icon: ImageIcon,
                      label: t("em.127"),
                      run: () => {
                        const url = window.prompt(t("em.128"), "https://");
                        if (url) insertAtCursor(`![${t("em.153")}](${url})`);
                      },
                    },
                  ].map(({ icon: I, label, run }) => (
                    <button
                      key={label}
                      type="button"
                      title={label}
                      aria-label={label}
                      onClick={run}
                      className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    >
                      <I className="h-4 w-4" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      insertAtCursor(
                        `${t("em.154")}\n\n${subject.trim() || t("em.155")}: ${t("em.156")}\n\n${t("em.157")}`,
                      );
                      toast.success(t("em.129"));
                    }}
                    className="ml-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {t("em.130")}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setErr(null); saveMut.mutate(false); }}
                    disabled={saveMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {t("em.131")}
                  </button>
                  <button
                    disabled={!draftId || delMut.isPending}
                    onClick={() => { if (confirm(t("em.132"))) delMut.mutate(); }}
                    className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-destructive disabled:opacity-40"
                    aria-label={t("em.133")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    disabled={!canSend}
                    onClick={() => { setErr(null); sendMut.mutate(); }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sendMut.isPending ? t("em.134") : t("em.135")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
