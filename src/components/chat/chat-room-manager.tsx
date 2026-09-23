// Quản lý phòng chat của tổ chức: tạo phòng, xoá phòng, thêm/gỡ thành viên (API thật, RLS).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plus, Search, Settings2, Trash2, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addChatChannelMember,
  createChatChannel,
  deleteChatChannel,
  listChatChannelMembers,
  listChatChannels,
  listChatPeople,
  removeChatChannelMember,
} from "@/lib/api/chat.functions";
import { useI18n } from "@/lib/i18n";

export function ChatRoomManagerButton({
  onCreated,
  invalidateKeys = [["native-chat-channels"], ["mobile-chat-channels"]],
}: {
  onCreated?: (channelId: string) => void;
  invalidateKeys?: string[][];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");

  const listFn = useServerFn(listChatChannels);
  const createFn = useServerFn(createChatChannel);
  const deleteFn = useServerFn(deleteChatChannel);
  const membersFn = useServerFn(listChatChannelMembers);
  const peopleFn = useServerFn(listChatPeople);
  const addFn = useServerFn(addChatChannelMember);
  const removeFn = useServerFn(removeChatChannelMember);

  const refresh = () => {
    for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["chat-manager-channels"] });
    void qc.invalidateQueries({ queryKey: ["chat-manager-members"] });
    void qc.invalidateQueries({ queryKey: ["chat-manager-people"] });
  };

  const { data } = useQuery({
    queryKey: ["chat-manager-channels"],
    queryFn: () => listFn(),
    enabled: open,
    staleTime: 10_000,
  });

  const rooms = useMemo(
    () => (data?.channels ?? []).filter((c) => c.kind === "channel" && !c.meetingId && !c.taskId),
    [data],
  );

  const { data: members } = useQuery({
    queryKey: ["chat-manager-members", managing],
    queryFn: () => membersFn({ data: { channelId: managing as string } }),
    enabled: open && !!managing,
  });

  const { data: people } = useQuery({
    queryKey: ["chat-manager-people", managing],
    queryFn: () => peopleFn({ data: { channelId: managing } }),
    enabled: open && !!managing,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), isPrivate } }),
    onSuccess: (r) => {
      setName("");
      setIsPrivate(false);
      refresh();
      const id = (r as { id?: string } | null)?.id;
      if (id) {
        setManaging(id);
        onCreated?.(id);
      }
      toast.success(t("m.chat.manage.created"));
    },
    onError: () => toast.error(t("m.chat.manage.createError")),
  });

  const remove = useMutation({
    mutationFn: (channelId: string) => deleteFn({ data: { channelId } }),
    onSuccess: () => {
      setManaging(null);
      refresh();
      toast.success(t("m.chat.manage.deleted"));
    },
    onError: () => toast.error(t("m.chat.manage.deleteError")),
  });

  const addMember = useMutation({
    mutationFn: (userId: string) => addFn({ data: { channelId: managing as string, userId } }),
    onSuccess: refresh,
    onError: () => toast.error(t("m.chat.manage.memberError")),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { channelId: managing as string, userId } }),
    onSuccess: refresh,
    onError: () => toast.error(t("m.chat.manage.memberError")),
  });

  const candidates = useMemo(() => {
    const all = people ?? [];
    const s = personQuery.trim().toLowerCase();
    const notMember = all.filter((p) => !p.isMember);
    return s ? notMember.filter((p) => p.name.toLowerCase().includes(s)) : notMember;
  }, [people, personQuery]);

  const activeRoom = rooms.find((r) => r.id === managing) ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="h-11 justify-start gap-2 rounded-2xl">
          <Settings2 className="h-4 w-4" />
          {t("m.chat.manage.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("m.chat.manage.title")}</DialogTitle>
        </DialogHeader>

        {/* Tạo phòng mới */}
        <div className="space-y-3 rounded-2xl border border-border p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("m.chat.manage.namePlaceholder")}
            className="h-11 rounded-2xl"
          />
          <div className="flex items-center justify-between">
            <Label htmlFor="chat-room-private" className="flex items-center gap-2 text-sm">
              <Lock className="h-3.5 w-3.5" /> {t("m.chat.manage.private")}
            </Label>
            <Switch id="chat-room-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <Button
            className="h-11 w-full gap-2 rounded-2xl"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4" /> {t("m.chat.manage.create")}
          </Button>
        </div>

        {/* Danh sách phòng */}
        <div className="space-y-1">
          {rooms.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">{t("m.chat.empty")}</p>
          )}
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`rounded-2xl px-3 py-2 ${managing === room.id ? "bg-surface-2" : ""}`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManaging(managing === room.id ? null : room.id)}
                  className="min-h-11 flex-1 truncate text-left text-sm font-medium"
                >
                  {room.name}
                  {room.isGeneral && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("m.chat.badgeGeneral")}
                    </span>
                  )}
                </button>
                {!room.isGeneral && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-destructive"
                    aria-label={t("m.chat.manage.delete")}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(room.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {managing === room.id && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("m.chat.manage.members")}
                  </p>
                  <div className="space-y-1">
                    {(members ?? []).map((m) => (
                      <div key={m.userId} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          aria-label={t("m.chat.manage.removeMember")}
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate(m.userId)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={personQuery}
                      onChange={(e) => setPersonQuery(e.target.value)}
                      placeholder={t("m.chat.manage.addMember")}
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {candidates.map((p) => (
                      <button
                        key={p.userId}
                        disabled={addMember.isPending}
                        onClick={() => addMember.mutate(p.userId)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm transition hover:bg-surface"
                      >
                        <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {activeRoom ? null : null}
      </DialogContent>
    </Dialog>
  );
}
