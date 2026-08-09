import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Filter,
  Star,
  Hash,
  Users,
  Paperclip,
  Search as SearchIcon,
  MoreHorizontal,
  Pin,
  X,
  Smile,
  AtSign,
  Type,
  Image as ImageIcon,
  Code2,
  Smile as SmileIcon,
  Mic,
  Send,
  Sparkles,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Circle,
  MessageCircle,
  Bot,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat · UNIWORK" },
      {
        name: "description",
        content: "Kênh chat nhóm và tin nhắn trực tiếp tích hợp AI Copilot trên UNIWORK.",
      },
    ],
  }),
  component: ChatPage,
});

type Channel = { name: string; unread?: number; live?: boolean; favorite?: boolean };
type DM = { name: string; seed: string; online?: "online" | "away" | "offline" };
type Reaction = { emoji: string; count: number };
type Msg = {
  id: string;
  channel: string;
  author: string;
  seed: string;
  role?: string;
  roleColor?: string;
  time: string;
  timestamp: number;
  text?: string;
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

const allChannelNames = [
  "sprint-6",
  "devops-alerts",
  "announcements",
  "design-system",
  "general",
  "random",
  "sales-updates",
  "hr-policies",
];

const dms: DM[] = [
  { name: "Trần Thị B", seed: "tran-thi-b", online: "online" },
  { name: "Phạm Minh C", seed: "pham-minh-c", online: "online" },
  { name: "Lê Hoàng D", seed: "le-hoang-d", online: "away" },
  { name: "Hoàng Nam", seed: "hoang-nam", online: "offline" },
];

function ts(h: number, m: number, offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  d.setSeconds(0, 0);
  return d.getTime();
}

const channelMessages: Record<string, Msg[]> = {
  "sprint-6": [
    {
      id: "m1",
      channel: "sprint-6",
      author: "Nguyễn Văn A",
      seed: "nguyen-van-a-1",
      role: "CEO",
      roleColor: "bg-primary/20 text-primary",
      time: "9:02 AM",
      timestamp: ts(9, 2),
      text: "Chào team! Hôm nay chúng ta tập trung hoàn thành các task của Sprint 6. Mọi người cập nhật tiến độ nhé!",
      body: (
        <>
          <p>Chào team! Hôm nay chúng ta tập trung hoàn thành các task của Sprint 6.</p>
          <p>Mọi người cập nhật tiến độ nhé!</p>
        </>
      ),
      reactions: [
        { emoji: "👍", count: 8 },
        { emoji: "🎉", count: 4 },
      ],
    },
    {
      id: "m2",
      channel: "sprint-6",
      author: "Trần Thị B",
      seed: "tran-thi-b",
      role: "PM",
      roleColor: "bg-amber-500/20 text-amber-400",
      time: "9:05 AM",
      timestamp: ts(9, 5),
      text: "API Gateway đã hoàn thành 90%. Đang review và chuẩn bị deploy staging.",
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
      channel: "sprint-6",
      author: "Phạm Minh C",
      seed: "pham-minh-c",
      role: "Dev",
      roleColor: "bg-success/20 text-success",
      time: "9:08 AM",
      timestamp: ts(9, 8),
      text: "UI Dashboard còn 2 task quan trọng: Chart component, Data table optimization. Dự kiến xong trong hôm nay.",
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
      channel: "sprint-6",
      author: "Lê Hoàng D",
      seed: "le-hoang-d",
      role: "QA",
      roleColor: "bg-rose-500/20 text-rose-400",
      time: "9:10 AM",
      timestamp: ts(9, 10),
      text: "Đã test xong Mobile App version 2.1. Có 3 bug minor. Đã tạo ticket trên Jira: STOS-128, STOS-129, STOS-130",
      body: (
        <>
          <p>Đã test xong Mobile App version 2.1. Có 3 bug minor.</p>
          <p>
            Đã tạo ticket trên Jira:{" "}
            <a className="text-primary hover:underline" href="#">
              STOS-128
            </a>
            ,{" "}
            <a className="text-primary hover:underline" href="#">
              STOS-129
            </a>
            ,{" "}
            <a className="text-primary hover:underline" href="#">
              STOS-130
            </a>
          </p>
        </>
      ),
      reactions: [{ emoji: "✅", count: 4 }],
    },
  ],
  general: [
    {
      id: "g1",
      channel: "general",
      author: "Nguyễn Văn A",
      seed: "nguyen-van-a-1",
      role: "CEO",
      roleColor: "bg-primary/20 text-primary",
      time: "8:30 AM",
      timestamp: ts(8, 30),
      text: "Chào buổi sáng cả nhà! Hôm nay có ai cần support gì không?",
      body: <p>Chào buổi sáng cả nhà! Hôm nay có ai cần support gì không?</p>,
    },
    {
      id: "g2",
      channel: "general",
      author: "Trần Thị B",
      seed: "tran-thi-b",
      role: "PM",
      roleColor: "bg-amber-500/20 text-amber-400",
      time: "8:35 AM",
      timestamp: ts(8, 35),
      text: "HR vừa gửi thông báo về chính sách nghỉ phép mới, mọi người check email nhé.",
      body: <p>HR vừa gửi thông báo về chính sách nghỉ phép mới, mọi người check email nhé.</p>,
    },
    {
      id: "g3",
      channel: "general",
      author: "Phạm Minh C",
      seed: "pham-minh-c",
      time: "8:40 AM",
      timestamp: ts(8, 40, -1),
      text: "Hôm qua server staging có downtime 15 phút. Đã restart và monitor.",
      body: <p>Hôm qua server staging có downtime 15 phút. Đã restart và monitor.</p>,
    },
  ],
  random: [
    {
      id: "r1",
      channel: "random",
      author: "Phạm Minh C",
      seed: "pham-minh-c",
      time: "10:15 AM",
      timestamp: ts(10, 15),
      text: "Cuối tuần này team có plan đi picnic không? 🌲",
      body: <p>Cuối tuần này team có plan đi picnic không? 🌲</p>,
    },
    {
      id: "r2",
      channel: "random",
      author: "Lê Hoàng D",
      seed: "le-hoang-d",
      role: "QA",
      roleColor: "bg-rose-500/20 text-rose-400",
      time: "10:20 AM",
      timestamp: ts(10, 20, -2),
      text: "Mọi người đã xem video chia sẻ về automation testing chưa? Rất hay!",
      body: <p>Mọi người đã xem video chia sẻ về automation testing chưa? Rất hay!</p>,
    },
  ],
  "devops-alerts": [
    {
      id: "d1",
      channel: "devops-alerts",
      author: "Bot",
      seed: "bot-1",
      time: "7:00 AM",
      timestamp: ts(7, 0),
      text: "[ALERT] CPU usage on prod-db-01 exceeded 85% for 5 minutes.",
      body: (
        <p>
          <span className="text-rose-400 font-semibold">[ALERT]</span> CPU usage on prod-db-01
          exceeded 85% for 5 minutes.
        </p>
      ),
    },
  ],
  announcements: [
    {
      id: "a1",
      channel: "announcements",
      author: "Nguyễn Văn A",
      seed: "nguyen-van-a-1",
      role: "CEO",
      roleColor: "bg-primary/20 text-primary",
      time: "7:30 AM",
      timestamp: ts(7, 30, -1),
      text: "Thông báo: Công ty sẽ tổ chức team building vào cuối tháng này. Đăng ký trước 15/06.",
      body: (
        <p>Thông báo: Công ty sẽ tổ chức team building vào cuối tháng này. Đăng ký trước 15/06.</p>
      ),
    },
  ],
};

const suggestedActions = [
  { who: "Phạm Minh C", task: "Hoàn thiện UI Dashboard", when: "Today", color: "bg-success" },
  { who: "Lê Hoàng D", task: "Re-test sau khi fix bug", when: "Tomorrow", color: "bg-rose-500" },
  { who: "Trần Thị B", task: "Deploy API Gateway Staging", when: "Today", color: "bg-amber-500" },
];

const importantThreads = [
  {
    id: "STOS-123",
    title: "API Gateway Performance Issue",
    replies: 2,
    when: "1h ago",
    color: "bg-amber-500/20 text-amber-400",
  },
  {
    id: "UI",
    title: "UI/UX Design System Update",
    replies: 5,
    when: "3h ago",
    color: "bg-violet-500/20 text-violet-400",
  },
  {
    id: "MOB",
    title: "Mobile App Offline Sync Discussion",
    replies: 7,
    when: "1d ago",
    color: "bg-sky-500/20 text-sky-400",
  },
];

const sharedFiles = [
  {
    icon: FileText,
    name: "Sprint 6 Plan.pdf",
    meta: "PDF · 2.4 MB · Nguyễn Văn A",
    color: "text-rose-400",
  },
  {
    icon: FileText,
    name: "API_Gateway_Spec_v2.1.docx",
    meta: "DOCX · 1.1 MB · Trần Thị B",
    color: "text-sky-400",
  },
  {
    icon: FileSpreadsheet,
    name: "Dashboard_Design.fig",
    meta: "FIG · 8.7 MB · Phạm Minh C",
    color: "text-emerald-400",
  },
];

function ChannelRow({
  ch,
  active,
  onClick,
}: {
  ch: Channel;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Hash className="h-4 w-4 opacity-70" />
      <span className="flex-1 truncate text-left">{ch.name}</span>
      {ch.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
      {ch.unread ? (
        <span className="rounded-full bg-destructive px-1.5 py-0 text-[10px] font-medium text-white">
          {ch.unread}
        </span>
      ) : null}
    </button>
  );
}

function DMRow({ dm }: { dm: DM }) {
  const dot =
    dm.online === "online"
      ? "bg-success"
      : dm.online === "away"
        ? "bg-amber-500"
        : "bg-muted-foreground/50";
  return (
    <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <span className="relative">
        <img src={avatar(dm.seed)} alt="" className="h-6 w-6 rounded-full object-cover" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-surface ${dot}`}
        />
      </span>
      <span className="flex-1 truncate text-left">{dm.name}</span>
    </button>
  );
}

function MessageItem({ m }: { m: Msg }) {
  return (
    <div className="group flex gap-3 rounded-lg px-3 py-2 hover:bg-surface-2/40">
      <img src={avatar(m.seed)} className="h-9 w-9 shrink-0 rounded-full object-cover" alt="" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{m.author}</span>
          {m.role && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.roleColor}`}>
              {m.role}
            </span>
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

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeFilterFn(timestamp: number, range: string): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  if (range === "today") return isSameDay(d, now);
  if (range === "yesterday") {
    const y = new Date(now.getTime() - 86400000);
    return isSameDay(d, y);
  }
  if (range === "7d") return now.getTime() - timestamp <= 7 * 86400000;
  return true;
}

function ChatPage() {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [activeChannel, setActiveChannel] = useState("sprint-6");
  const [view, setView] = useState<"channel" | "threads" | "mentions" | "drafts">("channel");
  const [messages, setMessages] = useState<Msg[]>(channelMessages["sprint-6"] || []);
  const [input, setInput] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [showCopilot, setShowCopilot] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchChannel, setSearchChannel] = useState("all");
  const [searchTime, setSearchTime] = useState("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(channelMessages[activeChannel] || []);
  }, [activeChannel]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const filteredMessages = useMemo(() => {
    let pool = messages;
    if (searchChannel !== "all" && searchChannel !== activeChannel) {
      pool = channelMessages[searchChannel] || [];
    }
    const q = searchQuery.trim().toLowerCase();
    return pool.filter((m) => {
      const matchQ =
        !q || (m.text && m.text.toLowerCase().includes(q)) || m.author.toLowerCase().includes(q);
      const matchTime = timeFilterFn(m.timestamp, searchTime);
      return matchQ && matchTime;
    });
  }, [messages, searchQuery, searchChannel, searchTime, activeChannel]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const now = Date.now();
    const newMsg: Msg = {
      id: `m${now}`,
      channel: activeChannel,
      author: "Nguyễn Văn A",
      seed: "nguyen-van-a-1",
      role: "CEO",
      roleColor: "bg-primary/20 text-primary",
      time: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timestamp: now,
      text,
      body: <p>{text}</p>,
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  };

  const isSearchActive =
    searchQuery.trim().length > 0 || searchChannel !== "all" || searchTime !== "all";

  const timeRanges = [
    {
      key: "today",
      label: t("chat.search.time.today"),
      color: "border-success/40 text-success bg-success/10",
    },
    {
      key: "yesterday",
      label: t("chat.search.time.yesterday"),
      color: "border-amber-500/40 text-amber-500 bg-amber-500/10",
    },
    {
      key: "7d",
      label: t("chat.search.time.7d"),
      color: "border-primary/40 text-primary bg-primary/10",
    },
  ];

  const selectChannel = (name: string) => {
    setActiveChannel(name);
    setView("channel");
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
                {(
                  [
                    { k: "threads", label: "Threads", icon: MessageCircle },
                    { k: "mentions", label: "Mentions", icon: AtSign },
                    { k: "drafts", label: "Drafts", icon: FileText },
                  ] as const
                ).map((it) => (
                  <button
                    key={it.k}
                    onClick={() => setView(it.k)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      view === it.k
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <it.icon className="h-4 w-4" /> {it.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Favorites
                </div>
                {favorites.map((c) => (
                  <ChannelRow
                    key={c.name}
                    ch={c}
                    active={view === "channel" && activeChannel === c.name}
                    onClick={() => selectChannel(c.name)}
                  />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Channels</span>
                  <button className="rounded p-0.5 hover:bg-surface-2">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {channels.map((c) => (
                  <ChannelRow
                    key={c.name}
                    ch={c}
                    active={view === "channel" && activeChannel === c.name}
                    onClick={() => selectChannel(c.name)}
                  />
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Direct Messages</span>
                  <button className="rounded p-0.5 hover:bg-surface-2">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {dms.map((d) => (
                  <DMRow key={d.seed} dm={d} />
                ))}
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
            {view !== "channel" ? (
              <SpecialView view={view} onOpenChannel={selectChannel} />
            ) : (
              <>
                <header className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Hash className="h-5 w-5 text-muted-foreground" />
                      <h1 className="truncate text-lg font-semibold">{activeChannel}</h1>
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Sprint 6 - Development</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> 15 members
                      </span>
                      <button className="hover:text-foreground">+ Add a channel description</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <Users className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowSearch((v) => !v)}
                      className={`rounded-lg p-2 hover:bg-surface-2 hover:text-foreground ${showSearch ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                    >
                      <SearchIcon className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                {/* Search panel */}
                {showSearch && (
                  <div className="mx-5 mt-3 space-y-2 rounded-xl border border-border bg-surface-2/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t("chat.search.placeholder")}
                        className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                      />
                      {isSearchActive && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setSearchChannel("all");
                            setSearchTime("all");
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          title="Clear"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={searchChannel}
                        onChange={(e) => setSearchChannel(e.target.value)}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="all">{t("chat.search.channel.all")}</option>
                        {allChannelNames.map((c) => (
                          <option key={c} value={c}>
                            #{c}
                          </option>
                        ))}
                      </select>

                      {timeRanges.map((tr) => {
                        const active = searchTime === tr.key;
                        return (
                          <button
                            key={tr.key}
                            onClick={() =>
                              setSearchTime((prev) => (prev === tr.key ? "all" : tr.key))
                            }
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? `${tr.color}`
                                : "border-border bg-surface text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {tr.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mx-5 mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm">
                  <Pin className="mt-0.5 h-4 w-4 text-amber-400" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Pinned by Trần Thị B</div>
                    <div>
                      <span className="font-medium">Daily Standup at 09:30 AM in LiveKit</span>{" "}
                      <Link to="/meeting" className="text-primary hover:underline">
                        Join meeting
                      </Link>
                    </div>
                  </div>
                  <button className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
                  <div className="my-3 flex items-center justify-center">
                    <div className="rounded-full bg-surface-2 px-3 py-0.5 text-xs text-muted-foreground">
                      Today
                    </div>
                  </div>
                  {filteredMessages.length === 0 && isSearchActive ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                      <SearchIcon className="mb-2 h-8 w-8 opacity-40" />
                      <p>{t("chat.search.no.result")}</p>
                    </div>
                  ) : (
                    filteredMessages.map((m) => <MessageItem key={m.id} m={m} />)
                  )}
                </div>

                {/* Composer */}
                <div className="px-5 pb-5">
                  <div className="rounded-xl border border-border bg-surface-2/60 focus-within:border-primary/50">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      placeholder={`Message #${activeChannel}`}
                      className="w-full bg-transparent px-4 pt-3 text-sm placeholder:text-muted-foreground focus:outline-none"
                    />
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <SmileIcon className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <AtSign className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <Type className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <Code2 className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1.5 hover:bg-surface-2 hover:text-foreground">
                          <Mic className="h-4 w-4" />
                        </button>
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
              </>
            )}
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
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    BETA
                  </span>
                </div>
                <button
                  onClick={() => setShowCopilot(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
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
                    {i === 0 && (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" /> Channel Summary
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Sprint 6 đang tập trung hoàn thành API Gateway, UI Dashboard và Mobile App. API
                    Gateway 90% hoàn thành, UI còn 2 task, Mobile App đã test xong.
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
                          <div>
                            <span className="font-semibold">{a.who}</span>{" "}
                            <span className="text-muted-foreground">- {a.task}</span>
                          </div>
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
                    <span className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-sky-400" /> Important Threads
                    </span>
                    <button className="text-xs text-primary hover:underline">View all</button>
                  </div>
                  <ul className="space-y-2">
                    {importantThreads.map((th) => (
                      <li key={th.id} className="flex items-start gap-2 text-xs">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${th.color}`}
                        >
                          <Hash className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {th.id}: {th.title}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {th.replies} replies · Updated {th.when}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-border bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-emerald-400" /> Shared Files
                    </span>
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

type SpecialViewKey = "threads" | "mentions" | "drafts";

const threadData = [
  {
    id: "t1",
    channel: "sprint-6",
    parent: {
      author: "Trần Thị B",
      seed: "tran-thi-b",
      time: "Hôm nay · 9:05",
      text: "API Gateway đã hoàn thành 90%. Đang review và chuẩn bị deploy staging.",
    },
    replies: [
      {
        author: "Phạm Minh C",
        seed: "pham-minh-c",
        time: "9:15",
        text: "Mình sẽ hỗ trợ load test sau khi deploy lên staging.",
      },
      {
        author: "Nguyễn Văn A",
        seed: "nguyen-van-a-1",
        time: "9:22",
        text: "Tốt, nhớ ghi lại metrics để báo cáo Steering Committee chiều nay.",
      },
    ],
    unread: 2,
  },
  {
    id: "t2",
    channel: "design-system",
    parent: {
      author: "Phạm Nam",
      seed: "pham-nam",
      time: "Hôm qua · 16:40",
      text: "Mình vừa update bộ token màu mới cho dark mode, mọi người review giúp nhé.",
    },
    replies: [
      {
        author: "Đỗ Linh",
        seed: "do-linh",
        time: "17:05",
        text: "Contrast của text-muted hơi thấp trên nền surface, mình đề xuất tăng lên 4.5:1.",
      },
    ],
    unread: 1,
  },
  {
    id: "t3",
    channel: "announcements",
    parent: {
      author: "Nguyễn Văn A",
      seed: "nguyen-van-a-1",
      time: "2 ngày trước",
      text: "Thông báo: Công ty sẽ tổ chức team building vào cuối tháng. Đăng ký trước 15/06.",
    },
    replies: [
      {
        author: "Trần Thị B",
        seed: "tran-thi-b",
        time: "1 ngày trước",
        text: "Em đã tổng hợp 28 đăng ký, sẽ chốt vào sáng mai.",
      },
    ],
  },
];

const mentionsData = [
  {
    id: "n1",
    channel: "sprint-6",
    author: "Trần Thị B",
    seed: "tran-thi-b",
    time: "9:42",
    text: "@Nguyễn Văn A có thể xem giúp em PR #128 không ạ? Cần merge trước trưa nay.",
  },
  {
    id: "n2",
    channel: "devops-alerts",
    author: "Bot",
    seed: "bot-1",
    time: "8:10",
    text: "@channel CPU prod-db-01 đang ở 86%, cần kiểm tra ngay.",
  },
  {
    id: "n3",
    channel: "general",
    author: "Lê Hoa",
    seed: "le-hoa",
    time: "Hôm qua",
    text: "@Nguyễn Văn A buổi họp 1-1 chiều nay dời sang 15:30 nhé anh.",
  },
  {
    id: "n4",
    channel: "hr-policies",
    author: "HR Bot",
    seed: "hr-bot",
    time: "2 ngày trước",
    text: "@here Chính sách nghỉ phép mới đã có hiệu lực, xin mọi người đọc và xác nhận.",
  },
];

const draftsData = [
  {
    id: "d1",
    channel: "sprint-6",
    time: "5 phút trước",
    text: "Update tiến độ MVP: hiện đang ở 75%, dự kiến hoàn thành trước 15/07. Cần thêm hỗ trợ từ team QA cho...",
  },
  {
    id: "d2",
    channel: "Trần Thị B",
    dm: true,
    time: "Hôm nay · 10:12",
    text: "Chị ơi em gửi lại bản phân tích risk cho dự án STOS, nhờ chị review giúp em trước cuộc họp...",
  },
  {
    id: "d3",
    channel: "announcements",
    time: "Hôm qua",
    text: "Kính gửi cả nhà, ngày 30/06 phòng IT sẽ bảo trì hệ thống mạng từ 22:00 đến 02:00...",
  },
];

function SpecialView({
  view,
  onOpenChannel,
}: {
  view: SpecialViewKey;
  onOpenChannel: (name: string) => void;
}) {
  const meta = {
    threads: {
      icon: MessageCircle,
      title: "Threads",
      desc: "Các cuộc trao đổi bạn đang theo dõi",
      color: "text-sky-400",
    },
    mentions: {
      icon: AtSign,
      title: "Mentions",
      desc: "Tin nhắn nhắc đến bạn (@you, @channel, @here)",
      color: "text-amber-400",
    },
    drafts: {
      icon: FileText,
      title: "Drafts",
      desc: "Tin nhắn đã soạn nhưng chưa gửi",
      color: "text-violet-400",
    },
  }[view];
  const Icon = meta.icon;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${meta.color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{meta.title}</h1>
            <div className="text-xs text-muted-foreground">{meta.desc}</div>
          </div>
        </div>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <Filter className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {view === "threads" && (
          <div className="mx-auto max-w-3xl space-y-3">
            {threadData.map((th) => (
              <article key={th.id} className="rounded-xl border border-border bg-surface-2/50 p-4">
                <button
                  onClick={() => onOpenChannel(th.channel)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Hash className="h-3 w-3" /> {th.channel}
                  {th.unread ? (
                    <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-medium text-white">
                      {th.unread} mới
                    </span>
                  ) : null}
                </button>
                <div className="flex gap-3">
                  <img
                    src={avatar(th.parent.seed)}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{th.parent.author}</span>
                      <span className="text-[11px] text-muted-foreground">{th.parent.time}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground/90">{th.parent.text}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3 border-l-2 border-border pl-4">
                  {th.replies.map((r, i) => (
                    <div key={i} className="flex gap-3">
                      <img
                        src={avatar(r.seed)}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold">{r.author}</span>
                          <span className="text-[10px] text-muted-foreground">{r.time}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-foreground/85">{r.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    placeholder="Trả lời thread..."
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    Gửi
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {view === "mentions" && (
          <div className="mx-auto max-w-3xl space-y-2">
            {mentionsData.map((m) => (
              <article
                key={m.id}
                className="flex gap-3 rounded-xl border border-border bg-surface-2/40 p-3 hover:border-primary/40"
              >
                <img
                  src={avatar(m.seed)}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">{m.author}</span>
                    <button
                      onClick={() => onOpenChannel(m.channel)}
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      <Hash className="h-3 w-3" /> {m.channel}
                    </button>
                    <span className="text-[11px] text-muted-foreground">{m.time}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90">
                    {m.text.split(/(@\S+)/g).map((part, i) =>
                      part.startsWith("@") ? (
                        <span
                          key={i}
                          className="rounded bg-primary/15 px-1 font-medium text-primary"
                        >
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  <button
                    className="rounded p-1.5 hover:bg-surface hover:text-foreground"
                    title="Trả lời"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded p-1.5 hover:bg-surface hover:text-foreground"
                    title="Đánh dấu đã đọc"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {view === "drafts" && (
          <div className="mx-auto max-w-3xl space-y-2">
            {draftsData.map((d) => (
              <article
                key={d.id}
                className="rounded-xl border border-dashed border-border bg-surface-2/40 p-3 hover:border-primary/40"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <button
                    onClick={() => !d.dm && onOpenChannel(d.channel)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {d.dm ? (
                      <span>@ {d.channel}</span>
                    ) : (
                      <>
                        <Hash className="h-3 w-3" /> {d.channel}
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-muted-foreground">{d.time}</span>
                </div>
                <p className="line-clamp-2 text-sm text-foreground/85">{d.text}</p>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface hover:text-foreground">
                    Xoá
                  </button>
                  <button className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface">
                    Chỉnh sửa
                  </button>
                  <button className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    <Send className="mr-1 inline h-3 w-3" /> Gửi ngay
                  </button>
                </div>
              </article>
            ))}
            <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> Tạo bản nháp mới
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
