// UNI WORKSPACE COPILOT V1 — panel toàn cục (desktop: side panel, mobile: bottom sheet).
// Read-only. Chỉ gọi AI khi người dùng chủ động gửi câu hỏi (không auto-call khi load trang).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, X, ArrowUp, RotateCcw, Copy, Square, Maximize2, Minimize2, History, CornerDownLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askUniCopilot } from "@/lib/api/ai-copilot.functions";
import { proposeAiAction } from "@/lib/api/ai-actions.functions";
import { detectActionIntent } from "@/domain/ai-actions/contracts";
import type { ProposedAiAction } from "@/domain/ai-actions/contracts";
import { ActionProposalCard } from "@/components/ai/action-proposal-card";
import { useActiveTenant } from "@/features/tenants/hooks";
import type { ContextSource } from "@/domain/ai-context/contracts";
import { validateAnswerCitations } from "@/domain/ai-context/citations";
import { SourceFreshnessBadge } from "@/components/ai/source-freshness-badge";
import { getSourceFreshness } from "@/domain/ai-context/freshness";
import type { CopilotRoot, UniCopilotResponse } from "@/domain/ai-copilot/contracts";
import { ROOT_LABEL, rootContextKey, suggestionsForRoot } from "@/domain/ai-copilot/contracts";

/* ------------------------------- Store ------------------------------- */

type CopilotState = { open: boolean; root: CopilotRoot; workspaceId: string | null; seed: string | null };
let state: CopilotState = { open: false, root: null, workspaceId: null, seed: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function openUniCopilot(opts?: { root?: CopilotRoot; workspaceId?: string | null; seed?: string | null }) {
  state = {
    open: true,
    root: opts?.root ?? null,
    workspaceId: opts?.workspaceId ?? null,
    seed: opts?.seed ?? null,
  };
  emit();
}
export function closeUniCopilot() {
  state = { ...state, open: false, seed: null };
  emit();
}
export const useUniCopilotState = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/* ------------------------------ Messages ------------------------------ */

type Msg =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; response: UniCopilotResponse }
  | { id: string; role: "action"; content: string; proposal: ProposedAiAction }
  | { id: string; role: "note"; content: string };

const uid = () => Math.random().toString(36).slice(2);

/* ------------------------------- Panel ------------------------------- */

