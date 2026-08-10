import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type { Key } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Sparkles,
  Users as UsersIcon,
  BarChart3,
  FileText,
  Database,
  FileSpreadsheet,
  ListChecks,
  TrendingUp,
  Lightbulb,
  Mail,
  Calendar,
  Languages,
  PenLine,
  Grid3x3,
  Paperclip,
  Send,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Search,
  BookOpen,
  Folder,
  Globe,
  Link as LinkIcon,
  Upload,
  Star,
  Wrench,
  Image as ImageIcon,
  Code2,
  Table2,
  Zap,
  Settings,
  ChevronRight,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import {
  listAiConversations,
  getAiConversation,
  sendAiMessage,
  deleteAiConversation,
} from "@/lib/api/ai-chat.functions";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Assistant · UNIWORK" },
      { name: "description", content: "Trợ lý AI thông minh giúp tăng năng suất trên UNIWORK." },
    ],
  }),
  component: AIPage,
});

type Msg = { id: string; role: "user" | "assistant"; text: string; time: string; rich?: boolean };

const TABS = ["chat", "assistants", "prompts", "knowledge", "tools", "usage"] as const;
type Tab = (typeof TABS)[number];

const suggestions = [
  { k: "meeting", icon: FileSpreadsheet, color: "bg-emerald-500/20 text-emerald-300" },
  { k: "status", icon: ListChecks, color: "bg-sky-500/20 text-sky-300" },
  { k: "report", icon: TrendingUp, color: "bg-violet-500/20 text-violet-300" },
  { k: "idea", icon: Lightbulb, color: "bg-amber-500/20 text-amber-300" },
] as const;

const assistants = [
  { k: "meeting", icon: UsersIcon, color: "bg-violet-500/20 text-violet-300" },
  { k: "project", icon: BarChart3, color: "bg-emerald-500/20 text-emerald-300" },
  { k: "doc", icon: FileText, color: "bg-sky-500/20 text-sky-300" },
  { k: "data", icon: Database, color: "bg-orange-500/20 text-orange-300" },
] as const;

const prompts = [
  { k: "summary", icon: FileText },
  { k: "email", icon: Mail },
  { k: "report", icon: BarChart3 },
  { k: "plan", icon: Calendar },
] as const;

function shortTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("vi-VN");
}

const commands = [
  { cmd: "/summary", desc: "Tóm tắt nội dung", icon: Sparkles },
  { cmd: "/translate", desc: "Dịch ngôn ngữ", icon: Languages },
  { cmd: "/draft", desc: "Soạn thảo văn bản", icon: PenLine },
  { cmd: "/analysis", desc: "Phân tích dữ liệu", icon: BarChart3 },
] as const;

function AIPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const listFn = useServerFn(listAiConversations);
  const getFn = useServerFn(getAiConversation);
  const sendFn = useServerFn(sendAiMessage);
  const deleteFn = useServerFn(deleteAiConversation);

  const convList = useQuery({
    queryKey: ["ai-conversations", workspaceId, debouncedSearch, dateFrom, dateTo],
    queryFn: () =>
      listFn({
        data: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
          ...(dateFrom ? { from: dateFrom } : {}),
          ...(dateTo ? { to: dateTo } : {}),
        },
      }),
  });

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const messagesQuery = useQuery({
    queryKey: ["ai-messages", conversationId],
    queryFn: () => getFn({ data: { conversationId: conversationId as string } }),
    enabled: !!conversationId,
  });

  const msgs: Msg[] = (messagesQuery.data ?? [])
    .filter((m) => m.role !== "system")
    .map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.content,
      time: shortTime(m.createdAt),
    }));

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      sendFn({
        data: {
          text,
          ...(conversationId ? { conversationId } : {}),
          ...(workspaceId && !conversationId ? { workspaceId } : {}),
        },
      }),
    onSuccess: async (res) => {
      setPending(null);
      setConversationId(res.conversationId);
      await qc.invalidateQueries({ queryKey: ["ai-messages", res.conversationId] });
      await qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
    onError: (e: unknown) => {
      setPending(null);
      toast.error(e instanceof Error ? e.message : "Không gửi được yêu cầu tới AI");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { conversationId: id } }),
    onSuccess: async (_r, id) => {
      if (id === conversationId) setConversationId(null);
      toast.success("Đã xóa hội thoại");
      await qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, pending]);

  const send = (text?: string) => {
    const v = (text ?? input).trim();
    if (!v || sendMutation.isPending) return;
    setPending(v);
    setInput("");
    sendMutation.mutate(v);
  };

  const newChat = () => {
    setConversationId(null);
    setPending(null);
    setInput("");
  };

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="ai" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          variant="documents"
          onOpenSidebar={() => setOpen(true)}
          onNew={newChat}
        />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{t("ai.title")}</h1>
                  <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t("ai.beta")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("ai.sub")}</p>
              </div>
              <button
                onClick={newChat}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> {t("ai.new")}
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex flex-wrap gap-1 border-b border-border px-6">
              {TABS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`ai.tab.${k}` as Key)}
                  {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                </button>
              ))}
            </div>

            {/* Chat scroll area */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {tab !== "chat" ? (
                <TabPanel tab={tab} />
              ) : msgs.length === 0 && !pending ? (
                <Empty t={t} onPick={(text) => send(text)} />
              ) : (
                <>
                  <div className="mx-auto mb-6 max-w-3xl text-center">
                    <h2 className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-sky-300 bg-clip-text text-3xl font-bold text-transparent">
                      {t("ai.hello")} Nguyễn Văn A! 👋
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("ai.how")}</p>
                  </div>

                  <div className="mx-auto mb-6 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {suggestions.map((s) => (
                      <button
                        key={s.k}
                        onClick={() => send(t(`ai.sg.${s.k}.d` as Key))}
                        className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
                      >
                        <div
                          className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${s.color}`}
                        >
                          <s.icon className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-semibold">{t(`ai.sg.${s.k}.t` as Key)}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {t(`ai.sg.${s.k}.d` as Key)}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mx-auto max-w-5xl space-y-4">
                    {msgs.map((m) =>
                      m.role === "user" ? (
                        <UserBubble key={m.id} m={m} t={t} />
                      ) : (
                        <AssistantBubble key={m.id} m={m} t={t} />
                      ),
                    )}
                    {pending && (
                      <>
                        <UserBubble
                          m={{ id: "pending-u", role: "user", text: pending, time: "" }}
                          t={t}
                        />
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          AI đang soạn câu trả lời…
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
              <div className="mx-auto max-w-5xl">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <button className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())
                    }
                    placeholder={t("ai.input")}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button
                    onClick={() => send()}
                    disabled={sendMutation.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {commands.map((c) => (
                    <button
                      key={c.cmd}
                      onClick={() => setInput(c.cmd + " ")}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-xs hover:border-primary/40"
                    >
                      <c.icon className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <div className="font-medium">{c.cmd}</div>
                        <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                      </div>
                    </button>
                  ))}
                  <button className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
                    <Grid3x3 className="h-3.5 w-3.5" /> {t("ai.cmd.more")}
                  </button>
                </div>

                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {t("ai.disclaimer")}
                </p>
              </div>
            </div>
          </main>

          {/* Right panel */}
          <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
            <Section title={t("ai.panel.assistants")} action={t("ai.panel.viewall")}>
              <div className="space-y-2">
                {assistants.map((a) => (
                  <button
                    key={a.k}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.color}`}
                    >
                      <a.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t(`ai.bot.${a.k}.t` as Key)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {t(`ai.bot.${a.k}.d` as Key)}
                      </div>
                    </div>
                  </button>
                ))}
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10">
                  <Plus className="h-4 w-4" /> {t("ai.panel.create")}
                </button>
              </div>
            </Section>

            <Section title={t("ai.panel.prompts")} action={t("ai.panel.viewall")}>
              <div className="space-y-2">
                {prompts.map((p) => (
                  <button
                    key={p.k}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-primary">
                      <p.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t(`ai.pr.${p.k}.t` as Key)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {t(`ai.pr.${p.k}.d` as Key)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={t("ai.panel.recent")} action={t("ai.panel.viewall")}>
              <div className="mb-2 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo tiêu đề hội thoại"
                    className="w-full rounded-lg border border-border bg-surface-2 py-1.5 pl-7 pr-7 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Xóa từ khóa"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                    Từ ngày
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                    Đến ngày
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
                    />
                  </label>
                </div>
                {(search || dateFrom || dateTo || workspaceId) && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setDateFrom("");
                      setDateTo("");
                      setWorkspaceId("");
                    }}
                    className="w-full rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
              {(convList.data?.workspaces.length ?? 0) > 0 && (
                <select
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    setConversationId(null);
                  }}
                  className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs"
                >
                  <option value="">Tất cả workspace</option>
                  {convList.data?.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="space-y-1">
                {(convList.data?.conversations.length ?? 0) === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    {search || dateFrom || dateTo || workspaceId
                      ? "Không có hội thoại phù hợp bộ lọc."
                      : "Chưa có hội thoại nào."}
                  </p>
                )}
                {convList.data?.conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2 ${
                      c.id === conversationId ? "bg-surface-2" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        setConversationId(c.id);
                        setPending(null);
                        setTab("chat");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs">{c.title}</span>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                        {shortTime(c.lastMessageAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      aria-label="Xóa hội thoại"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Empty({ t, onPick }: { t: (k: Key) => string; onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
      <Sparkles className="h-10 w-10 text-primary" />
      <h2 className="mt-3 text-2xl font-bold">{t("ai.how")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("ai.sub")}</p>
      <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.k}
            onClick={() => onPick(t(`ai.sg.${s.k}.d`))}
            className="rounded-xl border border-border bg-surface p-4 text-left hover:border-primary/40"
          >
            <div className="text-sm font-semibold">{t(`ai.sg.${s.k}.t`)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t(`ai.sg.${s.k}.d`)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ m, t }: { m: Msg; t: (k: Key) => string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <img src={avatar("nguyen-van-a-1")} className="h-7 w-7 rounded-full object-cover" alt="" />
        <span className="text-sm font-medium">{t("ai.you")}</span>
        <span className="text-[11px] text-muted-foreground">{m.time}</span>
      </div>
      <p className="text-sm">{m.text}</p>
    </div>
  );
}

function AssistantBubble({ m, t }: { m: Msg; t: (k: Key) => string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium">{t("ai.assistant")}</span>
        <span className="text-[11px] text-muted-foreground">{m.time}</span>
      </div>

      {m.rich ? <RichSummary t={t} /> : <p className="text-sm">{m.text}</p>}

      <div className="mt-3 flex items-center gap-1 text-muted-foreground">
        {[Copy, ThumbsUp, ThumbsDown, RotateCw].map((Icon, i) => (
          <button key={i} className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

function RichSummary({ t }: { t: (k: Key) => string }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{t("ai.reply.intro")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card icon={<Info className="h-4 w-4 text-sky-300" />} title={t("ai.reply.info")}>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              Dự án: <span className="text-foreground">STOS Platform</span>
            </li>
            <li>
              Thời gian: <span className="text-foreground">09:00 – 09:30, 18/05/2025</span>
            </li>
            <li>
              Người tham gia: <span className="text-foreground">8 thành viên</span>
            </li>
          </ul>
        </Card>
        <Card
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}
          title={t("ai.reply.key")}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Đã hoàn thành 15/25 task trong sprint (60%)</li>
            <li>API Gateway: Đã hoàn thiện và test xong</li>
            <li>UI Dashboard: Hoàn thành 80%</li>
            <li>Mobile App: Đang tích hợp API</li>
          </ul>
        </Card>
        <Card
          icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
          title={t("ai.reply.issue")}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Mobile App bị delay do API thay đổi</li>
            <li>Thiếu 2 thành viên FE trong 2 ngày tới</li>
            <li>Cần review lại hiệu năng dashboard</li>
          </ul>
        </Card>
      </div>
      <Card icon={<Sparkles className="h-4 w-4 text-violet-300" />} title={t("ai.reply.next")}>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>✓ Hoàn thiện UI Dashboard trước 20/05</li>
          <li>✓ Fix các issue API cho Mobile App</li>
          <li>✓ Review hiệu năng và tối ưu database</li>
        </ul>
      </Card>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-4 last:border-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action && <button className="text-xs text-primary hover:underline">{action}</button>}
      </div>
      {children}
    </div>
  );
}

/* =================== Tab Panels =================== */

function TabPanel({ tab }: { tab: Tab }) {
  if (tab === "assistants") return <AssistantsPanel />;
  if (tab === "prompts") return <PromptsPanel />;
  if (tab === "knowledge") return <KnowledgePanel />;
  if (tab === "tools") return <ToolsPanel />;
  if (tab === "usage") return <UsageTabPanel />;
  return null;
}

function UsageTabPanel() {
  return <AiUsageStatsPanel />;
}

const ALL_ASSISTANTS = [
  {
    icon: UsersIcon,
    color: "bg-violet-500/20 text-violet-300",
    title: "Trợ lý cuộc họp",
    desc: "Tóm tắt cuộc họp và trích xuất action items",
    tag: "Cuộc họp",
    uses: 128,
    fav: true,
  },
  {
    icon: BarChart3,
    color: "bg-emerald-500/20 text-emerald-300",
    title: "Phân tích dự án",
    desc: "Phân tích tiến độ và hiệu suất dự án",
    tag: "Dự án",
    uses: 96,
    fav: true,
  },
  {
    icon: FileText,
    color: "bg-sky-500/20 text-sky-300",
    title: "Hỗ trợ tài liệu",
    desc: "Hỗ trợ tìm kiếm và phân tích tài liệu",
    tag: "Tài liệu",
    uses: 74,
    fav: false,
  },
  {
    icon: Database,
    color: "bg-orange-500/20 text-orange-300",
    title: "Phân tích dữ liệu",
    desc: "Phân tích dữ liệu và tạo báo cáo",
    tag: "Dữ liệu",
    uses: 52,
    fav: false,
  },
  {
    icon: Mail,
    color: "bg-pink-500/20 text-pink-300",
    title: "Trợ lý email",
    desc: "Soạn thảo và phản hồi email chuyên nghiệp",
    tag: "Giao tiếp",
    uses: 41,
    fav: false,
  },
  {
    icon: Calendar,
    color: "bg-amber-500/20 text-amber-300",
    title: "Lập lịch thông minh",
    desc: "Sắp xếp lịch họp tối ưu cho cả nhóm",
    tag: "Lịch",
    uses: 38,
    fav: false,
  },
  {
    icon: Languages,
    color: "bg-cyan-500/20 text-cyan-300",
    title: "Dịch đa ngôn ngữ",
    desc: "Dịch tài liệu và hội thoại theo ngữ cảnh",
    tag: "Ngôn ngữ",
    uses: 33,
    fav: false,
  },
  {
    icon: ListChecks,
    color: "bg-lime-500/20 text-lime-300",
    title: "Quản lý công việc",
    desc: "Tạo và phân bổ task tự động cho dự án",
    tag: "Công việc",
    uses: 27,
    fav: false,
  },
];

function AssistantsPanel() {
  const [q, setQ] = useState("");
  const items = ALL_ASSISTANTS.filter((a) =>
    [a.title, a.desc, a.tag].join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-6xl">
      <PanelHeader
        title="Thư viện trợ lý AI"
        subtitle="Chọn trợ lý chuyên biệt cho từng tác vụ hoặc tạo trợ lý tuỳ chỉnh của riêng bạn."
        action={{ icon: Plus, label: "Tạo trợ lý mới" }}
        search={{ value: q, onChange: setQ, placeholder: "Tìm trợ lý theo tên, mô tả…" }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <div
            key={a.title}
            className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.color}`}>
                <a.icon className="h-5 w-5" />
              </div>
              <button
                className={`rounded p-1.5 ${a.fav ? "text-amber-300" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Star className={`h-4 w-4 ${a.fav ? "fill-current" : ""}`} />
              </button>
            </div>
            <div className="mt-3 text-sm font-semibold">{a.title}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.desc}</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="rounded-md bg-surface-2 px-2 py-0.5">{a.tag}</span>
              <span>{a.uses} lượt dùng</span>
            </div>
            <button className="mt-3 w-full rounded-lg border border-border bg-surface-2 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary">
              Bắt đầu trò chuyện
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const PROMPT_CATEGORIES = [
  "Tất cả",
  "Cuộc họp",
  "Báo cáo",
  "Email",
  "Kế hoạch",
  "Phân tích",
] as const;
const ALL_PROMPTS = [
  {
    cat: "Cuộc họp",
    icon: FileText,
    title: "Tóm tắt biên bản họp",
    body: "Tóm tắt nội dung cuộc họp thành 3 phần: quyết định, hành động, người phụ trách.",
  },
  {
    cat: "Báo cáo",
    icon: BarChart3,
    title: "Phân tích doanh thu",
    body: "Phân tích doanh thu theo tháng, so sánh YoY và đề xuất hành động.",
  },
  {
    cat: "Email",
    icon: Mail,
    title: "Email theo dõi khách hàng",
    body: "Soạn email follow-up lịch sự sau cuộc gọi tư vấn.",
  },
  {
    cat: "Kế hoạch",
    icon: Calendar,
    title: "Lập kế hoạch sprint",
    body: "Tạo kế hoạch 2 tuần dựa trên backlog và năng lực team.",
  },
  {
    cat: "Phân tích",
    icon: TrendingUp,
    title: "Phân tích SWOT dự án",
    body: "Liệt kê điểm mạnh, yếu, cơ hội, rủi ro của dự án X.",
  },
  {
    cat: "Email",
    icon: PenLine,
    title: "Soạn thư mời họp",
    body: "Viết thư mời họp ngắn gọn kèm agenda 3 mục.",
  },
  {
    cat: "Cuộc họp",
    icon: ListChecks,
    title: "Trích xuất action items",
    body: "Liệt kê toàn bộ action item kèm deadline từ transcript.",
  },
  {
    cat: "Phân tích",
    icon: Database,
    title: "Đọc hiểu dữ liệu CSV",
    body: "Mô tả schema, phát hiện outlier, đề xuất biểu đồ phù hợp.",
  },
];

function PromptsPanel() {
  const [cat, setCat] = useState<string>("Tất cả");
  const [q, setQ] = useState("");
  const items = ALL_PROMPTS.filter(
    (p) =>
      (cat === "Tất cả" || p.cat === cat) &&
      [p.title, p.body, p.cat].join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-6xl">
      <PanelHeader
        title="Thư viện lời nhắc"
        subtitle="Các mẫu prompt được tối ưu cho công việc thường ngày."
        action={{ icon: Plus, label: "Tạo lời nhắc" }}
        search={{ value: q, onChange: setQ, placeholder: "Tìm lời nhắc…" }}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {PROMPT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              cat === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <p.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-semibold">{p.title}</h4>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {p.cat}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.body}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    Dùng ngay
                  </button>
                  <button className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:border-primary/40">
                    Sao chép
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const KNOWLEDGE_SOURCES = [
  {
    icon: Folder,
    color: "bg-sky-500/20 text-sky-300",
    title: "Tài liệu nội bộ",
    desc: "248 tài liệu · Đồng bộ 5 phút trước",
    status: "Hoạt động",
  },
  {
    icon: BookOpen,
    color: "bg-violet-500/20 text-violet-300",
    title: "Wiki sản phẩm",
    desc: "86 bài viết · Đồng bộ hôm nay",
    status: "Hoạt động",
  },
  {
    icon: Database,
    color: "bg-emerald-500/20 text-emerald-300",
    title: "Cơ sở dữ liệu CRM",
    desc: "12,540 bản ghi",
    status: "Hoạt động",
  },
  {
    icon: Globe,
    color: "bg-amber-500/20 text-amber-300",
    title: "Website công ty",
    desc: "Crawl tự động hàng tuần",
    status: "Đang đồng bộ",
  },
  {
    icon: LinkIcon,
    color: "bg-pink-500/20 text-pink-300",
    title: "Liên kết Google Drive",
    desc: "3 thư mục được chia sẻ",
    status: "Cần xác thực lại",
  },
];

function KnowledgePanel() {
  return (
    <div className="mx-auto max-w-6xl">
      <PanelHeader
        title="Kho tri thức của AI"
        subtitle="Quản lý các nguồn dữ liệu mà trợ lý AI có thể truy cập và trích dẫn."
        action={{ icon: Upload, label: "Tải tài liệu" }}
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Tổng tài liệu", value: "1,284", icon: FileText, color: "text-sky-300" },
          { label: "Đang lập chỉ mục", value: "23", icon: Zap, color: "text-amber-300" },
          {
            label: "Dung lượng đã dùng",
            value: "4.2 / 10 GB",
            icon: Database,
            color: "text-emerald-300",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="mt-2 text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nguồn dữ liệu đã kết nối</h3>
        <button className="text-xs text-primary hover:underline">+ Thêm nguồn</button>
      </div>
      <div className="space-y-2">
        {KNOWLEDGE_SOURCES.map((k) => (
          <div
            key={k.title}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${k.color}`}>
              <k.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{k.title}</div>
              <div className="truncate text-xs text-muted-foreground">{k.desc}</div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                k.status === "Hoạt động"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : k.status === "Đang đồng bộ"
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {k.status}
            </span>
            <button className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOOLS = [
  {
    icon: Search,
    color: "bg-sky-500/20 text-sky-300",
    title: "Tìm kiếm web",
    desc: "Tra cứu thông tin trên Internet",
    on: true,
  },
  {
    icon: ImageIcon,
    color: "bg-violet-500/20 text-violet-300",
    title: "Sinh hình ảnh",
    desc: "Tạo ảnh minh hoạ từ mô tả",
    on: true,
  },
  {
    icon: Code2,
    color: "bg-emerald-500/20 text-emerald-300",
    title: "Thực thi mã",
    desc: "Chạy snippet Python / JS để phân tích",
    on: true,
  },
  {
    icon: Table2,
    color: "bg-amber-500/20 text-amber-300",
    title: "Bảng tính & CSV",
    desc: "Đọc, phân tích và biểu đồ hoá dữ liệu",
    on: true,
  },
  {
    icon: Calendar,
    color: "bg-pink-500/20 text-pink-300",
    title: "Lịch & Họp",
    desc: "Đọc lịch, tạo cuộc họp Google Meet",
    on: false,
  },
  {
    icon: Mail,
    color: "bg-cyan-500/20 text-cyan-300",
    title: "Gửi email",
    desc: "Soạn và gửi email qua Outlook / Gmail",
    on: false,
  },
  {
    icon: Database,
    color: "bg-orange-500/20 text-orange-300",
    title: "Truy vấn database",
    desc: "Đọc dữ liệu trực tiếp từ DWH",
    on: false,
  },
  {
    icon: Wrench,
    color: "bg-lime-500/20 text-lime-300",
    title: "Tạo phiếu task",
    desc: "Tự động tạo task trong Jira / Tasks",
    on: true,
  },
];

function ToolsPanel() {
  const [tools, setTools] = useState(TOOLS);
  const toggle = (i: number) =>
    setTools((arr) => arr.map((t, idx) => (idx === i ? { ...t, on: !t.on } : t)));
  return (
    <div className="mx-auto max-w-6xl">
      <PanelHeader
        title="Công cụ của AI"
        subtitle="Bật/tắt các công cụ mà trợ lý có thể sử dụng khi xử lý yêu cầu."
        action={{ icon: Settings, label: "Cấu hình nâng cao" }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tl, i) => (
          <div
            key={tl.title}
            className="rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tl.color}`}>
                <tl.icon className="h-5 w-5" />
              </div>
              <button
                onClick={() => toggle(i)}
                className={`relative h-5 w-9 rounded-full transition-colors ${tl.on ? "bg-primary" : "bg-surface-2"}`}
                aria-label="toggle"
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    tl.on ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 text-sm font-semibold">{tl.title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{tl.desc}</p>
            <div className="mt-3 text-[11px] font-medium">
              <span className={tl.on ? "text-emerald-300" : "text-muted-foreground"}>
                {tl.on ? "● Đang bật" : "○ Đang tắt"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  action,
  search,
}: {
  title: string;
  subtitle: string;
  action?: { icon: LucideIcon; label: string };
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action && (
          <button className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        )}
      </div>
      {search && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
