import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendEmail, saveEmailDraft } from "@/lib/api/emails.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  listEmailLabels,
  listEmailRules,
  upsertEmailLabel,
  deleteEmailLabel,
  upsertEmailRule,
  deleteEmailRule,
  registerEmailAttachment,
  deleteEmailAttachment,
  getEmailSignature,
  saveEmailSignature,
  type EmailRule,
  type EmailLabel,
} from "@/lib/api/email-hub.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Paperclip,
  Send,
  X,
  Plus,
  Tag,
  Trash2,
  Settings2,
  Search,
  Filter,
  Languages,
  FileText,
  Calendar,
  User2,
  Wand2,
  ChevronRight,
  Bot,
  Inbox,
} from "lucide-react";

/* ===================== Compose Modal ===================== */

export function ComposeEmailDialog({
  open,
  onOpenChange,
  initialTo = "",
  initialSubject = "",
  initialCc = "",
  initialBody = "",
  threadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTo?: string;
  initialSubject?: string;
  initialCc?: string;
  initialBody?: string;
  threadId?: string;
}) {
  const [to, setTo] = useState(initialTo);
  const [showCc, setShowCc] = useState(Boolean(initialCc));
  const [cc, setCc] = useState(initialCc);
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const signatureApplied = useRef(false);

  const qc = useQueryClient();
  const doSend = useServerFn(sendEmail);
  const doSaveDraft = useServerFn(saveEmailDraft);
  const doRegister = useServerFn(registerEmailAttachment);
  const doDeleteAttachment = useServerFn(deleteEmailAttachment);

  const signatureQuery = useQuery({
    queryKey: ["email-signature"],
    queryFn: () => getEmailSignature(),
    enabled: open,
    staleTime: 60_000,
  });

  // Tự chèn chữ ký cá nhân một lần khi mở hộp soạn thư.
  useEffect(() => {
    if (!open) {
      signatureApplied.current = false;
      return;
    }
    const sig = signatureQuery.data;
    if (!sig || !sig.is_enabled || !sig.body.trim() || signatureApplied.current) return;
    signatureApplied.current = true;
    setBody((b) => (b.includes(sig.body.trim()) ? b : `${b}\n\n--\n${sig.body.trim()}`));
  }, [open, signatureQuery.data]);

  const parseList = (v: string) =>
    v
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  async function ensureDraft(): Promise<string> {
    if (draftId) return draftId;
    const res = await doSaveDraft({
      data: {
        to: parseList(to),
        cc: parseList(cc),
        subject: subject.trim() || "(Không tiêu đề)",
        body,
        ...(threadId ? { thread_id: threadId } : {}),
      },
    });
    setDraftId(res.draft_id);
    return res.draft_id;
  }

  function formatSize(bytes: number) {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const msgId = await ensureDraft();
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name} vượt quá 25MB`);
          continue;
        }
        const key = `${msgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from("email-attachments").upload(key, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) throw new Error(error.message);
        const reg = await doRegister({
          data: {
            message_id: msgId,
            object_key: key,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
          },
        });
        setAttachments((prev) => [
          ...prev,
          { id: reg.id, name: file.name, size: formatSize(file.size) },
        ]);
      }
      toast.success("Đã đính kèm tệp");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đính kèm được tệp");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(id: string) {
    try {
      await doDeleteAttachment({ data: { id } });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được tệp");
    }
  }

  const sendMut = useMutation({
    mutationFn: () =>
      doSend({
        data: {
          to: parseList(to),
          cc: parseList(cc),
          subject: subject.trim(),
          body,
          ...(threadId ? { thread_id: threadId } : {}),
          ...(draftId ? { draft_id: draftId } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Đã gửi email");
      setDraftId(null);
      setAttachments([]);
      qc.invalidateQueries({ queryKey: ["emails"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSend() {
    if (parseList(to).length === 0) {
      toast.error("Vui lòng nhập ít nhất một người nhận");
      return;
    }
    if (!subject.trim()) {
      toast.error("Vui lòng nhập tiêu đề");
      return;
    }
    sendMut.mutate();
  }

  function runAI(prompt: string) {
    setAiBusy(true);
    setTimeout(() => {
      setBody(
        (b) =>
          (b ? b + "\n\n" : "") + `Kính gửi anh/chị,\n\n${prompt}\n\nTrân trọng,\nNguyễn Văn A`,
      );
      setAiBusy(false);
    }, 600);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Soạn email mới
          </DialogTitle>
          <DialogDescription>Soạn và gửi email từ Email Hub với trợ giúp của AI.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted-foreground">Đến</span>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="text-xs text-primary hover:underline"
              >
                Cc/Bcc
              </button>
            )}
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">Cc</span>
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@company.com"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">Bcc</span>
                <Input
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@company.com"
                />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted-foreground">Tiêu đề</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề email"
            />
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung email..."
            className="min-h-[200px] w-full resize-y rounded-lg border border-border bg-surface-2 p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3" /> {a.name}{" "}
                  <span className="text-muted-foreground">{a.size}</span>
                  <button
                    onClick={() => removeAttachment(a.id)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Xoá ${a.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI viết hộ
              {aiBusy && <span className="text-muted-foreground">Đang viết...</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AiChip
                onClick={() =>
                  runAI("Em xin xác nhận đã nhận được yêu cầu và sẽ phản hồi trong 24h.")
                }
              >
                Xác nhận đã nhận
              </AiChip>
              <AiChip
                onClick={() =>
                  runAI("Em xin gửi báo giá theo file đính kèm, mong anh/chị xem xét.")
                }
              >
                Gửi báo giá
              </AiChip>
              <AiChip onClick={() => runAI("Em xin lịch hẹn họp tuần sau để trao đổi chi tiết.")}>
                Đặt lịch họp
              </AiChip>
              <AiChip
                onClick={() => runAI("Cảm ơn anh/chị đã hợp tác. Em xin gửi tài liệu cập nhật.")}
              >
                Cảm ơn & gửi tài liệu
              </AiChip>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row !justify-between gap-2">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" /> {uploading ? "Đang tải lên…" : "Đính kèm"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={sendMut.isPending}
            >
              Hủy
            </Button>
            <Button size="sm" onClick={handleSend} disabled={sendMut.isPending}>
              <Send className="h-4 w-4" /> {sendMut.isPending ? "Đang gửi…" : "Gửi"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs hover:border-primary/40 hover:bg-primary/10"
    >
      <Wand2 className="h-3 w-3 text-primary" /> {children}
    </button>
  );
}

/* ===================== Advanced Filter Dialog ===================== */

export type AdvancedFilters = {
  from: string;
  to: string;
  hasAttachment: boolean;
  dateFrom: string;
  dateTo: string;
  labels: string[];
  keyword: string;
};

export const EMPTY_FILTERS: AdvancedFilters = {
  from: "",
  to: "",
  hasAttachment: false,
  dateFrom: "",
  dateTo: "",
  labels: [],
  keyword: "",
};

export function AdvancedFilterDialog({
  open,
  onOpenChange,
  value,
  onChange,
  availableLabels,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: AdvancedFilters;
  onChange: (v: AdvancedFilters) => void;
  availableLabels: EmailLabel[];
}) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);

  function toggleLabel(id: string) {
    setDraft((d) => ({
      ...d,
      labels: d.labels.includes(id) ? d.labels.filter((l) => l !== id) : [...d.labels, id],
    }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setDraft(value);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" /> Bộ lọc nâng cao
          </DialogTitle>
          <DialogDescription>Lọc email theo nhiều tiêu chí kết hợp.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field icon={Search} label="Từ khóa">
            <Input
              value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              placeholder="Tiêu đề, nội dung..."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field icon={User2} label="Từ">
              <Input
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                placeholder="name@..."
              />
            </Field>
            <Field icon={User2} label="Đến">
              <Input
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                placeholder="name@..."
              />
            </Field>
            <Field icon={Calendar} label="Từ ngày">
              <Input
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
              />
            </Field>
            <Field icon={Calendar} label="Đến ngày">
              <Input
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">Nhãn</div>
            <div className="flex flex-wrap gap-1.5">
              {availableLabels.length === 0 && (
                <span className="text-xs text-muted-foreground">Chưa có nhãn</span>
              )}
              {availableLabels.map((l) => {
                const active = draft.labels.includes(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${active ? "border-primary bg-primary/15" : "border-border bg-surface hover:bg-surface-2"}`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: l.color }}
                      aria-hidden
                    />
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Có tệp đính kèm
            </span>
            <Switch
              checked={draft.hasAttachment}
              onCheckedChange={(v) => setDraft({ ...draft, hasAttachment: v })}
            />
          </label>
        </div>

        <DialogFooter className="flex-row !justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onChange(EMPTY_FILTERS);
            }}
          >
            Đặt lại
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                onChange(draft);
                onOpenChange(false);
              }}
            >
              Áp dụng
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}

/* ===================== AI Email Assistant Dialog ===================== */

type AiMode = "reply" | "translate" | "summarize";

export function AiAssistantDialog({
  open,
  onOpenChange,
  emailSubject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emailSubject: string;
}) {
  const [mode, setMode] = useState<AiMode>("reply");
  const [tone, setTone] = useState<"formal" | "friendly" | "concise">("formal");
  const [lang, setLang] = useState<"vi" | "en" | "ja">("en");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");

  function generate() {
    setBusy(true);
    setOutput("");
    setTimeout(() => {
      if (mode === "reply") {
        const toneText =
          tone === "formal" ? "trang trọng" : tone === "friendly" ? "thân thiện" : "ngắn gọn";
        setOutput(
          `Trả lời (${toneText}) cho: "${emailSubject}"\n\n` +
            `Kính gửi anh/chị,\n\nEm đã nhận được email và sẽ phối hợp với các bên liên quan để xử lý trong thời gian sớm nhất. Em sẽ gửi phản hồi chi tiết trước EOD hôm nay.\n\nTrân trọng,\nNguyễn Văn A`,
        );
      } else if (mode === "translate") {
        const langName = lang === "en" ? "English" : lang === "ja" ? "日本語" : "Tiếng Việt";
        setOutput(
          `Bản dịch sang ${langName}:\n\nDear Sir/Madam,\n\nWe would like to send you our quotation for the server system serving the STOS Platform project, with technical requirements as per the attached file. We look forward to hearing back from you.\n\nBest regards,\nLe Minh Duc`,
        );
      } else {
        setOutput(
          `Tóm tắt chuỗi email (8 thư) — "${emailSubject}":\n\n` +
            `• Khách hàng yêu cầu báo giá hệ thống máy chủ cho dự án STOS.\n` +
            `• 2 tệp đính kèm: yêu cầu kỹ thuật + bảng dự toán.\n` +
            `• Đội kỹ thuật đã xác nhận khả thi, đang chuẩn bị phương án giá.\n` +
            `• Còn chờ: phê duyệt ngân sách Q2/2025 từ Giám đốc Tài chính.\n` +
            `• Hành động đề xuất: gửi báo giá trước thứ Sáu tuần này.`,
        );
      }
      setBusy(false);
    }, 600);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Email Assistant
          </DialogTitle>
          <DialogDescription>Tạo phản hồi, dịch hoặc tóm tắt chuỗi email.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <ModeBtn active={mode === "reply"} onClick={() => setMode("reply")} icon={Bot}>
            Trả lời nhanh
          </ModeBtn>
          <ModeBtn
            active={mode === "translate"}
            onClick={() => setMode("translate")}
            icon={Languages}
          >
            Dịch
          </ModeBtn>
          <ModeBtn
            active={mode === "summarize"}
            onClick={() => setMode("summarize")}
            icon={FileText}
          >
            Tóm tắt chuỗi
          </ModeBtn>
        </div>

        {mode === "reply" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Giọng văn:</span>
            {(["formal", "friendly", "concise"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`rounded-full border px-2.5 py-1 ${tone === t ? "border-primary bg-primary/15" : "border-border bg-surface hover:bg-surface-2"}`}
              >
                {t === "formal" ? "Trang trọng" : t === "friendly" ? "Thân thiện" : "Ngắn gọn"}
              </button>
            ))}
          </div>
        )}
        {mode === "translate" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Sang ngôn ngữ:</span>
            {(["en", "vi", "ja"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full border px-2.5 py-1 ${lang === l ? "border-primary bg-primary/15" : "border-border bg-surface hover:bg-surface-2"}`}
              >
                {l === "en" ? "English" : l === "ja" ? "日本語" : "Tiếng Việt"}
              </button>
            ))}
          </div>
        )}

        <Button onClick={generate} disabled={busy} className="w-full">
          <Wand2 className="h-4 w-4" /> {busy ? "Đang xử lý..." : "Tạo nội dung với AI"}
        </Button>

        <div className="max-h-[260px] min-h-[140px] overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap">
          {output || <span className="text-muted-foreground">Kết quả sẽ hiển thị tại đây...</span>}
        </div>

        <DialogFooter className="flex-row !justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!output}
            onClick={() => navigator.clipboard.writeText(output)}
          >
            Sao chép
          </Button>
          <Button disabled={!output} onClick={() => onOpenChange(false)}>
            <Send className="h-4 w-4" /> Dùng nội dung này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeBtn({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/15" : "border-border bg-surface hover:bg-surface-2"}`}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

/* ===================== Labels & Rules Dialog (backend-backed) ===================== */

export type LabelDef = { name: string; color: string };

const COLOR_OPTIONS = ["#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#f43f5e", "#64748b"];

export function LabelsRulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"labels" | "rules" | "signature">("labels");
  const [sigText, setSigText] = useState<string | null>(null);
  const sigQuery = useQuery({
    queryKey: ["email-signature"],
    queryFn: () => getEmailSignature(),
    enabled: open,
  });
  const saveSigMut = useMutation({
    mutationFn: () => saveEmailSignature({ data: { body: sigText ?? "" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-signature"] });
      toast.success("Đã lưu chữ ký");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);

  const [rName, setRName] = useState("");
  const [rFrom, setRFrom] = useState("");
  const [rSubject, setRSubject] = useState("");
  const [rHasAtt, setRHasAtt] = useState(false);
  const [rLabelId, setRLabelId] = useState("");
  const [rFolder, setRFolder] = useState("");
  const [rMarkRead, setRMarkRead] = useState(false);

  const labelsQuery = useQuery({
    queryKey: ["email-labels"],
    queryFn: () => listEmailLabels(),
    enabled: open,
  });
  const rulesQuery = useQuery({
    queryKey: ["email-rules"],
    queryFn: () => listEmailRules(),
    enabled: open,
  });
  const labels = labelsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];

  const saveLabel = useServerFn(upsertEmailLabel);
  const removeLabel = useServerFn(deleteEmailLabel);
  const saveRule = useServerFn(upsertEmailRule);
  const removeRule = useServerFn(deleteEmailRule);

  const refreshLabels = () => {
    qc.invalidateQueries({ queryKey: ["email-labels"] });
    qc.invalidateQueries({ queryKey: ["emails"] });
  };
  const refreshRules = () => qc.invalidateQueries({ queryKey: ["email-rules"] });

  const addLabelMut = useMutation({
    mutationFn: () => saveLabel({ data: { name: newLabel.trim(), color: newColor } }),
    onSuccess: () => {
      setNewLabel("");
      refreshLabels();
      toast.success("Đã lưu nhãn");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delLabelMut = useMutation({
    mutationFn: (id: string) => removeLabel({ data: { id } }),
    onSuccess: () => {
      refreshLabels();
      refreshRules();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addRuleMut = useMutation({
    mutationFn: () =>
      saveRule({
        data: {
          name: rName.trim(),
          is_enabled: true,
          cond_from: rFrom,
          cond_subject_contains: rSubject,
          cond_has_attachment: rHasAtt,
          act_label_id: rLabelId || null,
          act_folder: (rFolder || null) as "inbox" | "archive" | "trash" | null,
          act_mark_read: rMarkRead,
        },
      }),
    onSuccess: () => {
      setRName("");
      setRFrom("");
      setRSubject("");
      setRValueReset();
      refreshRules();
      toast.success("Đã lưu quy tắc");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function setRValueReset() {
    setRHasAtt(false);
    setRLabelId("");
    setRFolder("");
    setRMarkRead(false);
  }
  const toggleRuleMut = useMutation({
    mutationFn: (r: { id: string; enabled: boolean }) => {
      const full = rules.find((x) => x.id === r.id)!;
      return saveRule({
        data: {
          id: full.id,
          name: full.name,
          is_enabled: r.enabled,
          cond_from: full.cond_from ?? "",
          cond_subject_contains: full.cond_subject_contains ?? "",
          cond_has_attachment: full.cond_has_attachment,
          act_label_id: full.act_label_id,
          act_folder: full.act_folder as "inbox" | "archive" | "trash" | null,
          act_mark_read: full.act_mark_read,
        },
      });
    },
    onSuccess: refreshRules,
    onError: (e: Error) => toast.error(e.message),
  });
  const delRuleMut = useMutation({
    mutationFn: (id: string) => removeRule({ data: { id } }),
    onSuccess: refreshRules,
    onError: (e: Error) => toast.error(e.message),
  });

  function describeRule(r: EmailRule) {
    const when: string[] = [];
    if (r.cond_from) when.push(`người gửi chứa "${r.cond_from}"`);
    if (r.cond_subject_contains) when.push(`tiêu đề chứa "${r.cond_subject_contains}"`);
    if (r.cond_has_attachment) when.push("có tệp đính kèm");
    const then: string[] = [];
    if (r.act_label_id)
      then.push(`gắn nhãn "${labels.find((l) => l.id === r.act_label_id)?.name ?? "?"}"`);
    if (r.act_folder)
      then.push(
        r.act_folder === "archive"
          ? "chuyển vào Lưu trữ"
          : r.act_folder === "trash"
            ? "chuyển vào Thùng rác"
            : "giữ ở Hộp thư đến",
      );
    if (r.act_mark_read) then.push("đánh dấu đã đọc");
    return `Khi ${when.join(" và ") || "mọi thư"} → ${then.join(", ") || "không làm gì"}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Nhãn & Quy tắc tự động
          </DialogTitle>
          <DialogDescription>Tổ chức email bằng nhãn và quy tắc tự động.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          <button
            onClick={() => setTab("labels")}
            className={`min-h-11 flex-1 rounded-md px-3 py-1.5 ${tab === "labels" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <Tag className="mr-1.5 inline h-3.5 w-3.5" /> Nhãn ({labels.length})
          </button>
          <button
            onClick={() => setTab("rules")}
            className={`min-h-11 flex-1 rounded-md px-3 py-1.5 ${tab === "rules" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <Filter className="mr-1.5 inline h-3.5 w-3.5" /> Quy tắc ({rules.length})
          </button>
          <button
            onClick={() => setTab("signature")}
            className={`min-h-11 flex-1 rounded-md px-3 py-1.5 ${tab === "signature" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            Chữ ký
          </button>
        </div>

        {tab === "signature" ? (
          <div className="space-y-3">
            <textarea
              value={sigText ?? sigQuery.data?.body ?? ""}
              onChange={(e) => setSigText(e.target.value)}
              placeholder={"Trân trọng,\nNguyễn Văn A — UNIWORK"}
              className="min-h-[160px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Chữ ký được tự động chèn vào cuối mỗi thư mới bạn soạn.
            </p>
            <Button onClick={() => saveSigMut.mutate()} disabled={saveSigMut.isPending}>
              Lưu chữ ký
            </Button>
          </div>
        ) : tab === "labels" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
              <div className="min-w-[160px] flex-1">
                <div className="mb-1 text-xs text-muted-foreground">Tên nhãn</div>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="VD: Khẩn cấp"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Màu</div>
                <div className="flex gap-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-8 w-8 rounded-md ${newColor === c ? "ring-2 ring-foreground" : ""}`}
                      aria-label={`Màu ${c}`}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={() => newLabel.trim() && addLabelMut.mutate()}
                disabled={addLabelMut.isPending}
              >
                <Plus className="h-4 w-4" /> Thêm
              </Button>
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {labels.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: l.color }}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm">{l.name}</span>
                  <button
                    onClick={() => delLabelMut.mutate(l.id)}
                    className="rounded p-2 text-muted-foreground hover:bg-surface-2 hover:text-rose-400"
                    aria-label={`Xoá nhãn ${l.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {labels.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Chưa có nhãn nào
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <Input
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Tên quy tắc (VD: Email từ khách VIP)"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={rFrom}
                  onChange={(e) => setRFrom(e.target.value)}
                  placeholder="Người gửi chứa…"
                />
                <Input
                  value={rSubject}
                  onChange={(e) => setRSubject(e.target.value)}
                  placeholder="Tiêu đề chứa…"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <Switch checked={rHasAtt} onCheckedChange={setRHasAtt} /> Có đính kèm
                </label>
                <select
                  value={rLabelId}
                  onChange={(e) => setRLabelId(e.target.value)}
                  className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Không gắn nhãn</option>
                  {labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      Gắn nhãn: {l.name}
                    </option>
                  ))}
                </select>
                <select
                  value={rFolder}
                  onChange={(e) => setRFolder(e.target.value)}
                  className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Giữ nguyên thư mục</option>
                  <option value="inbox">Hộp thư đến</option>
                  <option value="archive">Lưu trữ</option>
                  <option value="trash">Thùng rác</option>
                </select>
                <label className="flex items-center gap-2">
                  <Switch checked={rMarkRead} onCheckedChange={setRMarkRead} /> Đánh dấu đã đọc
                </label>
                <Button
                  size="sm"
                  onClick={() => rName.trim() && addRuleMut.mutate()}
                  disabled={addRuleMut.isPending}
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{describeRule(r)}</div>
                  </div>
                  <Switch
                    checked={r.is_enabled}
                    onCheckedChange={(v) => toggleRuleMut.mutate({ id: r.id, enabled: v })}
                  />
                  <button
                    onClick={() => delRuleMut.mutate(r.id)}
                    className="rounded p-2 text-muted-foreground hover:bg-surface-2 hover:text-rose-400"
                    aria-label={`Xoá quy tắc ${r.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {rules.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Chưa có quy tắc nào
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
