import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Hash, Lock, Plus, Search as SearchIcon, Send, Star, Users, X, Trash2, LogOut, Loader2,
  Calendar as CalendarIcon,
  CheckCheck,
  MessageCircle, Pencil, Reply, Paperclip, Download, ChevronUp, UserPlus, Check, Shield, Eye, Pin, PinOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  listChatChannels, listChatMessages, sendChatMessage, createChatChannel, joinChatChannel,
  leaveChatChannel, setChatFavorite, markChatChannelRead, deleteChatChannel, deleteChatMessage,
  updateChatMessage, listChatChannelMembers, listChatPeople, addChatChannelMember,
  removeChatChannelMember, setChatMemberRole, openDirectMessage,
  listChatChannelReaders, listPinnedChatMessages, setChatMessagePin,
  type ChatChannelDTO, type ChatMessageDTO, type ChatAttachment, type ChatReaderDTO,
} from "@/lib/api/chat.functions";

const BUCKET = "chat-attachments";

/** Danh sách người đã xem một tin nhắn (dựa trên mốc đã đọc của từng thành viên). */
function ReadReceipts({ readers, message, isDm }: { readers: ChatReaderDTO[]; message: ChatMessageDTO; isDm?: boolean }) {
  const seen = readers.filter(
    (r) => r.userId !== message.authorId && r.lastReadAt && new Date(r.lastReadAt) >= new Date(message.createdAt),
  );
  if (seen.length === 0) return null;
  const label = seen.map((r) => (r.isMe ? "Bạn" : r.name)).join(", ");
  if (isDm) {
    const other = seen[0];
    return (
      <div className="mt-1 flex items-center gap-1.5" title={`Đã xem: ${label}`}>
        <CheckCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] text-muted-foreground">
          {other.isMe ? "Bạn đã xem" : `${other.name} đã xem`} lúc {timeLabel(other.lastReadAt!)}
        </span>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-1.5" title={`Đã xem: ${label}`}>
      <Eye className="h-3 w-3 text-muted-foreground" />
      <div className="flex -space-x-1.5">
        {seen.slice(0, 4).map((r) => (
          <img key={r.userId} src={avatar(r.userId)} alt={r.name} className="h-4 w-4 rounded-full ring-1 ring-background" />
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {seen.length > 4 ? `Đã xem bởi ${seen.length} người` : `Đã xem bởi ${label}`}
      </span>
    </div>
  );
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}
function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Tô sáng @mention trong nội dung tin nhắn. */
function MessageBody({ body }: { body: string }) {
  const parts = body.split(/(@[\p{L}\p{N}_.-]+)/gu);
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="rounded bg-primary/15 px-1 font-medium text-primary">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function AttachmentChip({ file }: { file: ChatAttachment }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, 60);
    setBusy(false);
    if (error || !data?.signedUrl) {
      toast.error("Không mở được tệp đính kèm");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  return (
    <button
      onClick={open}
      className="flex max-w-xs items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left text-xs hover:bg-surface"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <span className="shrink-0 text-muted-foreground">{sizeLabel(file.size)}</span>
    </button>
  );
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
  const doUpdateMessage = useServerFn(updateChatMessage);
  const fetchMembers = useServerFn(listChatChannelMembers);
  const fetchPeople = useServerFn(listChatPeople);
  const doAddMember = useServerFn(addChatChannelMember);
  const doRemoveMember = useServerFn(removeChatChannelMember);
  const doSetRole = useServerFn(setChatMemberRole);
  const doOpenDm = useServerFn(openDirectMessage);
  const fetchReaders = useServerFn(listChatChannelReaders);

  const [activeId, setActiveId] = useState<string | null>(initialChannelId ?? null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [older, setOlder] = useState<ChatMessageDTO[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const channelsQ = useQuery({ queryKey: ["chat", "channels"], queryFn: () => fetchChannels({}) });
  const channels = channelsQ.data?.channels ?? [];

  useEffect(() => {
    if (!activeId && channels.length > 0) setActiveId(channels[0].id);
  }, [activeId, channels]);

  const active = useMemo(() => channels.find((c) => c.id === activeId) ?? null, [channels, activeId]);

  const fromISO = dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined;
  const toISO = dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined;
  const searchActive = !!(query || dateFrom || dateTo);

  const messagesQ = useQuery({
    queryKey: ["chat", "messages", activeId, query, dateFrom, dateTo],
    queryFn: () => fetchMessages({ data: { channelId: activeId!, q: query || undefined, from: fromISO, to: toISO } }),
    enabled: !!activeId && !!active?.isMember,
  });
  const recent = messagesQ.data?.messages ?? [];
  const hasMore = messagesQ.data?.hasMore ?? false;
  const messages = useMemo(() => [...older, ...recent], [older, recent]);

  const membersQ = useQuery({
    queryKey: ["chat", "members", activeId],
    queryFn: () => fetchMembers({ data: { channelId: activeId! } }),
    enabled: !!activeId && showMembers,
  });
  const peopleQ = useQuery({
    queryKey: ["chat", "people", activeId],
    queryFn: () => fetchPeople({ data: { channelId: activeId ?? null } }),
    enabled: showPeople || showMembers || mentionQuery !== null,
  });
  const people = peopleQ.data ?? [];

  const readersQ = useQuery({
    queryKey: ["chat", "readers", activeId],
    queryFn: () => fetchReaders({ data: { channelId: activeId! } }),
    enabled: !!activeId && !!active?.isMember,
    // Gộp nhiều sự kiện đọc gần nhau: dữ liệu còn "tươi" trong 2s nên không refetch dồn dập.
    staleTime: 2000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
  const readers = readersQ.data ?? [];

  const fetchPinned = useServerFn(listPinnedChatMessages);
  const doPin = useServerFn(setChatMessagePin);
  const pinnedQ = useQuery({
    queryKey: ["chat", "pinned", activeId],
    queryFn: () => fetchPinned({ data: { channelId: activeId! } }),
    enabled: !!activeId && !!active?.isMember,
  });
  const pinned = pinnedQ.data ?? [];
  const [showPinned, setShowPinned] = useState(false);
  const pinM = useMutation({
    mutationFn: (v: { messageId: string; pinned: boolean }) => doPin({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.pinned ? "Đã ghim tin nhắn" : "Đã bỏ ghim");
      setOlder([]);
      refreshAll();
    },
    onError: () => toast.error("Không thể ghim tin nhắn"),
  });

  // Reset trạng thái khi đổi kênh / từ khoá
  useEffect(() => {
    setOlder([]);
    setReplyTo(null);
    setEditing(null);
    setPending([]);
  }, [activeId, query, dateFrom, dateTo]);

  // Realtime cho kênh đang mở + toàn bộ danh sách kênh (badge chưa đọc)
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`chat-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [activeId, qc]);

  useEffect(() => {
    // Gom sự kiện realtime của chat_members (nhiều người đọc cùng lúc) rồi làm mới 1 lần.
    let membersTimer: ReturnType<typeof setTimeout> | null = null;
    const flushMembers = () => {
      if (membersTimer) return;
      membersTimer = setTimeout(() => {
        membersTimer = null;
        qc.invalidateQueries({ queryKey: ["chat", "readers"] });
        qc.invalidateQueries({ queryKey: ["chat", "members"] });
        qc.invalidateQueries({ queryKey: ["chat", "channels"] });
      }, 800);
    };
    const ch = supabase
      .channel("chat-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "channels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channels" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "channels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, flushMembers)
      .subscribe();
    return () => {
      if (membersTimer) clearTimeout(membersTimer);
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [recent.length]);

  const lastReadKeyRef = useRef<string | null>(null);
  const lastMessageId = recent.length ? recent[recent.length - 1]!.id : null;
  useEffect(() => {
    if (!activeId || !active?.isMember) return;
    // Chỉ gọi khi thực sự có tin mới nhất khác lần trước → tránh ghi DB lặp và refetch dồn dập.
    const key = `${activeId}:${lastMessageId ?? "empty"}`;
    if (lastReadKeyRef.current === key) return;
    lastReadKeyRef.current = key;
    const t = setTimeout(() => {
      void doRead({ data: { channelId: activeId } }).then(() => {
        qc.invalidateQueries({ queryKey: ["chat", "channels"] });
        qc.invalidateQueries({ queryKey: ["chat", "readers", activeId] });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [activeId, active?.isMember, lastMessageId, doRead, qc]);

  const refreshAll = () => { qc.invalidateQueries({ queryKey: ["chat"] }); };

  const loadOlder = useCallback(async () => {
    const first = messages[0];
    if (!first || !activeId) return;
    setLoadingOlder(true);
    try {
      const res = await fetchMessages({ data: { channelId: activeId, before: first.createdAt, q: query || undefined, from: fromISO, to: toISO } });
      setOlder((prev) => [...res.messages, ...prev]);
      if (!res.hasMore) toast.info("Đã tải hết lịch sử tin nhắn");
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, activeId, fetchMessages, query, fromISO, toISO]);

  const sendM = useMutation({
    mutationFn: () =>
      doSend({
        data: {
          channelId: activeId!,
          body: input.trim(),
          parentId: replyTo?.id ?? null,
          attachments: pending,
          mentions: Object.entries(mentioned)
            .filter(([, name]) => input.includes(`@${name}`))
            .map(([id]) => id),
        },
      }),
    onSuccess: () => {
      setInput(""); setReplyTo(null); setPending([]); setMentioned({}); refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không gửi được tin nhắn"),
  });
  const editM = useMutation({
    mutationFn: () => doUpdateMessage({ data: { messageId: editing!.id, body: editing!.body.trim() } }),
    onSuccess: () => { setEditing(null); setOlder([]); refreshAll(); toast.success("Đã cập nhật tin nhắn"); },
    onError: (e: any) => toast.error(e?.message ?? "Không sửa được tin nhắn"),
  });
  const createM = useMutation({
    mutationFn: () => doCreate({ data: { name: newName.trim(), isPrivate: newPrivate } }),
    onSuccess: (r: { id: string }) => {
      setCreating(false); setNewName(""); setNewPrivate(false); setActiveId(r.id);
      toast.success("Đã tạo kênh"); refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được kênh"),
  });
  const dmM = useMutation({
    mutationFn: (userId: string) => doOpenDm({ data: { userId } }),
    onSuccess: (r: { id: string }) => { setShowPeople(false); setActiveId(r.id); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không mở được tin nhắn riêng"),
  });
  const addMemberM = useMutation({
    mutationFn: (userId: string) => doAddMember({ data: { channelId: activeId!, userId } }),
    onSuccess: () => { toast.success("Đã thêm thành viên"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không thêm được thành viên"),
  });
  const removeMemberM = useMutation({
    mutationFn: (userId: string) => doRemoveMember({ data: { channelId: activeId!, userId } }),
    onSuccess: () => { toast.success("Đã gỡ thành viên"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không gỡ được thành viên"),
  });
  const roleM = useMutation({
    mutationFn: (v: { userId: string; role: "owner" | "member" }) =>
      doSetRole({ data: { channelId: activeId!, userId: v.userId, role: v.role } }),
    onSuccess: () => { toast.success("Đã cập nhật vai trò"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không đổi được vai trò"),
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
    onSuccess: () => { setOlder([]); toast.success("Đã xoá tin nhắn"); refreshAll(); },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được tin nhắn"),
  });

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !activeId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} vượt quá 20MB`);
          continue;
        }
        const path = `${activeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (error) { toast.error(`Tải lên thất bại: ${file.name}`); continue; }
        setPending((p) => [...p, { path, name: file.name, size: file.size, mime: file.type || "application/octet-stream" }]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onInputChange = (value: string) => {
    setInput(value);
    const m = /@([\p{L}\p{N}_.-]*)$/u.exec(value);
    setMentionQuery(m ? m[1] : null);
  };
  const applyMention = (userId: string, name: string) => {
    const token = name.replace(/\s+/g, "");
    setInput((v) => v.replace(/@([\p{L}\p{N}_.-]*)$/u, `@${token} `));
    setMentioned((m) => ({ ...m, [userId]: token }));
    setMentionQuery(null);
  };

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

  const mentionMatches = mentionQuery === null
    ? []
    : people.filter((p) => p.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar active="chat" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="flex min-h-0 flex-1">
          {/* Danh sách kênh */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="flex items-center justify-between px-4 py-3.5">
              <h2 className="text-sm font-semibold">Kênh trò chuyện</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setShowPeople((v) => !v); setCreating(false); }}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  aria-label="Nhắn tin riêng"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setCreating((v) => !v); setShowPeople(false); }}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  aria-label="Tạo kênh mới"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
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

            {showPeople && (
              <div className="mx-3 mb-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-2/60 p-2">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nhắn tin riêng
                </p>
                {peopleQ.isLoading && <p className="px-1 py-2 text-xs text-muted-foreground">Đang tải…</p>}
                {people.map((p) => (
                  <button
                    key={p.userId}
                    onClick={() => dmM.mutate(p.userId)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
                  >
                    <img src={avatar(p.userId)} alt="" className="h-6 w-6 rounded-md" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                ))}
                {!peopleQ.isLoading && people.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">Chưa có người nào khác trong tổ chức.</p>
                )}
              </div>
            )}

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

          {/* Cuộc trò chuyện */}
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
                    <button
                      onClick={() => setShowFilters((v) => !v)}
                      className={`rounded-lg p-2 hover:bg-surface-2 ${showFilters || dateFrom || dateTo ? "bg-surface-2 text-foreground" : "text-muted-foreground"}`}
                      aria-label="Lọc theo thời gian"
                      title="Lọc theo khoảng thời gian"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </button>
                    {active.isMember && (
                      <button
                        onClick={() => setShowMembers((v) => !v)}
                        className={`rounded-lg p-2 hover:bg-surface-2 ${showMembers ? "bg-surface-2 text-foreground" : "text-muted-foreground"}`}
                        aria-label="Thành viên kênh"
                      >
                        <Users className="h-4 w-4" />
                      </button>
                    )}
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

                {showFilters && (
                  <div className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
                    <div className="flex items-center gap-2 sm:hidden">
                      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Tìm tin nhắn…"
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm focus:outline-none"
                      />
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Từ ngày
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Đến ngày
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
                      />
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: "7 ngày", days: 7 },
                        { label: "30 ngày", days: 30 },
                        { label: "90 ngày", days: 90 },
                      ].map((p) => (
                        <button
                          key={p.days}
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getTime() - p.days * 86400000);
                            setDateFrom(start.toISOString().slice(0, 10));
                            setDateTo(now.toISOString().slice(0, 10));
                          }}
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {searchActive && (
                      <button
                        onClick={() => { setQuery(""); setDateFrom(""); setDateTo(""); }}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        Xoá bộ lọc
                      </button>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {searchActive ? `${messages.length} kết quả${hasMore ? "+" : ""}` : "Toàn bộ tin nhắn"}
                    </span>
                  </div>
                )}

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
                  <div className="flex min-h-0 flex-1">
                    <div className="flex min-w-0 flex-1 flex-col">
                      {pinned.length > 0 && (
                        <div className="border-b border-border bg-surface-2/60 px-5 py-2">
                          <button
                            onClick={() => setShowPinned((v) => !v)}
                            className="flex w-full items-center gap-2 text-left text-xs font-medium text-foreground"
                          >
                            <Pin className="h-3.5 w-3.5 text-primary" />
                            {pinned.length} tin nhắn đã ghim
                            <ChevronUp className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform ${showPinned ? "" : "rotate-180"}`} />
                          </button>
                          {showPinned && (
                            <ul className="mt-2 space-y-1.5">
                              {pinned.map((p) => (
                                <li key={p.id} className="flex items-start gap-2 rounded-md bg-background px-2.5 py-1.5">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs">
                                      <span className="font-medium">{p.authorName}</span>: {p.body}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Ghim bởi {p.pinnedByName ?? "Thành viên"} · {timeLabel(p.createdAt)}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => pinM.mutate({ messageId: p.id, pinned: false })}
                                    aria-label="Bỏ ghim tin nhắn"
                                    className="mt-0.5 shrink-0"
                                  >
                                    <PinOff className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        {messagesQ.isLoading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải tin nhắn…
                          </div>
                        )}
                        {!messagesQ.isLoading && (hasMore || older.length > 0) && (
                          <div className="flex justify-center">
                            <button
                              onClick={() => void loadOlder()}
                              disabled={loadingOlder}
                              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
                            >
                              {loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                              Tải tin nhắn cũ hơn
                            </button>
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
                                    {m.pinnedAt && (
                                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                        <Pin className="h-3 w-3" /> Đã ghim
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                      <button onClick={() => { setReplyTo(m); setEditing(null); }} aria-label="Trả lời">
                                        <Reply className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                      </button>
                                      <button
                                        onClick={() => pinM.mutate({ messageId: m.id, pinned: !m.pinnedAt })}
                                        aria-label={m.pinnedAt ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
                                      >
                                        {m.pinnedAt
                                          ? <PinOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                          : <Pin className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />}
                                      </button>
                                      {m.isMine && (
                                        <>
                                          <button onClick={() => { setEditing({ id: m.id, body: m.body }); setReplyTo(null); }} aria-label="Sửa tin nhắn">
                                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                          </button>
                                          <button onClick={() => delMsgM.mutate(m.id)} aria-label="Xoá tin nhắn">
                                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {m.parentId && (
                                    <div className="mb-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                                      <span className="font-medium">{m.parentAuthorName}</span>: {m.parentExcerpt}
                                    </div>
                                  )}

                                  {editing?.id === m.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        autoFocus
                                        rows={2}
                                        value={editing.body}
                                        onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          disabled={!editing.body.trim() || editM.isPending}
                                          onClick={() => editM.mutate()}
                                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                                        >
                                          Lưu
                                        </button>
                                        <button onClick={() => setEditing(null)} className="rounded-md border border-border px-2.5 py-1 text-xs">
                                          Huỷ
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <MessageBody body={m.body} />
                                  )}

                                  {m.attachments.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {m.attachments.map((f) => <AttachmentChip key={f.path} file={f} />)}
                                    </div>
                                  )}

                                  <ReadReceipts readers={readers} message={m} isDm={active.kind === "dm"} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-border p-4">
                        {replyTo && (
                          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
                            <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                              Trả lời <span className="font-medium">{replyTo.authorName}</span>: {replyTo.body.slice(0, 80)}
                            </span>
                            <button onClick={() => setReplyTo(null)} aria-label="Huỷ trả lời">
                              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </div>
                        )}
                        {pending.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {pending.map((f) => (
                              <span key={f.path} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs">
                                <Paperclip className="h-3 w-3 text-muted-foreground" />
                                <span className="max-w-[160px] truncate">{f.name}</span>
                                <button onClick={() => setPending((p) => p.filter((x) => x.path !== f.path))} aria-label="Bỏ tệp">
                                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative">
                          {mentionMatches.length > 0 && (
                            <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                              {mentionMatches.map((p) => (
                                <button
                                  key={p.userId}
                                  onClick={() => applyMention(p.userId, p.name)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                                >
                                  <img src={avatar(p.userId)} alt="" className="h-6 w-6 rounded-md" />
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                            <input ref={fileRef} type="file" multiple hidden onChange={(e) => void onPickFiles(e.target.files)} />
                            <button
                              onClick={() => fileRef.current?.click()}
                              disabled={uploading}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                              aria-label="Đính kèm tệp"
                            >
                              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            </button>
                            <textarea
                              rows={1}
                              value={input}
                              onChange={(e) => onInputChange(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  if (input.trim()) sendM.mutate();
                                }
                              }}
                              placeholder={`Nhắn tin tới #${active.name} — gõ @ để nhắc tên`}
                              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none"
                            />
                            <button
                              disabled={!input.trim() || sendM.isPending}
                              onClick={() => sendM.mutate()}
                              className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"
                              aria-label="Gửi"
                            >
                              {sendM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Thành viên kênh */}
                    {showMembers && (
                      <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-surface lg:flex">
                        <div className="flex items-center justify-between px-4 py-3.5">
                          <h2 className="text-sm font-semibold">Thành viên kênh</h2>
                          <button onClick={() => setShowMembers(false)} aria-label="Đóng">
                            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </button>
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                          {membersQ.isLoading && <p className="px-2 py-2 text-xs text-muted-foreground">Đang tải…</p>}
                          {(membersQ.data ?? []).map((mem) => (
                            <div key={mem.userId} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                              <img src={avatar(mem.userId)} alt="" className="h-7 w-7 rounded-md" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{mem.name}{mem.isMe && " (bạn)"}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {mem.role === "owner" ? "Quản trị kênh" : "Thành viên"}
                                </p>
                              </div>
                              {active.isOwner && !mem.isMe && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                  <button
                                    onClick={() => roleM.mutate({ userId: mem.userId, role: mem.role === "owner" ? "member" : "owner" })}
                                    aria-label="Đổi vai trò"
                                  >
                                    <Shield className={`h-3.5 w-3.5 ${mem.role === "owner" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} />
                                  </button>
                                  <button onClick={() => removeMemberM.mutate(mem.userId)} aria-label="Gỡ thành viên">
                                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                          {active.isOwner && (
                            <div className="mt-3 border-t border-border pt-3">
                              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Thêm vào kênh
                              </p>
                              {people.filter((p) => !p.isMember).map((p) => (
                                <button
                                  key={p.userId}
                                  onClick={() => addMemberM.mutate(p.userId)}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                                >
                                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                </button>
                              ))}
                              {people.filter((p) => !p.isMember).length === 0 && (
                                <p className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
                                  <Check className="h-3.5 w-3.5" /> Tất cả đã ở trong kênh
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </aside>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
