import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Filter, Star, Hash, Users, Paperclip, Search as SearchIcon,
  MoreHorizontal, Pin, X, Smile, AtSign, Type, Image as ImageIcon, Code2,
  Smile as SmileIcon, Mic, Send, Sparkles, FileText, FileSpreadsheet,
  ChevronDown, Circle, MessageCircle, Bot,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat · UNIWORK" },
      { name: "description", content: "Kênh chat nhóm và tin nhắn trực tiếp tích hợp AI Copilot trên UNIWORK." },
    ],
  }),
  component: ChatPage,
});

type Channel = { name: string; unread?: number; live?: boolean; favorite?: boolean };
type DM = { name: string; seed: string; online?: "online" | "away" | "offline" };
type Reaction = { emoji: string; count: number };
type Msg = {
  id: string;
  author: string;
  seed: string;
  role?: string;
  roleColor?: string;
  time: string;
  body?: React.ReactNode;
  reactions?: Reaction[];
};

const favorites: Channel[] = [
  { name: "sprint-6", favorite: true, unread: 0 },
  { name: "devops-alerts" },
  { name: "announcements", unread: 2 },
  { name: "design-system" },
];

const channels: Channel[] = [
  { name: "general" },
  { name: "random" },
  { name: "sales-updates" },
  { name: "hr-policies" },
];

const dms: DM[] = [
  { name: "Trần Thị B", seed: "tran-thi-b", online: "online" },
  { name: "Phạm Minh C", seed: "pham-minh-c", online: "online" },
  { name: "Lê Hoàng D", seed: "le-hoang-d", online: "away" },
  { name: "Hoàng Nam", seed: "hoang-nam", online: "offline" },
];

const initialMessages: Msg[] = [
  {
    id: "m1",
    author: "Nguyễn Văn A",
    seed: "nguyen-van-a-1",
    role: "CEO",
    roleColor: "bg-primary/20 text-primary",
    time: "9:02 AM",
    body: (
      <>
        <p>Chào team! Hôm nay chúng ta tập trung hoàn thành các task của Sprint 6.</p>
        <p>Mọi người cập nhật tiến độ nhé!</p>
      </>
    ),
    reactions: [{ emoji: "👍", count: 8 }, { emoji: "🎉", count: 4 }],
  },
  {
    id: "m2",
    author: "Trần Thị B",
    seed: "tran-thi-b",
    role: "PM",
    roleColor: "bg-amber-500/20 text-amber-400",
    time: "9:05 AM",
    body: (
      <>
        <p>API Gateway đã hoàn thành 90%.</p>
        <p>Đang review và chuẩn bị deploy staging.</p>
      </>
    ),
    reactions: [{ emoji: "🚀", count: 6 }],
  },
  {
    id: "m3",
    author: "Phạm Minh C",
    seed: "pham-minh-c",
    role: "Dev",
    roleColor: "bg-success/20 text-success",
    time: "9:08 AM",
    body: (
      <>
        <p>UI Dashboard còn 2 task quan trọng:</p>
        <ul className="list-disc pl-5">
          <li>Chart component</li>
          <li>Data table optimization</li>
        </ul>
        <p>Dự kiến xong trong hôm nay.</p>
      </>
    ),
    reactions: [{ emoji: "👍", count: 5 }],
  },
  {
    id: "m4",
    author: "Lê Hoàng D",
    seed: "le-hoang-d",
    role: "QA",
    roleColor: "bg-rose-500/20 text-rose-400",
    time: "9:10 AM",
    body: (
      <>
        <p>Đã test xong Mobile App version 2.1. Có 3 bug minor.</p>
        <p>
          Đã tạo ticket trên Jira:{" "}
          <a className="text-primary hover:underline" href="#">STOS-128</a>,{" "}
          <a className="text-primary hover:underline" href="#">STOS-129</a>,{" "}
          <a className="text-primary hover:underline" href="#">STOS-130</a>
        </p>
      </>
    ),
    reactions: [{ emoji: "✅", count: 4 }],
  },
];

