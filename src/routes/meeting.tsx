import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, MessageSquare, Video, ListChecks, FileText, BookOpen,
  Workflow, Users, BarChart3, Bot, Plus, Search, Bell, Settings, Calendar,
  ShieldCheck, ChevronDown, MoreHorizontal, Mic, MicOff, VideoIcon, Monitor, Menu, X,
  Hand, MessageCircle, Sparkles, PhoneOff, Maximize2, Hash, Circle, Cloud,
} from "lucide-react";

export const Route = createFileRoute("/meeting")({
  head: () => ({
    meta: [
      { title: "UNIWORK — Digital Workplace Platform" },
      { name: "description", content: "Sprint 6 – Daily Standup meeting on UNIWORK." },
    ],
  }),
  component: Index,
});

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;

const participants = [
  { name: "Nguyễn Văn A", seed: "nguyen-van-a-1" },
  { name: "Trần Thị B", seed: "tran-thi-b" },
  { name: "Phạm Minh C", seed: "pham-minh-c" },
  { name: "Lê Hoàng D", seed: "le-hoang-d" },
  { name: "Nguyễn Hương", seed: "nguyen-huong" },
  { name: "Đỗ Tuấn Nam", seed: "do-tuan-nam" },
  { name: "Duy Anh", seed: "duy-anh" },
  { name: "Quang Minh", seed: "quang-minh" },
  { name: "Mỹ Linh", seed: "my-linh" },
  { name: "Bảo Ngọc", seed: "bao-ngoc" },
];

function NavItem({ icon: Icon, label, active, chevron }: { icon: any; label: string; active?: boolean; chevron?: boolean }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="flex-1 text-left">{label}</span>
      {chevron && <ChevronDown className="h-4 w-4 opacity-60" />}
    </button>
  );
}

function WorkspaceItem({ letter, name, color }: { letter: string; name: string; color: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold text-white ${color}`}>
        {letter}
      </span>
      <span>{name}</span>
    </button>
  );
}

function VideoTile({ name, seed, highlight }: { name: string; seed: string; highlight?: boolean }) {
  return (
    <div
      className={`video-tile ${highlight ? "ring-2 ring-primary/70" : ""}`}
    >
      <img src={avatar(seed)} alt={name} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs text-white">
        <Mic className="h-3 w-3" />
        <span>{name}</span>
      </div>
      {highlight && (
        <button className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ControlButton({ icon: Icon, label, badge, danger }: { icon: any; label: string; badge?: number; danger?: boolean }) {
  return (
    <button className="flex flex-col items-center gap-1.5">
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full ${
          danger ? "bg-destructive text-destructive-foreground" : "bg-surface-2 text-foreground hover:bg-surface-2/70"
        }`}
      >
        <Icon className="h-5 w-5" />
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </button>
  );
}

