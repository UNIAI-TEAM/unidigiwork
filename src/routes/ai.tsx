import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Sparkles, Users as UsersIcon, BarChart3, FileText, Database,
  FileSpreadsheet, ListChecks, TrendingUp, Lightbulb, Mail, Calendar,
  Languages, PenLine, Grid3x3, Paperclip, Send, Copy, ThumbsUp, ThumbsDown,
  RotateCw, Clock, CheckCircle2, AlertTriangle, Info,
  Search, BookOpen, Folder, Globe, Link as LinkIcon, Upload, Star,
  Wrench, Image as ImageIcon, Code2, Table2, Zap, Settings, ChevronRight,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

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

const TABS = ["chat", "assistants", "prompts", "knowledge", "tools"] as const;
type Tab = typeof TABS[number];

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

const recentChats = [
  { title: "Tóm tắt cuộc họp Sprint 6", time: "10:30 AM" },
  { title: "Phân tích báo cáo doanh thu Q2", time: "09:15 AM" },
  { title: "Kế hoạch marketing tháng 6", time: "Yesterday" },
  { title: "Review tài liệu PRD – STOS Mobile App", time: "Yesterday" },
  { title: "So sánh hiệu suất các dự án", time: "16/05/2025" },
];

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
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: "m1", role: "user", text: "Tóm tắt cuộc họp Sprint 6 Daily Standup hôm nay", time: "10:30 AM" },
    { id: "m2", role: "assistant", text: "", time: "10:30 AM", rich: true },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = (text?: string) => {
    const v = (text ?? input).trim();
    if (!v) return;
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    setMsgs((m) => [
      ...m,
      { id: `u${m.length}`, role: "user", text: v, time: now },
      { id: `a${m.length + 1}`, role: "assistant", text: "Tôi đang xử lý yêu cầu của bạn…", time: now },
    ]);
    setInput("");
  };

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="ai" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} onNew={() => setMsgs([])} />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{t("ai.title")}</h1>
                  <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary">{t("ai.beta")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("ai.sub")}</p>
              </div>
              <button onClick={() => setMsgs([])} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
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
                  {t(`ai.tab.${k}` as any)}
                  {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                </button>
              ))}
            </div>

            {/* Chat scroll area */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {msgs.length === 0 ? (
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
                        onClick={() => send(t(`ai.sg.${s.k}.d` as any))}
                        className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
                      >
                        <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${s.color}`}>
                          <s.icon className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-semibold">{t(`ai.sg.${s.k}.t` as any)}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t(`ai.sg.${s.k}.d` as any)}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mx-auto max-w-5xl space-y-4">
                    {msgs.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} t={t} /> : <AssistantBubble key={m.id} m={m} t={t} />))}
                  </div>
                </>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
              <div className="mx-auto max-w-5xl">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <button className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"><Paperclip className="h-4 w-4" /></button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                    placeholder={t("ai.input")}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button onClick={() => send()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><Send className="h-4 w-4" /></button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {commands.map((c) => (
                    <button key={c.cmd} onClick={() => setInput(c.cmd + " ")} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-xs hover:border-primary/40">
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

                <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("ai.disclaimer")}</p>
              </div>
            </div>
          </main>

          {/* Right panel */}
          <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
            <Section title={t("ai.panel.assistants")} action={t("ai.panel.viewall")}>
              <div className="space-y-2">
                {assistants.map((a) => (
                  <button key={a.k} className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.color}`}>
                      <a.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t(`ai.bot.${a.k}.t` as any)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{t(`ai.bot.${a.k}.d` as any)}</div>
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
                  <button key={p.k} className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-primary">
                      <p.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t(`ai.pr.${p.k}.t` as any)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{t(`ai.pr.${p.k}.d` as any)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={t("ai.panel.recent")} action={t("ai.panel.viewall")}>
              <div className="space-y-1">
                {recentChats.map((c) => (
                  <button key={c.title} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs">{c.title}</span>
                    <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">{c.time}</span>
                  </button>
                ))}
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Empty({ t, onPick }: { t: (k: any) => string; onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
      <Sparkles className="h-10 w-10 text-primary" />
      <h2 className="mt-3 text-2xl font-bold">{t("ai.how")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("ai.sub")}</p>
      <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button key={s.k} onClick={() => onPick(t(`ai.sg.${s.k}.d`))} className="rounded-xl border border-border bg-surface p-4 text-left hover:border-primary/40">
            <div className="text-sm font-semibold">{t(`ai.sg.${s.k}.t`)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t(`ai.sg.${s.k}.d`)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ m, t }: { m: Msg; t: (k: any) => string }) {
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

function AssistantBubble({ m, t }: { m: Msg; t: (k: any) => string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium">{t("ai.assistant")}</span>
        <span className="text-[11px] text-muted-foreground">{m.time}</span>
      </div>

      {m.rich ? (
        <RichSummary t={t} />
      ) : (
        <p className="text-sm">{m.text}</p>
      )}

      <div className="mt-3 flex items-center gap-1 text-muted-foreground">
        {[Copy, ThumbsUp, ThumbsDown, RotateCw].map((Icon, i) => (
          <button key={i} className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><Icon className="h-3.5 w-3.5" /></button>
        ))}
      </div>
    </div>
  );
}

function RichSummary({ t }: { t: (k: any) => string }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{t("ai.reply.intro")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card icon={<Info className="h-4 w-4 text-sky-300" />} title={t("ai.reply.info")}>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Dự án: <span className="text-foreground">STOS Platform</span></li>
            <li>Thời gian: <span className="text-foreground">09:00 – 09:30, 18/05/2025</span></li>
            <li>Người tham gia: <span className="text-foreground">8 thành viên</span></li>
          </ul>
        </Card>
        <Card icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} title={t("ai.reply.key")}>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Đã hoàn thành 15/25 task trong sprint (60%)</li>
            <li>API Gateway: Đã hoàn thiện và test xong</li>
            <li>UI Dashboard: Hoàn thành 80%</li>
            <li>Mobile App: Đang tích hợp API</li>
          </ul>
        </Card>
        <Card icon={<AlertTriangle className="h-4 w-4 text-amber-300" />} title={t("ai.reply.issue")}>
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

function Card({ icon, title, children }: { icon: any; title: string; children: any }) {
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

function Section({ title, action, children }: { title: string; action?: string; children: any }) {
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