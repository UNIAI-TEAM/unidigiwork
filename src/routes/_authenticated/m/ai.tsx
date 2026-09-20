import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { askUniCopilot } from "@/lib/api/ai-copilot.functions";
import { listWorkDeliverables } from "@/lib/api/work-deliverables.functions";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowUp, Bot, ChevronRight, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "do", label: "Do" },
  { id: "brief", label: "Brief Me" },
  { id: "team", label: "AI Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const QUICK_PROMPTS: Record<TabId, string[]> = {
  ask: ["Tóm tắt ngày hôm nay", "Việc nào đang trễ hạn?", "Ai đang chờ tôi duyệt?"],
  do: [
    "Lập kế hoạch tuần này",
    "Soạn email cập nhật dự án",
    "Tạo danh sách việc từ cuộc họp gần nhất",
  ],
  brief: ["Điểm tin công việc hôm nay", "Tình hình dự án đang chạy", "Rủi ro cần lưu ý tuần này"],
  team: [],
};

export const Route = createFileRoute("/_authenticated/m/ai")({
  head: () => ({
    meta: [
      { title: "My AI · UNIWORK" },
      {
        name: "description",
        content: "Hỏi, giao việc và theo dõi đội ngũ AI của bạn trên UNIWORK.",
      },
      { property: "og:title", content: "My AI · UNIWORK" },
      {
        property: "og:description",
        content: "Hỏi, giao việc và theo dõi đội ngũ AI của bạn trên UNIWORK.",
      },
    ],
  }),
  component: MobileMyAiPage,
});

function MobileMyAiPage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [tab, setTab] = useState<TabId>("ask");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const recent = useQuery({
    queryKey: ["m-ai-recent-products", workspaceId],
    queryFn: () =>
      listWorkDeliverables({ data: { workspaceId: workspaceId ?? null, limit: 4 } } as any),
  });

  const ask = useMutation({
    mutationFn: (q: string) =>
      askUniCopilot({ data: { query: q, workspaceId: workspaceId ?? null } } as any),
    onSuccess: (r: any) => setAnswer(r?.answer ?? r?.text ?? "Chưa có câu trả lời."),
    onError: (e: any) => toast.error(e?.message ?? "UNI chưa trả lời được, thử lại sau."),
  });

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setAnswer(null);
    ask.mutate(q);
  };

  const products = (recent.data as any[] | undefined) ?? [];

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pb-24">
      <header>
        <p className="module-label text-ai-pink">AI workspace</p>
        <h1 className="mt-1 font-heading text-2xl font-bold">My AI</h1>
        <p className="text-sm text-muted-foreground">Đồng đội AI của bạn và cả đội ngũ AI.</p>
      </header>

      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-background p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 rounded-lg px-2 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-action text-action-foreground"
                : "text-muted-foreground hover:bg-surface-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "team" && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hỏi bất cứ điều gì về công việc của bạn…"
              className="min-h-20 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-end">
              <Button
                size="icon"
                variant="ai"
                className="h-11 w-11 rounded-xl"
                aria-label="Gửi câu hỏi"
                disabled={ask.isPending || !query.trim()}
                onClick={() => send(query)}
              >
                {ask.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS[tab].map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground shadow-card transition-colors active:bg-surface-2"
              >
                {p}
              </button>
            ))}
          </div>

          {ask.isPending && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
              UNI đang đọc dữ liệu công việc của bạn…
            </div>
          )}
          {answer && !ask.isPending && (
            <article className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
              {answer}
            </article>
          )}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Đội ngũ AI</h2>
          <Link to="/m/ai-workforce" className="text-xs text-primary">
            Xem tất cả
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {AI_WORKER_PROFILES.slice(0, tab === "team" ? AI_WORKER_PROFILES.length : 4).map((w) => (
            <li key={w.id}>
              <Link
                to="/m/ai-workforce/$id"
                params={{ id: w.id }}
                className="flex h-full min-h-28 flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-card active:bg-surface"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
                <span className="truncate text-xs font-semibold">{w.name}</span>
                <span className="line-clamp-2 text-[11px] text-muted-foreground">{w.domain}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-[11px] text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Sẵn sàng
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Kết quả công việc gần đây</h2>
          <Link to="/m/work-products" className="text-xs text-primary">
            Xem tất cả
          </Link>
        </div>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Chưa có kết quả công việc nào.</p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              onClick={() => navigate({ to: "/m/work-products" })}
            >
              Mở Kết quả công việc
            </Button>
          </div>
        ) : (
          <ul className="grid gap-2">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  to="/m/work-products/$id"
                  params={{ id: p.id }}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-3 active:bg-surface-2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.business_type} · v{p.current_version ?? 1}
                    </span>
                  </span>
                  {p.ai_generated && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      AI
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