export function UniCopilot() {
  const { open, root, workspaceId, seed } = useUniCopilotState();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<"idle" | "context" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState<string | null>(null);
  // Ngữ cảnh gốc UNI tự giữ giữa các lượt follow-up (khi người dùng không ghim sẵn root).
  const [pinnedRoot, setPinnedRoot] = useState<CopilotRoot>(null);
  // Mobile bottom sheet: 'half' (mặc định) ↔ 'full', kéo xuống để đóng.
  const [snap, setSnap] = useState<"half" | "full">("half");
  // Desktop: thu gọn panel để giải phóng không gian, giữ ngữ cảnh và lịch sử.
  const [collapsed, setCollapsed] = useState(false);
  // Lịch sử follow-up đã hỏi (kèm nguồn trích dẫn) — mở/đóng bằng nút Lịch sử.
  const [showHistory, setShowHistory] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ startY: number; pointerId: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const ask = useServerFn(askUniCopilot);
  const propose = useServerFn(proposeAiAction);
  const navigate = useNavigate();
  const tenant = useActiveTenant();
  const tenantId = tenant.data?.tenantId ?? null;
  const currentRootKey = rootContextKey(root);
  const effectiveRoot = root ?? pinnedRoot;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setPending(false);
    setPhase("idle");
    setLastQuery(null);
    setPinnedRoot(null);
    setShowHistory(false);
  }, []);

  // §84/§85 — đổi tenant (hoặc đăng xuất) phải xoá sạch hội thoại + nguồn.
  const tenantRef = useRef<string | null>(tenantId);
  useEffect(() => {
    if (tenantRef.current !== tenantId) {
      tenantRef.current = tenantId;
      reset();
      setContextNote(null);
    }
  }, [tenantId, reset]);

  // §57/§58 — đổi ngữ cảnh gốc: bắt đầu luồng mới, không trộn ngầm.
  const rootRef = useRef<string | null>(currentRootKey);
  useEffect(() => {
    if (rootRef.current !== currentRootKey) {
      const previous = rootRef.current;
      rootRef.current = currentRootKey;
      reset();
      setContextNote(
        currentRootKey
          ? `Đã chuyển ngữ cảnh sang ${root?.title ?? ROOT_LABEL[root!.type]}`
          : previous
            ? "Đã chuyển sang ngữ cảnh toàn workspace"
            : null,
      );
    }
  }, [currentRootKey, root, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (state.open) closeUniCopilot();
        else openUniCopilot({ root: state.root, workspaceId: state.workspaceId });
      }
      if (e.key === "Escape" && state.open) closeUniCopilot();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    // Trên mobile không auto-focus để bàn phím không che nội dung ngay khi mở.
    const isTouch = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    if (!isTouch) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Khoá scroll nền khi sheet mở trên mobile.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, pointerId: e.pointerId };
  }, []);
  const onHandleMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragY(Math.max(-80, e.clientY - d.startY));
  }, []);
  const onHandleUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const delta = e.clientY - d.startY;
      dragRef.current = null;
      setDragY(0);
      if (delta < -48) setSnap("full");
      else if (delta > 120) closeUniCopilot();
      else if (delta > 48) setSnap((s) => (s === "full" ? "half" : s));
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const submit = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (q.length < 2 || pending) return;
      setInput("");
      setError(null);
      setLastQuery(q);
      setContextNote(null);
      const history = messages
        .filter((m): m is Extract<Msg, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { id: uid(), role: "user", content: q }]);

      // §94 — cổng ý định: chỉ khi có động từ hành động tường minh UNI mới đề xuất ghi.
      const intent = detectActionIntent(q);
      if (intent.kind === "BLOCKED") {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "note",
            content:
              intent.reason === "SEND_EMAIL"
                ? "UNI V1 chỉ có thể soạn thư nháp, chưa được phép gửi email thay bạn. Hãy mở nháp trong Email và tự gửi."
                : "UNI V1 không được phép xoá dữ liệu.",
          },
        ]);
        return;
      }
      if (intent.kind === "PROPOSE") {
        setPending(true);
        setPhase("context");
        try {
          const proposal = (await propose({
            data: {
              query: q,
              actionType: intent.actionType,
              source: "UNI_COPILOT",
              workspaceId: workspaceId ?? null,
              rootEntity: effectiveRoot ? { type: effectiveRoot.type, id: effectiveRoot.id } : null,
              targetTaskId: effectiveRoot?.type === "TASK" ? effectiveRoot.id : null,
            },
          } as never)) as ProposedAiAction;
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "action", content: proposal.title, proposal },
          ]);
        } catch (e) {
          setError(e instanceof Error && e.message ? e.message : "UNI chưa thể chuẩn bị hành động này.");
        } finally {
          setPending(false);
          setPhase("idle");
        }
        return;
      }

      setPending(true);
      setPhase("context");
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => setPhase("generating"), 900);
      try {
        const res = (await ask({
          data: {
            query: q,
            rootEntity: effectiveRoot ? { type: effectiveRoot.type, id: effectiveRoot.id } : null,
            workspaceId: workspaceId ?? null,
            history,
          },
          signal: controller.signal,
        } as never)) as UniCopilotResponse;
        if (controller.signal.aborted) return;
        if (!root && res.resolvedRoot) {
          setPinnedRoot({ type: res.resolvedRoot.type, id: res.resolvedRoot.id, title: res.resolvedRoot.title || undefined });
        }
        setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: res.answer, response: res }]);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error && e.message ? e.message : "UNI hiện chưa thể trả lời. Vui lòng thử lại.");
        }
      } finally {
        clearTimeout(timer);
        setPending(false);
        setPhase("idle");
        abortRef.current = null;
      }
    },
    [ask, propose, messages, pending, root, effectiveRoot, workspaceId],
  );

  useEffect(() => {
    if (open && seed) {
      const q = seed;
      state = { ...state, seed: null };
      void submit(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  const suggestions = useMemo(() => suggestionsForRoot(effectiveRoot), [effectiveRoot]);

  // Ghép mỗi câu hỏi với câu trả lời tương ứng + nguồn thực sự được trích dẫn.
  const askedHistory = useMemo(() => {
    const items: {
      id: string;
      question: string;
      answerId: string | null;
      sources: ContextSource[];
      totalSources: number;
    }[] = [];
    messages.forEach((m, i) => {
      if (m.role !== "user") return;
      const next = messages[i + 1];
      const answer = next && next.role === "assistant" ? next : null;
      const cited = answer
        ? validateAnswerCitations(answer.content, answer.response.sources)
            .segments.filter((s) => s.type === "citation" && s.source)
            .map((s) => s.source!)
        : [];
      const unique = Array.from(new Map(cited.map((s) => [s.sourceId, s])).values());
      items.push({
        id: m.id,
        question: m.content,
        answerId: answer?.id ?? null,
        sources: unique.length > 0 ? unique : (answer?.response.sources.slice(0, 3) ?? []),
        totalSources: answer?.response.sources.length ?? 0,
      });
    });
    return items;
  }, [messages]);

  const scrollToMessage = useCallback((id: string) => {
    document.getElementById(`uni-msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px] md:hidden" onClick={closeUniCopilot} aria-hidden />
      <aside
        role="dialog"
        aria-label="UNI — Workspace Copilot"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border border-border bg-background shadow-xl transition-[top,transform,width] duration-200 ease-out md:inset-y-0 md:left-auto md:right-0 md:rounded-none md:border-y-0 md:border-r-0 ${
          snap === "full" ? "top-4" : "top-[38vh]"
        } md:top-0 ${collapsed ? "md:w-16" : "md:w-[420px]"}`}
      >
        {/* Tay nắm kéo — chỉ mobile: kéo lên mở rộng, kéo xuống thu nhỏ/đóng. */}
        <div
          className="flex shrink-0 justify-center py-2 md:hidden"
          style={{ touchAction: "none" }}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragY(0);
          }}
          role="separator"
          aria-label="Kéo để thay đổi kích thước UNI"
        >
          <span className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">UNI</p>
              <p className="text-[11px] text-muted-foreground">Workspace Copilot</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={snap === "full" ? "Thu nhỏ UNI" : "Mở rộng UNI"}
              onClick={() => setSnap((s) => (s === "full" ? "half" : "full"))}
            >
              {snap === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Lịch sử câu hỏi"
                aria-pressed={showHistory}
                title="Lịch sử câu hỏi đã hỏi"
                className={showHistory ? "text-primary" : undefined}
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="h-4 w-4" />
              </Button>
            )}
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" aria-label="Hội thoại mới" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Đóng UNI" onClick={closeUniCopilot}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {effectiveRoot && (
          <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2 text-xs">
            <span className="text-muted-foreground">{root ? "Ngữ cảnh:" : "Đang theo dõi:"}</span>
            <span className="truncate rounded-md bg-background px-2 py-0.5 font-medium">
              {ROOT_LABEL[effectiveRoot.type]} · {effectiveRoot.title ?? "Đang xem"}
            </span>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPinnedRoot(null);
                if (root) openUniCopilot({ root: null, workspaceId });
              }}
            >
              Bỏ
            </button>
          </div>
        )}

        {showHistory && askedHistory.length > 0 && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border bg-surface/60 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Đã hỏi ({askedHistory.length})
            </p>
            <ul className="space-y-2">
              {askedHistory.map((h, idx) => (
                <li key={h.id} className="rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{idx + 1}.</span>
                    <button
                      onClick={() => (h.answerId ? scrollToMessage(h.answerId) : scrollToMessage(h.id))}
                      className="min-w-0 flex-1 text-left text-[13px] font-medium hover:underline"
                      title="Xem lại câu trả lời"
                    >
                      {h.question}
                    </button>
                    <button
                      onClick={() => void submit(h.question)}
                      aria-label="Hỏi lại câu này"
                      title="Hỏi lại"
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {h.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {h.sources.map((s) => (
                        <button
                          key={s.sourceId}
                          onClick={() => navigate({ to: s.href })}
                          title={`${ROOT_LABEL[s.entityType]} · ${s.title} — ${getSourceFreshness(s.updatedAt).description}`}
                          className="flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                        >
                          <span className="truncate">{s.sourceId} · {s.title}</span>
                          <SourceFreshnessBadge updatedAt={s.updatedAt} />
                        </button>
                      ))}
                      {h.totalSources > h.sources.length && (
                        <span className="rounded-full px-1 py-0.5 text-[11px] text-muted-foreground">
                          +{h.totalSources - h.sources.length} nguồn khác
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {contextNote && <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted-foreground">{contextNote}</p>}

          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Gợi ý</p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void submit(s)}
                  className="block min-h-11 w-full rounded-lg border border-border px-3 py-2.5 text-left text-sm hover:bg-surface active:bg-surface-2"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) =>
            m.role === "action" ? (
              <div key={m.id} id={`uni-msg-${m.id}`}>
                <ActionProposalCard proposal={m.proposal} />
              </div>
            ) : m.role === "note" ? (
              <p key={m.id} className="rounded-xl bg-surface px-3 py-2 text-[13px] text-muted-foreground">
                {m.content}
              </p>
            ) : m.role === "user" ? (
              <div
                key={m.id}
                id={`uni-msg-${m.id}`}
                className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                {m.content}
              </div>
            ) : (
              <div key={m.id} id={`uni-msg-${m.id}`}>
                <AnswerBlock response={m.response} onOpen={(href) => navigate({ to: href })} onAsk={submit} />
              </div>
            ),
          )}

          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "context" ? "Đang kiểm tra dữ liệu liên quan..." : "Đang tổng hợp..."}
            </div>
          )}

          {error && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{error}</p>
              {lastQuery && (
                <Button size="sm" variant="outline" onClick={() => void submit(lastQuery)}>
                  Thử lại
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2 rounded-xl border border-border px-3 py-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(input);
                }
              }}
              placeholder="Hỏi về công việc của bạn"
              aria-label="Câu hỏi cho UNI"
              className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
            />
            {pending ? (
              <Button size="icon" variant="ghost" className="h-11 w-11 md:h-9 md:w-9" aria-label="Dừng" onClick={() => abortRef.current?.abort()}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-11 w-11 md:h-9 md:w-9"
                aria-label="Gửi câu hỏi"
                disabled={input.trim().length < 2}
                onClick={() => void submit(input)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">UNI chỉ đọc dữ liệu bạn có quyền xem. Mọi thay đổi đều cần bạn xác nhận trước khi thực hiện.</p>
        </div>
      </aside>
    </>
  );
}

/* ---------------------------- Answer render ---------------------------- */

function AnswerBlock({
  response,
  onOpen,
  onAsk,
}: {
  response: UniCopilotResponse;
  onOpen: (href: string) => void;
  onAsk: (q: string) => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const validated = useMemo(
    () => validateAnswerCitations(response.answer, response.sources),
    [response.answer, response.sources],
  );

  return (
    <div className="space-y-3 rounded-2xl rounded-bl-sm bg-surface px-3 py-3 text-sm">
      <p className="whitespace-pre-wrap leading-relaxed">
        {validated.segments.map((seg, i) =>
          seg.type === "citation" && seg.source ? (
            <button
              key={i}
              onClick={() => onOpen(seg.source!.href)}
              className="mx-0.5 rounded bg-primary/10 px-1 text-[11px] font-medium text-primary align-baseline"
              title={seg.source.title}
            >
              {seg.text}
            </button>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>

      {response.sections.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-2.5">
          {s.title && <p className="mb-1 text-xs font-semibold">{s.title}</p>}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{s.content}</p>
        </div>
      ))}

      {response.ambiguity && response.ambiguity.candidates.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border bg-background p-2.5 text-[13px]">
          <p className="font-medium">Có nhiều đối tượng phù hợp:</p>
          {response.ambiguity.candidates.slice(0, 5).map((c) => (
            <button key={c.entityId} onClick={() => onOpen(c.href)} className="block text-left text-primary hover:underline">
              {c.title}
            </button>
          ))}
        </div>
      )}

      {response.partial && (
        <p className="text-[12px] text-muted-foreground">Một phần dữ liệu chưa truy xuất được, câu trả lời có thể chưa đầy đủ.</p>
      )}

      {response.sources.length > 0 && (
        <div className="border-t border-border pt-2">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showSources}
          >
            Nguồn · đã tham chiếu {response.sources.length} nguồn
          </button>
          {showSources && (
            <ul className="mt-2 space-y-1">
              {response.sources.map((s: ContextSource) => (
                <li key={s.sourceId}>
                  <button
                    onClick={() => onOpen(s.href)}
                    className="flex min-h-[44px] w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-background"
                  >
                    <span className="text-[13px] font-medium">{s.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>
                        {ROOT_LABEL[s.entityType]} · {s.sourceId}
                      </span>
                      <SourceFreshnessBadge updatedAt={s.updatedAt} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {response.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {response.suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[12px] hover:bg-background"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => void navigator.clipboard?.writeText(response.answer)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Copy className="h-3 w-3" /> Sao chép
      </button>
    </div>
  );
}

/* --------------------------- Entry buttons --------------------------- */

export function UniCopilotButton({
  root,
  workspaceId,
  label = "Hỏi UNI",
  className,
}: {
  root?: CopilotRoot;
  workspaceId?: string | null;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      title="Hỏi UNI (⌘J)"
      onClick={() => openUniCopilot({ root: root ?? null, workspaceId: workspaceId ?? null })}
    >
      <Sparkles className="mr-1.5 h-4 w-4" /> {label}
    </Button>
  );
}
