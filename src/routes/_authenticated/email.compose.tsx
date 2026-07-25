import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Bold, Italic, List, Link2, Paperclip, Image as ImageIcon, Send, Sparkles, Trash2, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { sendEmail } from "@/lib/api/emails.functions";

export const Route = createFileRoute("/_authenticated/email/compose")({
  head: () => ({ meta: [{ title: "Soạn email · UNIWORK" }] }),
  component: ComposePage,
});

function ComposePage() {
  const [open, setOpen] = useSidebarState();
  const nav = useNavigate();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const parseList = (s: string) =>
    s
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  const sendMut = useMutation({
    mutationFn: () =>
      sendEmail({
        data: {
          to: parseList(to),
          cc: showCc ? parseList(cc) : undefined,
          subject: subject.trim(),
          body,
        },
      }),
    onSuccess: () => nav({ to: "/email" }),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Không gửi được email"),
  });

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
                <h1 className="text-sm font-semibold">Tin nhắn mới</h1>
                <button onClick={() => nav({ to: "/email" })} className="rounded p-1 hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5">
                <Field label="Đến">
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@example.com" className="flex-1 bg-transparent text-sm focus:outline-none" />
                  <button
                    type="button"
                    onClick={() => setShowCc((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cc
                  </button>
                </Field>
                {showCc && (
                  <Field label="Cc">
                    <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="flex-1 bg-transparent text-sm focus:outline-none" />
                  </Field>
                )}
                <Field label="Tiêu đề">
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tiêu đề email" className="flex-1 bg-transparent text-sm focus:outline-none" />
                </Field>
              </div>

              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} placeholder="Viết nội dung email…" className="w-full resize-none border-t border-border bg-transparent px-5 py-4 text-sm focus:outline-none" />

              {err && (
                <div className="border-t border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">
                  {err}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <div className="flex items-center gap-1">
                  {[Bold, Italic, List, Link2, Paperclip, ImageIcon].map((I, i) => (
                    <button key={i} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <I className="h-4 w-4" />
                    </button>
                  ))}
                  <button className="ml-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15">
                    <Sparkles className="h-3.5 w-3.5" /> Viết với AI
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    disabled={!canSend}
                    onClick={() => {
                      setErr(null);
                      sendMut.mutate();
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> {sendMut.isPending ? "Đang gửi…" : "Gửi"}
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