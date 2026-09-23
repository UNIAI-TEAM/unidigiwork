import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useI18n } from "@/lib/i18n";
import { saveConversationImport } from "@/lib/api/conversation-work.functions";

const CHANNELS = ["zalo", "whatsapp", "telegram", "viber", "other"] as const;

/** Tách các dòng "Người gửi: nội dung" thành danh sách tin nhắn. */
export function parsePastedConversation(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^([^:]{1,60}):\s*(.+)$/.exec(line);
      if (match && match[1] && match[2]) {
        return { authorLabel: match[1].trim(), body: match[2].trim() };
      }
      return { authorLabel: null, body: line };
    });
}

export function SaveToUniworkDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (importId: string) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("zalo");
  const [groupName, setGroupName] = useState("");
  const [sharedBy, setSharedBy] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "TENANT">("TENANT");
  const [notes, setNotes] = useState("");
  const [raw, setRaw] = useState("");

  const parsed = parsePastedConversation(raw);

  const save = useMutation({
    mutationFn: async () =>
      saveConversationImport({
        data: {
          sourceChannel: channel,
          sourceGroupName: groupName.trim() || t("cw.group"),
          sharedByLabel: sharedBy.trim() || null,
          visibility,
          notes: notes.trim() || null,
          messages: parsed.map((m) => ({
            authorLabel: m.authorLabel,
            body: m.body,
            attachments: [],
          })),
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["conversation-imports"] });
      toast.success(res.duplicate ? t("cw.duplicate") : t("cw.saved"));
      onOpenChange(false);
      setRaw("");
      onSaved?.(res.importId);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("cw.save")}</DialogTitle>
          <DialogDescription>{t("cw.saveDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("cw.source")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === "other" ? t("cw.source") : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cw-group">{t("cw.group")}</Label>
              <Input
                id="cw-group"
                className="h-11"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cw-shared">{t("cw.sharedBy")}</Label>
              <Input
                id="cw-shared"
                className="h-11"
                value={sharedBy}
                onChange={(e) => setSharedBy(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("cw.visibility")}</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as typeof visibility)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TENANT">{t("cw.visTenant")}</SelectItem>
                  <SelectItem value="PRIVATE">{t("cw.visPrivate")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cw-raw">{t("cw.paste")}</Label>
            <Textarea
              id="cw-raw"
              rows={10}
              value={raw}
              placeholder={t("cw.pasteHint")}
              onChange={(e) => setRaw(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {parsed.length} {t("cw.messages")} · {t("cw.manualBadge")}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cw-notes">{t("cw.notes")}</Label>
            <Input
              id="cw-notes"
              className="h-11"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {parsed.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("cw.preview")}</p>
              <ul className="grid gap-1 text-sm">
                {parsed.slice(0, 5).map((m, i) => (
                  <li key={i} className="truncate">
                    <Badge variant="secondary" className="mr-2 text-[10px]">
                      {m.authorLabel ?? "?"}
                    </Badge>
                    {m.body}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            className="h-11"
            disabled={parsed.length === 0 || save.isPending}
            onClick={() => {
              if (parsed.length === 0) {
                toast.error(t("cw.emptyPaste"));
                return;
              }
              save.mutate();
            }}
          >
            {save.isPending ? t("cw.saving") : t("cw.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
