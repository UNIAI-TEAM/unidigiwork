// Nút "Nhắn riêng": chọn một thành viên trong tổ chức và mở phòng 1-1 (API thật, RLS).
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { openDirectMessage } from "@/lib/api/chat.functions";
import { listWorkGraphAssignees } from "@/lib/api/work-graph.functions";
import { useI18n } from "@/lib/i18n";

export function NewDirectMessageButton({ onOpened }: { onOpened: (channelId: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const listPeople = useServerFn(listWorkGraphAssignees);
  const openDm = useServerFn(openDirectMessage);

  const { data: people } = useQuery({
    queryKey: ["chat-dm-people"],
    queryFn: () => listPeople(),
    enabled: open,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const all = (people ?? []) as Array<{ id: string; name: string }>;
    const s = q.trim().toLowerCase();
    return s ? all.filter((p) => p.name.toLowerCase().includes(s)) : all;
  }, [people, q]);

  const start = useMutation({
    mutationFn: (userId: string) => openDm({ data: { userId } }),
    onSuccess: (r) => {
      const id = (r as { id?: string } | null)?.id;
      setOpen(false);
      if (id) onOpened(id);
    },
    onError: () => toast.error(t("m.chat.dmError")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="h-11 justify-start gap-2 rounded-2xl">
          <UserPlus className="h-4 w-4" />
          {t("m.chat.newDm")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("m.chat.pickPerson")}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("m.chat.searchPlaceholder")}
            className="h-11 rounded-2xl pl-9"
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              disabled={start.isPending}
              onClick={() => start.mutate(p.id)}
              className="flex min-h-11 w-full items-center rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-surface-2"
            >
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("m.chat.empty")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
