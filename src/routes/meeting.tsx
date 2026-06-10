import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ListChecks, Users, BarChart3, Plus, Calendar, MoreHorizontal,
  Mic, MicOff, VideoIcon, Monitor, Hand, MessageCircle, Sparkles,
  PhoneOff, Maximize2, Hash, Circle, Video, Search, Filter, ChevronLeft,
  ChevronRight, Clock, Link2, PlayCircle, FileText, Download, Star,
  ArrowUpRight, CheckCircle2, AlertCircle, Send, Paperclip, Smile,
  Image as ImageIcon, FileSpreadsheet, FileArchive, UserPlus, Crown,
  MicOff as MicOffIcon, Pin, MoreVertical, ShieldCheck, Eye,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/meeting")({
  head: () => ({
    meta: [
      { title: "Họp · UNIWORK" },
      { name: "description", content: "Lên lịch, tham gia và quản lý cuộc họp với AI Copilot." },
    ],
  }),
  component: MeetingPage,
});

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

type Status = "live" | "upcoming" | "ended";

const MEETINGS: {
  id: string; title: string; project: string; time: string; date: string;
  durationMin: number; status: Status; participants: string[]; recording?: boolean;
  type: "standup" | "review" | "1-on-1" | "client" | "workshop";
}[] = [
  { id: "m1", title: "Sprint 6 – Daily Standup", project: "STOS", time: "09:30", date: "Hôm nay", durationMin: 30, status: "live", participants: ["nguyen-van-a-1","tran-thi-b","pham-minh-c","le-hoang-d","nguyen-huong"], recording: true, type: "standup" },
  { id: "m2", title: "UX Review – Mobile App", project: "Smart University", time: "11:00", date: "Hôm nay", durationMin: 60, status: "upcoming", participants: ["my-linh","duy-anh","quang-minh"], type: "review" },
  { id: "m3", title: "1:1 với CTO", project: "Nội bộ", time: "14:00", date: "Hôm nay", durationMin: 45, status: "upcoming", participants: ["nguyen-van-a-1","bao-ngoc"], type: "1-on-1" },
  { id: "m4", title: "Demo cho khách hàng – Y tế xã", project: "Y tế xã", time: "16:30", date: "Hôm nay", durationMin: 90, status: "upcoming", participants: ["tran-thi-b","do-tuan-nam","pham-minh-c","le-hoang-d"], type: "client" },
  { id: "m5", title: "Workshop AI Copilot", project: "UNI-HRM", time: "10:00", date: "Mai, 12/06", durationMin: 120, status: "upcoming", participants: ["nguyen-huong","duy-anh","my-linh","quang-minh","bao-ngoc","do-tuan-nam"], type: "workshop" },
  { id: "m6", title: "Retrospective Sprint 5", project: "STOS", time: "15:00", date: "Hôm qua", durationMin: 60, status: "ended", participants: ["nguyen-van-a-1","tran-thi-b","pham-minh-c","le-hoang-d","nguyen-huong","do-tuan-nam"], recording: true, type: "review" },
  { id: "m7", title: "Kick-off – Dự án UNI-HRM", project: "UNI-HRM", time: "09:00", date: "09/06", durationMin: 90, status: "ended", participants: ["nguyen-van-a-1","duy-anh","my-linh","bao-ngoc"], recording: true, type: "workshop" },
];

const ROOMS = [
  { name: "Phòng họp lớn – Tầng 5", capacity: 30, free: true, equipment: ["TV 75\"", "Polycom", "Whiteboard"] },
  { name: "Hội trường A", capacity: 80, free: false, equipment: ["Projector", "Mic không dây"] },
  { name: "Phòng nhỏ – Tầng 3", capacity: 8, free: true, equipment: ["TV 55\"", "Jabra"] },
  { name: "Phòng nhỏ – Tầng 4", capacity: 6, free: true, equipment: ["TV 55\""] },
];

