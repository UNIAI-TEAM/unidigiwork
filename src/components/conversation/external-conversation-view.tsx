// Hiển thị hội thoại nhập từ Zalo/WhatsApp/Telegram/Viber dạng bong bóng như chat nội bộ.
// Quyền xem đặt theo từng hội thoại; máy chủ (RLS + RPC) quyết định, giao diện chỉ phản ánh.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getConversationImportAccess,
  getConversationSource,
  setConversationImportVisibility,
} from "@/lib/api/conversation-work.functions";
import { localeTag, useI18n } from "@/lib/i18n";

type Vis = "PRIVATE" | "TENANT" | "PROJECT" | "SELECTED";

export function ExternalConversationView({ importId }: { importId: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const sourceFn = useServerFn(getConversationSource);
  const [accessOpen, setAccessOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["conversation-source", importId],
    queryFn: () => sourceFn({ data: { sourceType: "IMPORT", sourceId: importId } }),
  });
  const src = data?.source;
  const messages = data?.messages ?? [];
  // Người chia sẻ (nếu khớp tên tác giả) hiển thị bên phải như tin của "mình".
  const mine = (src?.sharedBy ?? "").trim().toLowerCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <span className="truncate text-sm font-semibold">{src?.title}</span>
        {src && (
          <Badge variant="secondary" className="capitalize">
            {src.channel}
          </Badge>
        )}
        <Badge variant="outline">{t("cw.ext.manual")}</Badge>
        {src && <Badge variant="outline">{t(visKey(src.visibility as Vis))}</Badge>}
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            className="h-11 gap-1 px-2 text-xs"
            onClick={() => setAccessOpen(true)}
          >
            <ShieldCheck className="h-4 w-4" />
            {t("cw.ext.access")}
          </Button>
          <Button asChild variant="ghost" className="h-11 px-2 text-xs">
            <Link to="/conversations/$importId" params={{ importId }}>
              {t("cw.ext.openDetail")}
            </Link>
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{t("cw.ext.importedBy")}</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-2/3 rounded-2xl" />)}
        {isError && <p className="text-sm text-muted-foreground">{t("m.chat.error")}</p>}
        {messages.map((m) => {
          const own = !!mine && m.author.trim().toLowerCase() === mine;
          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={`flex ${own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  own ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground"
                }`}
              >
                {!own && <div className="mb-0.5 text-xs font-medium opacity-80">{m.author}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {m.sentAt && (
                  <div className="mt-1 text-[10px] opacity-70">
                    {new Date(m.sentAt).toLocaleString(locale)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <AccessDialog importId={importId} open={accessOpen} onOpenChange={setAccessOpen} />
    </div>
  );
}

function visKey(v: Vis) {
  return v === "PRIVATE"
    ? "cw.visPrivate"
    : v === "PROJECT"
      ? "cw.visProject"
      : v === "SELECTED"
        ? "cw.visSelected"
        : "cw.visTenant";
}

function AccessDialog({
  importId,
  open,
  onOpenChange,
}: {
  importId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const accessFn = useServerFn(getConversationImportAccess);
  const setFn = useServerFn(setConversationImportVisibility);
  const { data } = useQuery({
    queryKey: ["conversation-import-access", importId],
    queryFn: () => accessFn({ data: { importId } }),
    enabled: open,
  });
  const [vis, setVis] = useState<Vis>("TENANT");
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (data) {
      setVis(data.visibility as Vis);
      setIds(data.viewerIds);
    }
  }, [data]);
  const save = useMutation({
    mutationFn: () => setFn({ data: { importId, visibility: vis, viewerIds: ids } }),
    onSuccess: () => {
      toast.success(t("cw.ext.saved"));
      void qc.invalidateQueries({ queryKey: ["conversation-import-access", importId] });
      void qc.invalidateQueries({ queryKey: ["conversation-source", importId] });
      void qc.invalidateQueries({ queryKey: ["conversation-imports"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const canManage = !!data?.canManage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cw.ext.access")}</DialogTitle>
        </DialogHeader>
        {!canManage && data && (
          <p className="text-sm text-muted-foreground">{t("cw.ext.noManage")}</p>
        )}
        <Select value={vis} onValueChange={(v) => setVis(v as Vis)} disabled={!canManage}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TENANT">{t("cw.visTenant")}</SelectItem>
            {data?.hasProject && <SelectItem value="PROJECT">{t("cw.visProject")}</SelectItem>}
            <SelectItem value="SELECTED">{t("cw.visSelected")}</SelectItem>
            <SelectItem value="PRIVATE">{t("cw.visPrivate")}</SelectItem>
          </SelectContent>
        </Select>
        {vis === "SELECTED" && (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(data?.people ?? []).map((p) => (
              <label
                key={p.userId}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted/50"
              >
                <Checkbox
                  disabled={!canManage}
                  checked={ids.includes(p.userId)}
                  onCheckedChange={(c) =>
                    setIds((cur) => (c ? [...cur, p.userId] : cur.filter((x) => x !== p.userId)))
                  }
                />
                <span className="min-w-0 text-sm">
                  <span className="block truncate">{p.name || p.email}</span>
                  {p.email && (
                    <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button
            className="h-11"
            disabled={!canManage || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("cw.ext.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