const suggestedActions = [
  { who: "Phạm Minh C", task: "Hoàn thiện UI Dashboard", when: "Today", color: "bg-success" },
  { who: "Lê Hoàng D", task: "Re-test sau khi fix bug", when: "Tomorrow", color: "bg-rose-500" },
  { who: "Trần Thị B", task: "Deploy API Gateway Staging", when: "Today", color: "bg-amber-500" },
];

const importantThreads = [
  { id: "STOS-123", title: "API Gateway Performance Issue", replies: 2, when: "1h ago", color: "bg-amber-500/20 text-amber-400" },
  { id: "UI", title: "UI/UX Design System Update", replies: 5, when: "3h ago", color: "bg-violet-500/20 text-violet-400" },
  { id: "MOB", title: "Mobile App Offline Sync Discussion", replies: 7, when: "1d ago", color: "bg-sky-500/20 text-sky-400" },
];

const sharedFiles = [
  { icon: FileText, name: "Sprint 6 Plan.pdf", meta: "PDF · 2.4 MB · Nguyễn Văn A", color: "text-rose-400" },
  { icon: FileText, name: "API_Gateway_Spec_v2.1.docx", meta: "DOCX · 1.1 MB · Trần Thị B", color: "text-sky-400" },
  { icon: FileSpreadsheet, name: "Dashboard_Design.fig", meta: "FIG · 8.7 MB · Phạm Minh C", color: "text-emerald-400" },
];