const typeLabel: Record<string, { text: string; cls: string }> = {
  standup:  { text: "Standup",   cls: "bg-emerald-500/15 text-emerald-300" },
  review:   { text: "Review",    cls: "bg-sky-500/15 text-sky-300" },
  "1-on-1": { text: "1:1",       cls: "bg-violet-500/15 text-violet-300" },
  client:   { text: "Khách hàng", cls: "bg-amber-500/15 text-amber-300" },
  workshop: { text: "Workshop",  cls: "bg-rose-500/15 text-rose-300" },
};

type Tab = "upcoming" | "live" | "ended" | "recordings" | "rooms";

function MeetingPage() {
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [q, setQ] = useState("");
  const [inRoom, setInRoom] = useState(false);

  if (inRoom) {
    return (
      <div className="flex min-h-screen bg-bg text-foreground">
        <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
        <main className="flex min-w-0 flex-1 flex-col">
          <AppTopbar variant="meeting" onOpenSidebar={() => setOpen(true)} />
          <LiveMeetingRoom onExit={() => setInRoom(false)} />
        </main>
      </div>
    );
  }

  const list = MEETINGS.filter((m) => {
    if (tab === "live" && m.status !== "live") return false;
    if (tab === "upcoming" && m.status !== "upcoming" && m.status !== "live") return false;
    if (tab === "ended" && m.status !== "ended") return false;
    if (tab === "recordings" && !m.recording) return false;
    if (q && !`${m.title} ${m.project}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} onNew={() => setInRoom(true)} />

        {tab === "rooms" ? null : null}

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          {/* Main column */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            {/* Header */}
            <div className="border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">Họp</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lên lịch, tham gia và xem lại cuộc họp với AI Copilot.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setInRoom(true)} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <VideoIcon className="h-4 w-4" /> Bắt đầu họp ngay
                  </button>
                  <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40">
                    <Calendar className="h-4 w-4" /> Lên lịch
                  </button>
                  <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40">
                    <Link2 className="h-4 w-4" /> Tham gia bằng mã
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Hôm nay" value="4" sub="cuộc họp" icon={Calendar} color="text-primary" />
                <StatCard label="Đang diễn ra" value="1" sub="LIVE" icon={Circle} color="text-destructive" />
                <StatCard label="Bản ghi tuần này" value="12" sub="2.4 GB" icon={Video} color="text-sky-300" />
                <StatCard label="Tóm tắt AI" value="38" sub="tháng này" icon={Sparkles} color="text-violet-300" />
              </div>
            </div>

            {/* Tabs + search */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/95 px-6 py-3 backdrop-blur">
              <div className="flex gap-1 rounded-lg bg-surface p-1 text-sm">
                {([
                  ["upcoming", "Sắp tới"],
                  ["live", "Đang diễn ra"],
                  ["ended", "Đã kết thúc"],
                  ["recordings", "Bản ghi"],
                  ["rooms", "Phòng họp"],
                ] as [Tab, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm cuộc họp…"
                    className="w-56 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <button className="rounded-lg border border-border bg-surface p-2 text-muted-foreground hover:text-foreground">
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body by tab */}
            <div className="px-6 py-5">
              {tab === "rooms" ? (
                <RoomsGrid />
              ) : (
                <div className="space-y-3">
                  {list.map((m) => (
                    <MeetingRow key={m.id} m={m} onJoin={() => setInRoom(true)} />
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                      Không có cuộc họp nào phù hợp.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right panel */}
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
            <MiniCalendar />
            <div className="border-t border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sắp diễn ra</h3>
                <button className="text-xs text-primary hover:underline">Tất cả</button>
              </div>
              <div className="space-y-2">
                {MEETINGS.filter((m) => m.status === "upcoming").slice(0, 3).map((m) => (
                  <button key={m.id} className="w-full rounded-lg border border-border bg-bg p-3 text-left hover:border-primary/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{m.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{m.project} · {m.durationMin}p</div>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${typeLabel[m.type].cls}`}>{typeLabel[m.type].text}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.time} · {m.date}</span>
                      <div className="flex -space-x-1.5">
                        {m.participants.slice(0, 3).map((s) => (
                          <img key={s} src={avatar(s)} alt="" className="h-5 w-5 rounded-full border border-surface object-cover" />
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Tích hợp</h3>
              <div className="space-y-2 text-sm">
                {[
                  { name: "Google Calendar", on: true },
                  { name: "Outlook 365", on: true },
                  { name: "Zalo OA Notify", on: true },
                  { name: "Slack Reminders", on: false },
                ].map((i) => (
                  <div key={i.name} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
                    <span className="text-muted-foreground">{i.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${i.on ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-2 text-muted-foreground"}`}>
                      {i.on ? "Đang bật" : "Tắt"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: any; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function MeetingRow({ m, onJoin }: { m: typeof MEETINGS[number]; onJoin: () => void }) {
  const live = m.status === "live";
  const ended = m.status === "ended";
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4 ${live ? "border-destructive/40" : "border-border"} hover:border-primary/40`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${live ? "bg-destructive/15 text-destructive" : ended ? "bg-surface-2 text-muted-foreground" : "bg-primary/15 text-primary"}`}>
        {live ? <Circle className="h-5 w-5 fill-current" /> : ended ? <CheckCircle2 className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{m.title}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${typeLabel[m.type].cls}`}>{typeLabel[m.type].text}</span>
          {live && <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive"><Circle className="h-1.5 w-1.5 fill-current" /> LIVE</span>}
          {m.recording && !live && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Video className="h-3 w-3" /> Có bản ghi</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" /> {m.project}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {m.date} · {m.time} · {m.durationMin}p</span>
          <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {m.participants.length} người</span>
        </div>
      </div>
      <div className="flex -space-x-2">
        {m.participants.slice(0, 4).map((s) => (
          <img key={s} src={avatar(s)} alt="" className="h-7 w-7 rounded-full border-2 border-surface object-cover" />
        ))}
        {m.participants.length > 4 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px]">+{m.participants.length - 4}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {ended ? (
          <>
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/40">
              <PlayCircle className="h-3.5 w-3.5" /> Xem lại
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/40">
              <FileText className="h-3.5 w-3.5" /> Tóm tắt
            </button>
          </>
        ) : (
          <>
            <button onClick={onJoin} className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium ${live ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
              <ArrowUpRight className="h-3.5 w-3.5" /> {live ? "Tham gia" : "Vào phòng"}
            </button>
            <button className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RoomsGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {ROOMS.map((r) => (
        <div key={r.name} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> Sức chứa {r.capacity} người
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.free ? "bg-emerald-500/15 text-emerald-300" : "bg-destructive/15 text-destructive"}`}>
              {r.free ? "Trống" : "Đang dùng"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.equipment.map((e) => (
              <span key={e} className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">{e}</span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={!r.free} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Đặt phòng
            </button>
            <button className="rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/40">
              Lịch sử
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniCalendar() {
  const today = 10;
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const events: Record<number, number> = { 10: 4, 11: 2, 12: 3, 13: 1, 16: 2, 17: 1, 20: 5 };
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tháng 6, 2026</h3>
        <div className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /></button>
          <button className="rounded p-1 hover:bg-surface-2"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["T2","T3","T4","T5","T6","T7","CN"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d === today;
          const has = events[d];
          return (
            <button
              key={d}
              className={`relative aspect-square rounded text-xs ${
                isToday ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-surface-2 text-foreground"
              }`}
            >
              {d}
              {has && !isToday && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ====================== LIVE ROOM (existing) ====================== */

function VideoTile({ name, seed, highlight }: { name: string; seed: string; highlight?: boolean }) {
  return (
    <div className={`video-tile ${highlight ? "ring-2 ring-primary/70" : ""}`}>
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

function ControlButton({ icon: Icon, label, badge, danger, onClick }: { icon: any; label: string; badge?: number; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className={`relative flex h-11 w-11 items-center justify-center rounded-full ${danger ? "bg-destructive text-destructive-foreground" : "bg-surface-2 text-foreground hover:bg-surface-2/70"}`}>
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

function LiveMeetingRoom({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden xl:flex-row">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <button onClick={onExit} className="rounded p-1 hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /></button>
              <Hash className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">Sprint-6</span>
              <span>/</span>
              <span>Họp</span>
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">Sprint 6 – Daily Standup</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> LiveKit Meeting</span>
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> 16 người</span>
              <span className="flex items-center gap-1.5"><Circle className="h-2 w-2 fill-destructive text-destructive" /> Đang ghi</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Mời</button>
            <button className="rounded-lg bg-surface-2 p-2"><MoreHorizontal className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="video-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          <VideoTile name={participants[0].name} seed={participants[0].seed} highlight />
          <VideoTile name={participants[1].name} seed={participants[1].seed} />
          <VideoTile name={participants[2].name} seed={participants[2].seed} />
          <VideoTile name={participants[3].name} seed={participants[3].seed} />
          <VideoTile name={participants[4].name} seed={participants[4].seed} />
          <VideoTile name={participants[5].name} seed={participants[5].seed} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-5">
          <ControlButton icon={MicOff} label="Bật mic" />
          <ControlButton icon={VideoIcon} label="Bật camera" />
          <ControlButton icon={Monitor} label="Chia sẻ" />
          <ControlButton icon={Hand} label="Giơ tay" />
          <ControlButton icon={MessageCircle} label="Chat" />
          <ControlButton icon={Users} label="Người tham gia" badge={16} />
          <ControlButton icon={Sparkles} label="AI Copilot" />
          <ControlButton icon={PhoneOff} label="Rời" danger onClick={onExit} />
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface xl:w-80 xl:border-l xl:border-t-0 2xl:w-96">
        <div className="flex gap-5 overflow-x-auto border-b border-border px-5 pt-4 text-sm">
          <button className="border-b-2 border-primary pb-3 font-medium">AI Copilot</button>
          <button className="pb-3 text-muted-foreground">Chat</button>
          <button className="pb-3 text-muted-foreground">Người tham gia (16)</button>
          <button className="pb-3 text-muted-foreground">Tệp</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold">AI Meeting Assistant</span>
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BETA</span>
          </div>
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">Tóm tắt cuộc họp</div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• API Gateway đã hoàn thành 90%</li>
              <li>• Dashboard UI còn 2 task quan trọng</li>
              <li>• Mobile App đang tích hợp Auth Service</li>
              <li>• Kế hoạch release: 30/06/2025</li>
            </ul>
          </div>
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4 text-success" /> Việc cần làm</div>
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
            <button className="mt-2 flex items-center gap-1 text-xs text-primary"><Plus className="h-3 w-3" /> Thêm việc</button>
          </div>
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4 text-primary" /> Tiến độ</div>
            <div className="mb-1 flex justify-between text-xs"><span>Sprint 6</span><span>72%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-[72%] rounded-full bg-success" />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Hoàn thành 18 / 25 việc</div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium"><Video className="h-4 w-4 text-primary" /> Bản ghi</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-destructive"><Circle className="h-1.5 w-1.5 fill-current" /> REC</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-2 p-2 text-xs">
              <span className="flex items-center gap-2"><Circle className="h-2 w-2 fill-destructive text-destructive" /> Đang ghi</span>
              <span className="font-mono">00:28:45</span>
            </div>
            <button className="mt-2 w-full rounded-lg border border-primary/40 bg-primary/10 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              <Download className="mr-1 inline h-3.5 w-3.5" /> Tải bản ghi
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* keep referenced for typing */
void AlertCircle; void Star;
