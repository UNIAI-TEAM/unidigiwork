import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

  /** Chèn markdown quanh vùng đang chọn trong ô nội dung. */
  const wrapSelection = useCallback((before: string, after = before, placeholder = "văn bản") => {
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
      if (!r.silent) toast.success("Đã lưu nháp");
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Không lưu được bản nháp"),
  });

  const sendMut = useMutation({
    mutationFn: () => doSend({ data: { ...payload(), cc: showCc ? parseList(cc) : undefined } }),
    onSuccess: (r: { thread_id: string; unknown_recipients?: string[] }) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      if (r.unknown_recipients?.length) {
        toast.warning(`Không gửi được tới: ${r.unknown_recipients.join(", ")}`);
      } else {
        toast.success("Đã gửi email");
      }
      nav({ to: "/email/$id", params: { id: r.thread_id } });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Không gửi được email"),
  });

  const delMut = useMutation({
    mutationFn: () => doDelete({ data: { id: draftId! } }),
    onSuccess: () => {
      toast.success("Đã xoá bản nháp");
      qc.invalidateQueries({ queryKey: ["emails"] });
      nav({ to: "/email" });
    },
  });

  // Autosave nháp sau 2s ngừng gõ
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
              <ArrowLeft className="h-4 w-4" /> Hộp thư
            </Link>

            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h1 className="text-sm font-semibold">{draftId ? "Bản nháp" : "Tin nhắn mới"}</h1>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    {saveMut.isPending
                      ? "Đang lưu…"
                      : savedAt
                        ? `Đã lưu ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                  </span>
                  <button onClick={() => nav({ to: "/email" })} className="rounded p-1 hover:bg-surface-2" aria-label="Đóng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {draftQ.isLoading ? (
                <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bản nháp…
                </div>
              ) : (
                <>
                  <div className="px-5">
                    <Field label="Đến">
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
                    <Field label="Tiêu đề">
                      <input value={subject} onChange={(e) => touch(setSubject)(e.target.value)} placeholder="Tiêu đề email" className="flex-1 bg-transparent text-sm focus:outline-none" />
                    </Field>
                  </div>

                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => touch(setBody)(e.target.value)}
                    rows={14}
                    placeholder="Viết nội dung email…"
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
                    { icon: Bold, label: "In đậm", run: () => wrapSelection("**") },
                    { icon: Italic, label: "In nghiêng", run: () => wrapSelection("*") },
                    { icon: List, label: "Danh sách", run: () => insertAtCursor("\n- ") },
                    {
                      icon: Link2,
                      label: "Chèn liên kết",
                      run: () => {
                        const url = window.prompt("Nhập đường dẫn liên kết", "https://");
                        if (url) wrapSelection("[", `](${url})`, "liên kết");
                      },
                    },
                    {
                      icon: ImageIcon,
                      label: "Chèn ảnh",
                      run: () => {
                        const url = window.prompt("Nhập đường dẫn ảnh", "https://");
                        if (url) insertAtCursor(`![ảnh](${url})`);
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
                        `Kính gửi anh/chị,\n\n${subject.trim() || "Nội dung trao đổi"}: em xin gửi thông tin để anh/chị xem xét và phản hồi giúp em.\n\nTrân trọng,`,
                      );
                      toast.success("Đã chèn bản nháp gợi ý.");
                    }}
                    className="ml-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Viết với AI
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setErr(null); saveMut.mutate(false); }}
                    disabled={saveMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> Lưu nháp
                  </button>
                  <button
                    disabled={!draftId || delMut.isPending}
                    onClick={() => { if (confirm("Xoá bản nháp này?")) delMut.mutate(); }}
                    className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-destructive disabled:opacity-40"
                    aria-label="Xoá bản nháp"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    disabled={!canSend}
                    onClick={() => { setErr(null); sendMut.mutate(); }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sendMut.isPending ? "Đang gửi…" : "Gửi"}
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
