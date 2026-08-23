// Dialog "Tạo nhanh": tạo thật dữ liệu (task, workflow, meeting, kênh chat, email nháp,
// tài liệu, wiki, sự kiện lịch) qua server functions. Panel Tạo nhanh vẫn mở phía sau.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createTask } from "@/lib/api/tasks.functions";
import { createWorkflow } from "@/lib/api/workflows.functions";
import { scheduleMeeting } from "@/lib/api/meetings.functions";
import { createChatChannel } from "@/lib/api/chat.functions";
import { saveEmailDraft } from "@/lib/api/emails.functions";
import { createDocument } from "@/lib/api/documents.functions";
import { saveKnowledgeArticle } from "@/lib/api/knowledge.functions";

export type QuickCreateKind =
  | "task"
  | "workflow"
  | "meeting"
  | "message"
  | "email"
  | "doc"
  | "wiki"
  | "event";

type Fields = {
  title: string;
  body: string;
  extra: string;
  start: string;
  end: string;
};

const EMPTY: Fields = { title: "", body: "", extra: "", start: "", end: "" };

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function QuickCreateDialog({
  kind,
  onOpenChange,
}: {
  kind: QuickCreateKind | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const [pickedWs, setPickedWs] = useState<string | null>(null);
  // Khi đang ở chế độ "Tất cả workspace", cho phép chọn workspace đích ngay
  // trong dialog thay vì chặn nút tạo.
  const targetWs = workspaceId ?? pickedWs ?? workspaces?.[0]?.id ?? null;
  const [f, setF] = useState<Fields>(EMPTY);

  useEffect(() => {
    if (!kind) return;
    const now = new Date();
    const later = new Date(now.getTime() + 30 * 60_000);
    setF({ ...EMPTY, start: toLocalInput(now), end: toLocalInput(later) });
  }, [kind]);

  const set = (k: keyof Fields, v: string) => setF((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      const title = f.title.trim();
      switch (kind) {
        case "task":
          return {
            r: await createTask({
              data: {
                workspaceId: targetWs!,
                title,
                description: f.body || undefined,
                idempotencyKey,
              },
            }),
            to: "/tasks" as const,
            keys: ["tasks"],
          };
        case "workflow":
          return {
            r: await createWorkflow({
              data: {
                workspaceId: targetWs!,
                name: title,
                description: f.body || undefined,
                definition: { steps: [] },
                idempotencyKey,
              },
            }),
            to: "/workflows" as const,
            keys: ["workflows"],
          };
        case "meeting":
        case "event":
          return {
            r: await scheduleMeeting({
              data: {
                workspaceId: targetWs!,
                title,
                startAt: new Date(f.start).toISOString(),
                endAt: new Date(f.end).toISOString(),
                agenda: f.body || undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                idempotencyKey,
              },
            }),
            to: (kind === "event" ? "/calendar" : "/meeting") as "/calendar" | "/meeting",
            keys: ["meetings", "calendar"],
          };
        case "message":
          return {
            r: await createChatChannel({ data: { name: title, description: f.body || undefined } }),
            to: "/chat" as const,
            keys: ["chat"],
          };
        case "email":
          return {
            r: await saveEmailDraft({
              data: {
                to: f.extra
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                cc: [],
                subject: title,
                body: f.body,
              },
            }),
            to: "/email" as const,
            keys: ["emails"],
          };
        case "doc":
          return {
            r: await createDocument({
              data: {
                workspaceId: targetWs!,
                title,
                folder: f.extra.trim() || "My Documents",
                tags: [],
                sizeBytes: 0,
                idempotencyKey,
              },
            }),
            to: "/documents" as const,
            keys: ["documents"],
          };
        case "wiki":
          return {
            r: await saveKnowledgeArticle({
              data: {
                title,
                summary: f.extra || undefined,
                content: f.body || undefined,
                status: "draft",
              },
            }),
            to: "/knowledge" as const,
            keys: ["knowledge"],
          };
        default:
          throw new Error("UNSUPPORTED");
      }
    },
    onSuccess: async (res) => {
      for (const k of res.keys) await queryClient.invalidateQueries({ queryKey: [k] });
      onOpenChange(false);
      toast.success(t("qc.ok"), {
        action: { label: t("qc.open"), onClick: () => void navigate({ to: res.to }) },
      });
    },
    onError: (e: unknown) => {
      toast.error(t("qc.err"), { description: e instanceof Error ? e.message : undefined });
    },
  });

  if (!kind) return null;

  const needsWorkspace = ["task", "workflow", "meeting", "event", "doc"].includes(kind);
  const missingWorkspace = needsWorkspace && !targetWs;
  const isTime = kind === "meeting" || kind === "event";
  const titleLabel =
    kind === "workflow" || kind === "message"
      ? t("qc.f.name")
      : kind === "email"
        ? t("qc.f.subject")
        : t("qc.f.title");
  const canSubmit =
    f.title.trim().length > 0 && !missingWorkspace && (!isTime || (!!f.start && !!f.end));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t(`qc.title.${kind}` as never)}</DialogTitle>
          <DialogDescription>{t("qc.sub")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qc-title">{titleLabel}</Label>
            <Input
              id="qc-title"
              autoFocus
              value={f.title}
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit && !mutation.isPending) mutation.mutate();
              }}
            />
          </div>

          {kind === "email" && (
            <div className="space-y-1.5">
              <Label htmlFor="qc-to">{t("qc.f.to")}</Label>
              <Input
                id="qc-to"
                value={f.extra}
                onChange={(e) => set("extra", e.target.value)}
                placeholder="a@b.com, c@d.com"
              />
            </div>
          )}

          {kind === "doc" && (
            <div className="space-y-1.5">
              <Label htmlFor="qc-folder">{t("qc.f.folder")}</Label>
              <Input
                id="qc-folder"
                value={f.extra}
                onChange={(e) => set("extra", e.target.value)}
              />
            </div>
          )}

          {kind === "wiki" && (
            <div className="space-y-1.5">
              <Label htmlFor="qc-summary">{t("qc.f.summary")}</Label>
              <Input
                id="qc-summary"
                value={f.extra}
                onChange={(e) => set("extra", e.target.value)}
              />
            </div>
          )}

          {isTime && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-start">{t("qc.f.start")}</Label>
                <Input
                  id="qc-start"
                  type="datetime-local"
                  value={f.start}
                  onChange={(e) => set("start", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qc-end">{t("qc.f.end")}</Label>
                <Input
                  id="qc-end"
                  type="datetime-local"
                  value={f.end}
                  onChange={(e) => set("end", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="qc-body">{kind === "email" ? t("qc.f.body") : t("qc.f.desc")}</Label>
            <Textarea
              id="qc-body"
              rows={3}
              value={f.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </div>

          {needsWorkspace && !workspaceId && (workspaces?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="qc-ws">Workspace</Label>
              <select
                id="qc-ws"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={targetWs ?? ""}
                onChange={(e) => setPickedWs(e.target.value)}
              >
                {(workspaces ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {missingWorkspace && <p className="text-xs text-destructive">{t("qc.noWorkspace")}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("qc.cancel")}
          </Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t("qc.creating") : t("qc.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
