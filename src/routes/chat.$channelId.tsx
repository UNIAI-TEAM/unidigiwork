import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Hash,
  Paperclip,
  Send,
  Smile,
  Users,
  Pin,
  Search,
  Phone,
  Video,
  Info,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/chat/$channelId")({
  head: ({ params }) => ({
    meta: [{ title: `#${params.channelId} · UNIWORK Chat` }],
  }),
  component: ChannelPage,
});

const channels = [
  { id: "general", name: "general", unread: 0 },
  { id: "design", name: "design", unread: 3 },
  { id: "backend", name: "backend", unread: 0 },
  { id: "random", name: "random", unread: 12 },
];

const dms = [
  { id: "minh-anh", name: "Minh Anh", online: true },
  { id: "tuan-nam-ba", name: "Tuấn Nam", online: true },
  { id: "huong-tran", name: "Hương Trần", online: false },
];

const messages = [
  { who: "Minh Anh", seed: "minh-anh", time: "10:02", text: "Mọi người check bản design mới giúp mình nhé." },
  { who: "Tuấn Nam", seed: "tuan-nam-ba", time: "10:05", text: "Looking good 👌" },
  { who: "Hương Trần", seed: "huong-tran", time: "10:07", text: "Phần header cần tăng contrast một chút." },
  { who: "Minh Anh", seed: "minh-anh", time: "10:09", text: "Ok mình update lại buổi chiều." },
];

function ChannelPage() {
  const { channelId } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [msg, setMsg] = useState("");

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="chat" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="border-b border-border p-3">
              <Link to="/chat" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Tất cả tin nhắn
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Kênh</div>
              {channels.map((c) => (
                <Link
                  key={c.id}
                  to="/chat/$channelId"
                  params={{ channelId: c.id }}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${c.id === channelId ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                >
                  <Hash className="h-4 w-4" />
                  <span className="flex-1">{c.name}</span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{c.unread}</span>
                  )}
                </Link>
              ))}
              <div className="mt-4 px-2 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Tin nhắn riêng</div>
              {dms.map((d) => (
                <Link
                  key={d.id}
                  to="/chat/$channelId"
                  params={{ channelId: d.id }}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${d.id === channelId ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                >
                  <span className="relative">
                    <img src={avatar(d.id)} className="h-5 w-5 rounded-full" alt="" />
                    {d.online && <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-surface" />}
                  </span>
                  <span className="flex-1 truncate">{d.name}</span>
                </Link>
              ))}
            </div>
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <h1 className="text-base font-semibold">{channelId}</h1>
                <span className="text-xs text-muted-foreground">· 24 thành viên</span>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn icon={Phone} />
                <IconBtn icon={Video} />
                <IconBtn icon={Pin} />
                <IconBtn icon={Search} />
                <IconBtn icon={Info} />
              </div>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <div className="rounded-lg border border-border bg-surface/40 p-4 text-sm">
                <h2 className="text-base font-semibold">#{channelId}</h2>
                <p className="mt-1 text-muted-foreground">
                  Đây là khởi đầu của kênh. Hãy mở đầu cuộc trò chuyện 👋
                </p>
              </div>
              {messages.map((m, i) => (
                <div key={i} className="flex gap-3">
                  <img src={avatar(m.seed)} className="h-9 w-9 rounded-full" alt="" />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="text-sm font-medium text-foreground">{m.who}</span>
                      <span className="text-muted-foreground">{m.time}</span>
                    </div>
                    <div className="mt-0.5 text-sm">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2 rounded-lg border border-border bg-surface p-2 focus-within:border-primary">
                <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  rows={1}
                  placeholder={`Nhắn tới #${channelId}`}
                  className="flex-1 resize-none bg-transparent text-sm focus:outline-none"
                />
                <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Smile className="h-4 w-4" />
                </button>
                <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </main>

          <aside className="hidden w-56 shrink-0 border-l border-border bg-surface/40 p-4 lg:block">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Thành viên
            </div>
            <ul className="space-y-2 text-sm">
              {[...dms, { id: "duy-anh", name: "Duy Anh", online: true }, { id: "bao-ngoc", name: "Bảo Ngọc", online: false }].map((u) => (
                <li key={u.id} className="flex items-center gap-2">
                  <span className="relative">
                    <img src={avatar(u.id)} className="h-6 w-6 rounded-full" alt="" />
                    {u.online && <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-surface" />}
                  </span>
                  <span>{u.name}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}