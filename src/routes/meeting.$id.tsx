import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  MessageSquare,
  Users,
  Sparkles,
  Hand,
  MoreHorizontal,
  Send,
  FileText,
  Clock,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/meeting/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Phòng họp ${params.id} · UNIWORK` }],
  }),
  component: MeetingDetailPage,
});

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<"chat" | "participants" | "transcript" | "ai">("ai");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const participants = [
    { name: "Minh Anh", seed: "minh-anh", speaking: true },
    { name: "Tuấn Nam", seed: "tuan-nam-ba", speaking: false },
    { name: "Hương Trần", seed: "huong-tran", speaking: false },
    { name: "Duy Anh", seed: "duy-anh", speaking: false },
    { name: "Bảo Ngọc", seed: "bao-ngoc", speaking: false },
    { name: "Phương Linh", seed: "phuong-linh", speaking: false },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="meeting" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden p-4 lg:p-6">
            <div className="mb-3">
              <Link to="/meeting" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Tất cả cuộc họp
              </Link>
              <h1 className="mt-1 text-lg font-semibold">
                Sprint Review · <span className="font-mono text-muted-foreground">{id}</span>
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" /> Trực tiếp
                </span>
                <Clock className="h-3 w-3" /> 32:14
                <span>·</span>
                <Users className="h-3 w-3" /> {participants.length} người
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-2 overflow-hidden lg:grid-cols-3">
              {participants.map((p) => (
                <div
                  key={p.seed}
                  className={`relative flex items-center justify-center rounded-xl bg-surface-2 ${p.speaking ? "ring-2 ring-success" : ""}`}
                >
                  <img src={avatar(p.seed)} className="h-20 w-20 rounded-full" alt="" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                    <span className="truncate">{p.name}</span>
                    {p.speaking && <Mic className="h-3 w-3 text-success" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2">
              <CtrlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? MicOff : Mic} />
              <CtrlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={camOff ? VideoOff : Video} />
              <CtrlBtn icon={ScreenShare} />
              <CtrlBtn icon={Hand} />
              <CtrlBtn icon={MoreHorizontal} />
              <button className="ml-2 flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-white hover:bg-destructive/90">
                <PhoneOff className="h-4 w-4" /> Rời phòng
              </button>
            </div>
          </main>

          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex">
            <div className="flex border-b border-border text-xs">
              {(
                [
                  { k: "ai", label: "AI", icon: Sparkles },
                  { k: "chat", label: "Chat", icon: MessageSquare },
                  { k: "participants", label: "Người", icon: Users },
                  { k: "transcript", label: "Biên bản", icon: FileText },
                ] as const
              ).map((it) => (
                <button
                  key={it.k}
                  onClick={() => setTab(it.k)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${tab === it.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <it.icon className="h-3.5 w-3.5" /> {it.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {tab === "ai" && <AICopilotPanel />}
              {tab === "chat" && <ChatPanel />}
              {tab === "participants" && (
                <ul className="space-y-2">
                  {participants.map((p) => (
                    <li key={p.seed} className="flex items-center gap-2">
                      <img src={avatar(p.seed)} className="h-7 w-7 rounded-full" alt="" />
                      <span className="flex-1">{p.name}</span>
                      {p.speaking && <Mic className="h-3 w-3 text-success" />}
                    </li>
                  ))}
                </ul>
              )}
              {tab === "transcript" && (
                <div className="space-y-3 text-xs">
                  {[
                    { who: "Minh Anh", time: "00:01:24", text: "Chào mọi người, bắt đầu sprint review." },
                    { who: "Tuấn Nam", time: "00:02:10", text: "Backend hoàn thành 8/10 user story." },
                    { who: "Hương Trần", time: "00:03:45", text: "Frontend còn 2 bug responsive trên mobile." },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] text-muted-foreground">
                        {m.who} · {m.time}
                      </div>
                      <div className="text-foreground">{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({
  icon: Icon,
  active = true,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-surface-2 hover:bg-surface-3" : "bg-destructive/20 text-destructive"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function AICopilotPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Tóm tắt tức thời
        </div>
        <p className="text-xs text-muted-foreground">
          Backend hoàn thành 8/10 user story. Frontend cần fix 2 bug responsive
          trước EOD. Sprint planning tiếp theo dự kiến thứ Hai.
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Action items
        </div>
        <ul className="space-y-2 text-xs">
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Hương Trần fix bug responsive trên Dashboard
              <div className="text-[10px] text-muted-foreground">Hạn: hôm nay</div>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Tuấn Nam gửi test report sprint 14
              <div className="text-[10px] text-muted-foreground">Hạn: 30/05</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ChatPanel() {
  const [msg, setMsg] = useState("");
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {[
          { who: "Minh Anh", text: "Mọi người đã sẵn sàng chưa?", time: "10:00" },
          { who: "Tuấn Nam", text: "Sẵn sàng nhé", time: "10:01" },
        ].map((m, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium">{m.who}</span>{" "}
            <span className="text-[10px] text-muted-foreground">{m.time}</span>
            <div className="text-muted-foreground">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Nhập tin nhắn…"
          className="flex-1 bg-transparent text-xs focus:outline-none"
        />
        <button className="rounded p-1 hover:bg-surface-3">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}