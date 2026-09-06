// Trợ lý AI bán hàng / tư vấn trên landing page.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { askLandingAssistant } from "@/lib/api/landing-assistant.functions";

type Msg = { role: "user" | "assistant"; content: string };

export function AiSalesChat() {
  const { t, lang } = useI18n();
  const ask = useServerFn(askLandingAssistant);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const quick = [t("land.ai.q1"), t("land.ai.q2"), t("land.ai.q3")];

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { locale: lang, messages: next.slice(-12) } });
      setMessages([...next, { role: "assistant", content: res.answer }]);
    } catch {
      setMessages([...next, { role: "assistant", content: t("land.ai.error") }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("land.ai.open")}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-landing-blue text-landing-on-accent shadow-lg transition hover:bg-landing-blue/90"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-landing-line bg-landing-canvas shadow-2xl">
          <div className="flex items-center gap-2 border-b border-landing-line bg-landing-soft px-4 py-3">
            <Sparkles className="h-4 w-4 text-landing-magenta" />
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-semibold">{t("land.ai.title")}</p>
              <p className="truncate text-xs text-landing-muted">{t("land.ai.sub")}</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <p className="rounded-lg bg-landing-soft px-3 py-2 text-sm text-landing-muted">
                {t("land.ai.welcome")}
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-landing-blue px-3 py-2 text-sm text-landing-on-accent"
                    : "w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-landing-soft px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-landing-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("land.ai.thinking")}
              </div>
            ) : null}
          </div>

          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-full border border-landing-line px-3 py-1 text-xs text-landing-muted transition hover:border-landing-blue hover:text-landing-blue"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 px-4 pb-2">
              <Button asChild size="sm" variant="outline" className="h-8 flex-1 text-xs">
                <Link to="/pricing">{t("land.ai.cta.pricing")}</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="h-8 flex-1 bg-landing-blue text-xs text-landing-on-accent hover:bg-landing-blue/90"
              >
                <Link to="/auth">{t("land.ai.cta.trial")}</Link>
              </Button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-landing-line px-3 py-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("land.ai.placeholder")}
              className="h-10 flex-1 rounded-lg border border-landing-line bg-landing-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-landing-blue/30"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="h-10 w-10 shrink-0 bg-landing-blue text-landing-on-accent hover:bg-landing-blue/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