function Index() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform lg:static lg:w-56 lg:translate-x-0 xl:w-64 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">U</div>
          <div className="flex-1 leading-tight">
            <div className="text-base font-bold tracking-wide">UNIWORK</div>
            <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
          </div>
          <button
            aria-label="Close sidebar"
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          <NavItem icon={LayoutDashboard} label="Dashboard" chevron />
          <NavItem icon={MessageSquare} label="Chat" active />
          <NavItem icon={Video} label="Meetings" chevron />
          <NavItem icon={ListChecks} label="Tasks & Projects" />
          <NavItem icon={FileText} label="Documents" />
          <NavItem icon={BookOpen} label="Knowledge Base" />
          <NavItem icon={Workflow} label="Workflows" />
          <NavItem icon={Users} label="People" />
          <NavItem icon={BarChart3} label="Reports" />
          <NavItem icon={Bot} label="AI Assistant" />

          <div className="flex items-center justify-between px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Workspaces</span>
            <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <WorkspaceItem letter="S" name="STOS Project" color="bg-emerald-500" />
          <WorkspaceItem letter="Y" name="Y tế xã" color="bg-amber-500" />
          <WorkspaceItem letter="U" name="Smart University" color="bg-sky-500" />
          <WorkspaceItem letter="M" name="Marketing & PM" color="bg-rose-500" />
          <WorkspaceItem letter="H" name="HR Department" color="bg-violet-500" />
          <WorkspaceItem letter="D" name="DevOps" color="bg-orange-500" />
          <NavItem icon={MoreHorizontal} label="More" />
        </nav>

        <div className="m-3 rounded-xl bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="text-sm">
              <div className="font-medium">Mattermost</div>
              <div className="flex items-center gap-1 text-[11px] text-success">
                <Circle className="h-1.5 w-1.5 fill-current" /> Connected
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm">
          <Cloud className="h-5 w-5 text-sky-400" />
          <div>
            <div className="font-medium">Nguyễn Văn A</div>
            <div className="text-[11px] text-muted-foreground">28°C · Hà Nội</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6 lg:flex-nowrap lg:gap-4">
          <button
            aria-label="Open sidebar"
            className="rounded-lg p-2 hover:bg-surface-2 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative order-last w-full min-w-0 flex-1 basis-full sm:order-none sm:basis-auto sm:max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="w-full rounded-lg bg-surface-2 py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            <Circle className="h-2 w-2 fill-current" /> Live
          </span>
          <span className="hidden font-mono text-sm tabular-nums sm:inline">00:28:45</span>
          <button className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"><ShieldCheck className="h-5 w-5 text-muted-foreground" /></button>
          <button className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"><Settings className="h-5 w-5 text-muted-foreground" /></button>
          <button className="hidden items-center gap-1 rounded-lg p-2 hover:bg-surface-2 md:flex">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">16</span>
          </button>
          <button className="relative rounded-lg p-2 hover:bg-surface-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">12</span>
          </button>
          <button className="hidden rounded-lg p-2 hover:bg-surface-2 lg:block"><Calendar className="h-5 w-5 text-muted-foreground" /></button>
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
            <img src={avatar("nguyen-van-a-1")} className="h-8 w-8 rounded-full object-cover" alt="" />
            <div className="hidden text-sm leading-tight sm:block">
              <div className="whitespace-nowrap font-medium">Nguyễn Văn A</div>
              <div className="whitespace-nowrap text-[11px] text-muted-foreground">Giám đốc Điều hành</div>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
          </div>
        </header>

        {/* Body: meeting + right panel */}
        <div className="flex flex-1 flex-col overflow-hidden xl:flex-row">
          {/* Meeting area */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-medium text-primary">Sprint-6</span>
                  <span>/</span>
                  <span>Meetings</span>
                </div>
                <h1 className="text-xl font-bold sm:text-2xl">Sprint 6 – Daily Standup</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> LiveKit Meeting</span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> 16 participants</span>
                  <span className="flex items-center gap-1.5"><Circle className="h-2 w-2 fill-destructive text-destructive" /> Recording</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden -space-x-2 sm:flex">
                  {participants.slice(0, 5).map((p) => (
                    <img key={p.seed} src={avatar(p.seed)} alt={p.name} className="h-8 w-8 rounded-full border-2 border-surface object-cover" />
                  ))}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-xs">+8</span>
                </div>
                <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:px-4">Invite</button>
                <button className="rounded-lg bg-surface-2 p-2"><MoreHorizontal className="h-5 w-5" /></button>
              </div>
            </div>

            {/* Video grid */}
            <div className="video-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              <VideoTile name={participants[0].name} seed={participants[0].seed} highlight />
              <VideoTile name={participants[1].name} seed={participants[1].seed} />
              <VideoTile name={participants[2].name} seed={participants[2].seed} />
              <VideoTile name={participants[3].name} seed={participants[3].seed} />
              <VideoTile name={participants[4].name} seed={participants[4].seed} />
              <VideoTile name={participants[5].name} seed={participants[5].seed} />
            </div>

            {/* Small row */}
            <div className="video-grid mt-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5">
              {participants.slice(6, 10).map((p) => (
                <div key={p.seed} className="video-tile">
                  <img src={avatar(p.seed)} alt={p.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[11px] text-white">
                    <Mic className="h-2.5 w-2.5" /> {p.name}
                  </div>
                </div>
              ))}
              <div className="video-tile flex flex-col items-center justify-center text-muted-foreground">
                <div className="text-2xl font-bold text-foreground">+8</div>
                <div className="text-xs">participants</div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-5">
              <ControlButton icon={MicOff} label="Unmute" />
              <ControlButton icon={VideoIcon} label="Start video" />
              <ControlButton icon={Monitor} label="Share screen" />
              <ControlButton icon={Hand} label="Raise hand" />
              <ControlButton icon={MessageCircle} label="Chat" />
              <ControlButton icon={Users} label="Participants" badge={16} />
              <ControlButton icon={Sparkles} label="AI Copilot" />
              <ControlButton icon={MoreHorizontal} label="More" />
              <ControlButton icon={PhoneOff} label="Leave" danger />
            </div>

            {/* Shared content */}
            <div className="mt-6 rounded-xl bg-surface p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-6 border-b border-border text-sm">
                  <button className="border-b-2 border-primary pb-2 font-medium text-primary">Shared Screen</button>
                  <button className="pb-2 text-muted-foreground">Presentation</button>
                  <button className="pb-2 text-muted-foreground">Whiteboard</button>
                </div>
                <div className="flex gap-2 text-muted-foreground">
                  <button className="rounded p-1.5 hover:bg-surface-2"><Maximize2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-surface-2 p-3 text-xs">
                  <div className="mb-2 font-semibold">STOS Dashboard</div>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>· Overview</li><li>· Project</li><li>· Tasks</li><li>· Reports</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <div className="text-xs text-muted-foreground">Sprint 6 Progress</div>
                  <div className="mt-2 text-3xl font-bold">72%</div>
                  <svg viewBox="0 0 100 30" className="mt-2 h-10 w-full"><polyline fill="none" stroke="oklch(0.7 0.18 150)" strokeWidth="2" points="0,25 15,22 30,18 45,15 60,10 75,8 100,3"/></svg>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <div className="text-xs text-muted-foreground">Tasks</div>
                  <div className="mt-2 flex items-end gap-4">
                    <div><div className="text-2xl font-bold text-success">18</div><div className="text-[10px] text-muted-foreground">Done</div></div>
                    <div><div className="text-2xl font-bold text-amber-400">5</div><div className="text-[10px] text-muted-foreground">In Progress</div></div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-destructive">2<span className="ml-2 text-[10px] font-normal text-muted-foreground">Blocked</span></div>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">Burndown Chart <Maximize2 className="h-3 w-3" /></div>
                  <svg viewBox="0 0 120 50" className="mt-2 h-16 w-full">
                    <polyline fill="none" stroke="oklch(0.62 0.22 285)" strokeWidth="1.5" points="0,5 20,12 40,18 60,22 80,30 100,38 120,45"/>
                    <polyline fill="none" stroke="oklch(0.62 0.23 25)" strokeWidth="1.5" points="0,8 20,18 40,15 60,28 80,25 100,35 120,30"/>
                  </svg>
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>May 18</span><span>May 20</span><span>May 22</span><span>May 24</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Right panel */}
          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface xl:w-80 xl:border-l xl:border-t-0 2xl:w-96">
            <div className="flex gap-5 overflow-x-auto border-b border-border px-5 pt-4 text-sm">
              <button className="border-b-2 border-primary pb-3 font-medium">AI Copilot</button>
              <button className="pb-3 text-muted-foreground">Chat</button>
              <button className="pb-3 text-muted-foreground">Participants (16)</button>
              <button className="pb-3 text-muted-foreground">Files</button>
              <button className="pb-3 text-muted-foreground">Polls</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-semibold">AI Meeting Assistant</span>
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BETA</span>
              </div>

              <div className="mb-4 flex gap-1.5 rounded-lg bg-surface-2 p-1">
                {["Summary", "Notes", "Transcript", "Actions"].map((t, i) => (
                  <button key={t} className={`flex-1 rounded px-2 py-1.5 text-xs ${i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
                ))}
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">📝 Tóm tắt cuộc họp</span>
                  <span className="text-[10px] italic text-success">Generating summary…</span>
                </div>
                <div className="mb-2 text-right text-[10px] text-muted-foreground">Update 09:58</div>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li>• API Gateway đã hoàn thành 90%</li>
                  <li>• Dashboard UI còn 2 task quan trọng</li>
                  <li>• Mobile App đang tích hợp Auth Service</li>
                  <li>• Kế hoạch release: 30/06/2025</li>
                </ul>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4 text-success" /> Action Items</div>
                {[
                  ["Minh C", "Hoàn thiện API Gateway", "25/06"],
                  ["Hoàng D", "Review UI Dashboard", "26/06"],
                  ["Hương", "Kiểm thử Mobile App", "27/06"],
                ].map(([who, what, when]) => (
                  <div key={who} className="flex items-center gap-2 border-b border-border py-2 text-xs">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-border bg-surface-2" />
                    <span className="w-16 font-medium">{who}</span>
                    <span className="flex-1 text-muted-foreground">{what}</span>
                    <span className="text-muted-foreground">{when}</span>
                  </div>
                ))}
                <button className="mt-2 flex items-center gap-1 text-xs text-primary"><Plus className="h-3 w-3" /> Add action item</button>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4 text-primary" /> Progress</div>
                <div className="mb-1 flex justify-between text-xs"><span>Sprint 6</span><span>72%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[72%] rounded-full bg-success" />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Completed 18 / 25 tasks</div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium"><Video className="h-4 w-4 text-primary" /> Recording</span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-destructive"><Circle className="h-1.5 w-1.5 fill-current" /> REC</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-surface-2 p-2 text-xs">
                  <span className="flex items-center gap-2"><Circle className="h-2 w-2 fill-destructive text-destructive" /> Live recording đang chạy</span>
                  <span className="font-mono">00:28:45</span>
                </div>
                <button className="mt-2 w-full rounded-lg border border-primary/40 bg-primary/10 py-2 text-sm font-medium text-primary hover:bg-primary/20">Open recording</button>
              </div>
            </div>

            <div className="m-4 rounded-xl border border-primary/40 bg-primary/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Ask AI Copilot</span>
                <button className="text-muted-foreground">×</button>
              </div>
              <div className="flex items-center gap-2">
                <input placeholder="Ask me anything about this meeting…" className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none" />
                <button className="rounded-md bg-primary p-1.5 text-primary-foreground">→</button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
