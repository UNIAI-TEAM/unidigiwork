import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Hash, Lock, Plus, Search as SearchIcon, Send, Star, Users, X, Trash2, LogOut, Loader2, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  listChatChannels, listChatMessages, sendChatMessage, createChatChannel, joinChatChannel,
  leaveChatChannel, setChatFavorite, markChatChannelRead, deleteChatChannel, deleteChatMessage,
  type ChatChannelDTO,
} from "@/lib/api/chat.functions";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export function ChatWorkspace({ initialChannelId }: { initialChannelId?: string }) {
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchChannels = useServerFn(listChatChannels);
  const fetchMessages = useServerFn(listChatMessages);
  const doSend = useServerFn(sendChatMessage);
  const doCreate = useServerFn(createChatChannel);
  const doJoin = useServerFn(joinChatChannel);
  const doLeave = useServerFn(leaveChatChannel);
  const doFav = useServerFn(setChatFavorite);
  const doRead = useServerFn(markChatChannelRead);
  const doDeleteChannel = useServerFn(deleteChatChannel);
  const doDeleteMessage = useServerFn(deleteChatMessage);

  const [activeId, setActiveId] = useState<string | null>(initialChannelId ?? null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const channelsQ = useQuery({ queryKey: ["chat", "channels"], queryFn: () => fetchChannels({}) });
  const channels = channelsQ.data?.channels ?? [];

  useEffect(() => {
    if (!activeId && channels.length > 0) setActiveId(channels[0].id);
  }, [activeId, channels]);

  const active = useMemo(() => channels.find((c) => c.id === activeId) ?? null, [channels, activeId]);

  const messagesQ = useQuery({
    queryKey: ["chat", "messages", activeId, query],
    queryFn: () => fetchMessages({ data: { channelId: activeId!, q: query || undefined } }),
    enabled: !!activeId && !!active?.isMember,
  });
  const messages = messagesQ.data ?? [];

  // Realtime
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`chat-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
        qc.invalidateQueries({ queryKey: ["chat", "channels"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [activeId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (activeId && active?.isMember && (active?.unread ?? 0) > 0) {
      doRead({ data: { channelId: activeId } }).then(() => qc.invalidateQueries({ queryKey: ["chat", "channels"] }));
    }
  }, [activeId, active?.isMember, active?.unread, doRead, qc]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["chat"] });
  };

  const sendM = useMutation({
    mutationFn: (body: string) => doSend({ data: { channelId: activeId!, body } }),
    onSuccess: () => { setInput(""); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không gửi được tin nhắn"),
  });
  const createM = useMutation({
    mutationFn: () => doCreate({ data: { name: newName.trim(), isPrivate: newPrivate } }),
    onSuccess: (r: { id: string }) => {
      setCreating(false); setNewName(""); setNewPrivate(false); setActiveId(r.id);
      toast.success("Đã tạo kênh"); refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được kênh"),
  });
  const joinM = useMutation({
    mutationFn: (id: string) => doJoin({ data: { channelId: id } }),
    onSuccess: () => { toast.success("Đã tham gia kênh"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không tham gia được"),
  });
  const leaveM = useMutation({
    mutationFn: (id: string) => doLeave({ data: { channelId: id } }),
    onSuccess: () => { toast.success("Đã rời kênh"); refreshAll(); },
  });
  const favM = useMutation({
    mutationFn: (v: { id: string; value: boolean }) => doFav({ data: { channelId: v.id, value: v.value } }),
    onSuccess: refreshAll,
  });
  const delChM = useMutation({
    mutationFn: (id: string) => doDeleteChannel({ data: { channelId: id } }),
    onSuccess: () => { setActiveId(null); toast.success("Đã xoá kênh"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được kênh"),
  });
  const delMsgM = useMutation({
    mutationFn: (id: string) => doDeleteMessage({ data: { messageId: id } }),
    onSuccess: () => { toast.success("Đã xoá tin nhắn"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được tin nhắn"),
  });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return channels.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [channels, filter]);
  const favs = visible.filter((c) => c.isFavorite);
  const joined = visible.filter((c) => c.isMember && !c.isFavorite);
  const others = visible.filter((c) => !c.isMember);

  const openChannel = (c: ChatChannelDTO) => {
    setActiveId(c.id);
    if (initialChannelId) void navigate({ to: "/chat" });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar active="chat" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="flex min-h-0 flex-1">
          {/* Channel list */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="flex items-center justify-between px-4 py-3.5">
              <h2 className="text-sm font-semibold">Kênh trò chuyện</h2>
              <button
                onClick={() => setCreating((v) => !v)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                aria-label="Tạo kênh mới"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Lọc kênh…"
                  className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                {filter && (
                  <button onClick={() => setFilter("")} aria-label="Xoá lọc">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>

            {creating && (
              <div className="mx-3 mb-3 space-y-2 rounded-xl border border-border bg-surface-2/60 p-3">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ten-kenh"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
                  Kênh riêng tư
                </label>
                <div className="flex gap-2">
                  <button
                    disabled={!newName.trim() || createM.isPending}
                    onClick={() => createM.mutate()}
                    className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {createM.isPending ? "Đang tạo…" : "Tạo kênh"}
                  </button>
                  <button onClick={() => setCreating(false)} className="rounded-md border border-border px-2 py-1.5 text-xs">
                    Huỷ
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
              {channelsQ.isLoading && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
                </div>
              )}
              {[
                { label: "Yêu thích", items: favs },
                { label: "Kênh của tôi", items: joined },
                { label: "Kênh khác", items: others },
              ].map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.label}>
                    <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </div>
                    {group.items.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openChannel(c)}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                          activeId === c.id
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        }`}
                      >
                        {c.isPrivate ? <Lock className="h-4 w-4 shrink-0" /> : <Hash className="h-4 w-4 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate text-left">{c.name}</span>
                        {c.unread > 0 && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ),
              )}
              {!channelsQ.isLoading && channels.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Chưa có kênh nào. Tạo kênh đầu tiên để bắt đầu trò chuyện.
                </p>
              )}
            </div>
          </aside>

          {/* Conversation */}
          <section className="flex min-w-0 flex-1 flex-col">
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                <MessageCircle className="h-10 w-10" />
                <p className="text-sm">Chọn một kênh để bắt đầu trò chuyện</p>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {active.isPrivate ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Hash className="h-5 w-5 text-muted-foreground" />}
                      <h1 className="truncate text-lg font-semibold">{active.name}</h1>
                      {active.isMember && (
                        <button
                          onClick={() => favM.mutate({ id: active.id, value: !active.isFavorite })}
                          aria-label="Yêu thích"
                        >
                          <Star className={`h-4 w-4 ${active.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                        </button>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {active.description && <span>{active.description}</span>}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {active.memberCount} thành viên
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 sm:flex">
                      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Tìm tin nhắn…"
                        className="w-40 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                      />
                      {query && (
                        <button onClick={() => setQuery("")} aria-label="Xoá tìm kiếm">
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    {active.isMember && !active.isOwner && (
                      <button
                        onClick={() => leaveM.mutate(active.id)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        aria-label="Rời kênh"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    )}
                    {active.isOwner && (
                      <button
                        onClick={() => { if (confirm(`Xoá kênh #${active.name}?`)) delChM.mutate(active.id); }}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Xoá kênh"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </header>

                {!active.isMember ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3">
                    <p className="text-sm text-muted-foreground">Bạn chưa tham gia kênh này.</p>
                    <button
                      onClick={() => joinM.mutate(active.id)}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      Tham gia kênh
                    </button>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                      {messagesQ.isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải tin nhắn…
                        </div>
                      )}
                      {!messagesQ.isLoading && messages.length === 0 && (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                          {query ? "Không tìm thấy tin nhắn nào" : "Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện."}
                        </p>
                      )}
                      {messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                        return (
                          <div key={m.id}>
                            {newDay && (
                              <div className="my-4 flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{dayLabel(m.createdAt)}</span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            )}
                            <div className="group flex gap-3">
                              <img src={avatar(m.authorId)} alt="" className="h-9 w-9 shrink-0 rounded-lg" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{m.authorName}</span>
                                  <span className="text-[11px] text-muted-foreground">{timeLabel(m.createdAt)}</span>
                                  {m.editedAt && <span className="text-[11px] text-muted-foreground">(đã sửa)</span>}
                                  {m.isMine && (
                                    <button
                                      onClick={() => delMsgM.mutate(m.id)}
                                      className="opacity-0 transition-opacity group-hover:opacity-100"
                                      aria-label="Xoá tin nhắn"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  )}
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{m.body}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-border p-4">
                      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                        <textarea
                          rows={1}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (input.trim()) sendM.mutate(input.trim());
                            }
                          }}
                          placeholder={`Nhắn tin tới #${active.name}`}
                          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none"
                        />
                        <button
                          disabled={!input.trim() || sendM.isPending}
                          onClick={() => sendM.mutate(input.trim())}
                          className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"
                          aria-label="Gửi"
                        >
                          {sendM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