function ChannelRow({ ch, active, onClick }: { ch: Channel; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Hash className="h-4 w-4 opacity-70" />
      <span className="flex-1 truncate text-left">{ch.name}</span>
      {ch.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
      {ch.unread ? (
        <span className="rounded-full bg-destructive px-1.5 py-0 text-[10px] font-medium text-white">{ch.unread}</span>
      ) : null}
    </button>
  );
}

function DMRow({ dm }: { dm: DM }) {
  const dot =
    dm.online === "online" ? "bg-success" : dm.online === "away" ? "bg-amber-500" : "bg-muted-foreground/50";
  return (
    <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <span className="relative">
        <img src={avatar(dm.seed)} alt="" className="h-6 w-6 rounded-full object-cover" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-surface ${dot}`} />
      </span>
      <span className="flex-1 truncate text-left">{dm.name}</span>
    </button>
  );
}

function Message({ m }: { m: Msg }) {
  return (
    <div className="group flex gap-3 rounded-lg px-3 py-2 hover:bg-surface-2/40">
      <img src={avatar(m.seed)} className="h-9 w-9 shrink-0 rounded-full object-cover" alt="" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{m.author}</span>
          {m.role && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.roleColor}`}>{m.role}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{m.time}</span>
        </div>
        <div className="mt-1 space-y-1 text-sm leading-relaxed text-foreground/90">{m.body}</div>
        {m.reactions && m.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
            <button className="rounded-full border border-border bg-surface-2 p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground">
              <Smile className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPage() {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [activeChannel, setActiveChannel] = useState("sprint-6");
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [showCopilot, setShowCopilot] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `m${prev.length + 1}`,
        author: "Nguyễn Văn A",
        seed: "nguyen-van-a-1",
        role: "CEO",
        roleColor: "bg-primary/20 text-primary",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        body: <p>{text}</p>,
      },
    ]);
    setInput("");
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar active="chat" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="flex min-h-0 flex-1">
          {/* Channels column */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="flex items-center justify-between px-4 py-3.5">
              <h2 className="text-sm font-semibold">Channels</h2>
              <div className="flex items-center gap-1">
                <button className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Plus className="h-4 w-4" />
                </button>
                <button className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
              <div>
                <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <MessageCircle className="h-4 w-4" /> Threads
                </button>
                <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <AtSign className="h-4 w-4" /> Mentions
                </button>
                <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <FileText className="h-4 w-4" /> Drafts
                </button>
              </div>

              <div>
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Favorites
                </div>
                {favorites.map((c) => (
                  <ChannelRow key={c.name} ch={c} active={activeChannel === c.name} onClick={() => setActiveChannel(c.name)} />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Channels</span>
                  <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3 w-3" /></button>
                </div>
                {channels.map((c) => (
                  <ChannelRow key={c.name} ch={c} active={activeChannel === c.name} onClick={() => setActiveChannel(c.name)} />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Direct Messages</span>
                  <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3 w-3" /></button>
                </div>
                {dms.map((d) => <DMRow key={d.seed} dm={d} />)}
                <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" /> More
                </button>
              </div>
            </div>

            <div className="m-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="flex-1 text-sm">
                <div className="font-medium leading-tight">Mattermost</div>
                <div className="flex items-center gap-1 text-[11px] text-success">
                  <Circle className="h-1.5 w-1.5 fill-current" /> Connected
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </aside>

          {/* Main conversation */}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <h1 className="truncate text-lg font-semibold">{activeChannel}</h1>
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Sprint 6 - Development</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> 15 members</span>
                  <button className="hover:text-foreground">+ Add a channel description</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><Users className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><Paperclip className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><SearchIcon className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
              </div>
            </header>

            <div className="mx-5 mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm">
              <Pin className="mt-0.5 h-4 w-4 text-amber-400" />
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Pinned by Trần Thị B</div>
                <div>
                  <span className="font-medium">Daily Standup at 09:30 AM in LiveKit</span>{" "}
                  <Link to="/meeting" className="text-primary hover:underline">Join meeting</Link>
                </div>
              </div>
              <button className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
              <div className="my-3 flex items-center justify-center">
                <div className="rounded-full bg-surface-2 px-3 py-0.5 text-xs text-muted-foreground">Today</div>
              </div>
              {messages.map((m) => <Message key={m.id} m={m} />)}
            </div>

            {/* Composer */}
            <div className="px-5 pb-5">
              <div className="rounded-xl border border-border bg-surface-2/60 focus-within:border-primary/50">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message #${activeChannel}`}
                  className="w-full bg-transparent px-4 pt-3 text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><Paperclip className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><SmileIcon className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><AtSign className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><Type className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><ImageIcon className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><Code2 className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground"><Mic className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCopilot((v) => !v)}
                      className="hidden items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground md:flex"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> AI
                    </button>
                    <button
                      onClick={send}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AI Copilot */}
          {showCopilot && (
            <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface xl:flex">
              <header className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="font-semibold">AI Copilot</div>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BETA</span>
                </div>
                <button onClick={() => setShowCopilot(false)} className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex gap-1 border-b border-border px-3 text-sm">
                {["Assistant", "Highlights", "Tasks", "Files"].map((tab, i) => (
                  <button
                    key={tab}
                    className={`relative px-3 py-2 ${i === 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {tab}
                    {i === 0 && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" /> Channel Summary
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Sprint 6 đang tập trung hoàn thành API Gateway, UI Dashboard và Mobile App.
                    API Gateway 90% hoàn thành, UI còn 2 task, Mobile App đã test xong.
                  </p>
                  <button className="mt-3 w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20">
                    Generate detailed summary
                  </button>
                </section>

                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-amber-400" /> Suggested Actions
                  </div>
                  <ul className="space-y-2">
                    {suggestedActions.map((a) => (
                      <li key={a.task} className="flex items-start gap-2 text-xs">
                        <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${a.color}`} />
                        <div className="flex-1">
                          <div><span className="font-semibold">{a.who}</span> <span className="text-muted-foreground">- {a.task}</span></div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{a.when}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Create new task
                  </button>
                </section>

                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-sky-400" /> Important Threads</span>
                    <button className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  <ul className="space-y-2">
                    {importantThreads.map((th) => (
                      <li key={th.id} className="flex items-start gap-2 text-xs">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${th.color}`}>
                          <Hash className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{th.id}: {th.title}</div>
                          <div className="text-[10px] text-muted-foreground">{th.replies} replies · Updated {th.when}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-emerald-400" /> Shared Files</span>
                    <button className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  <ul className="space-y-2">
                    {sharedFiles.map((f) => (
                      <li key={f.name} className="flex items-start gap-2 text-xs">
                        <f.icon className={`mt-0.5 h-4 w-4 shrink-0 ${f.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground">{f.meta}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ask AI anything..."
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}