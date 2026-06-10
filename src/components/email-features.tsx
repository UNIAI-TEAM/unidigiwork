import { useState } from "react";
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTo?: string;
  initialSubject?: string;
}) {
  const [to, setTo] = useState(initialTo);
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; size: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

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
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3" /> {a.name}{" "}
                  <span className="text-muted-foreground">{a.size}</span>
                  <X
                    className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                  />
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setAttachments([
                  ...attachments,
                  { name: `File_${attachments.length + 1}.pdf`, size: "240 KB" },
                ])
              }
            >
              <Paperclip className="h-4 w-4" /> Đính kèm
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              <Send className="h-4 w-4" /> Gửi
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
  availableLabels: string[];
}) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);

  function toggleLabel(name: string) {
    setDraft((d) => ({
      ...d,
      labels: d.labels.includes(name) ? d.labels.filter((l) => l !== name) : [...d.labels, name],
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
              {availableLabels.map((l) => {
                const active = draft.labels.includes(l);
                return (
                  <button
                    key={l}
                    onClick={() => toggleLabel(l)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${active ? "border-primary bg-primary/15" : "border-border bg-surface hover:bg-surface-2"}`}
                  >
                    <Tag className="h-3 w-3" /> {l}
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
  icon: any;
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
  icon: any;
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

/* ===================== Labels & Rules Dialog ===================== */

export type LabelDef = { name: string; color: string };
export type RuleDef = {
  id: string;
  name: string;
  whenField: "from" | "subject" | "to";
  whenContains: string;
  thenAction: "label" | "archive" | "star" | "forward";
  thenValue: string;
  active: boolean;
};

const COLOR_OPTIONS = [
  { name: "Emerald", value: "bg-emerald-500" },
  { name: "Amber", value: "bg-amber-500" },
  { name: "Violet", value: "bg-violet-500" },
  { name: "Sky", value: "bg-sky-500" },
  { name: "Rose", value: "bg-rose-500" },
  { name: "Slate", value: "bg-slate-500" },
];

export function LabelsRulesDialog({
  open,
  onOpenChange,
  labels,
  onChangeLabels,
  rules,
  onChangeRules,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  labels: LabelDef[];
  onChangeLabels: (v: LabelDef[]) => void;
  rules: RuleDef[];
  onChangeRules: (v: RuleDef[]) => void;
}) {
  const [tab, setTab] = useState<"labels" | "rules">("labels");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0].value);

  const [rName, setRName] = useState("");
  const [rField, setRField] = useState<RuleDef["whenField"]>("from");
  const [rContains, setRContains] = useState("");
  const [rAction, setRAction] = useState<RuleDef["thenAction"]>("label");
  const [rValue, setRValue] = useState("");

  function addLabel() {
    const n = newLabel.trim();
    if (!n) return;
    onChangeLabels([...labels, { name: n, color: newColor }]);
    setNewLabel("");
  }
  function removeLabel(name: string) {
    onChangeLabels(labels.filter((l) => l.name !== name));
  }
  function addRule() {
    if (!rName.trim() || !rContains.trim()) return;
    onChangeRules([
      ...rules,
      {
        id: Math.random().toString(36).slice(2, 9),
        name: rName,
        whenField: rField,
        whenContains: rContains,
        thenAction: rAction,
        thenValue: rValue,
        active: true,
      },
    ]);
    setRName("");
    setRContains("");
    setRValue("");
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
            className={`flex-1 rounded-md px-3 py-1.5 ${tab === "labels" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <Tag className="mr-1.5 inline h-3.5 w-3.5" /> Nhãn ({labels.length})
          </button>
          <button
            onClick={() => setTab("rules")}
            className={`flex-1 rounded-md px-3 py-1.5 ${tab === "rules" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <Filter className="mr-1.5 inline h-3.5 w-3.5" /> Quy tắc ({rules.length})
          </button>
        </div>

        {tab === "labels" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex-1 min-w-[160px]">
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
                      key={c.value}
                      onClick={() => setNewColor(c.value)}
                      className={`h-7 w-7 rounded-md ${c.value} ${newColor === c.value ? "ring-2 ring-foreground" : ""}`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={addLabel}>
                <Plus className="h-4 w-4" /> Thêm
              </Button>
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {labels.map((l) => (
                <li key={l.name} className="flex items-center gap-3 px-3 py-2">
                  <span className={`h-3 w-3 rounded-sm ${l.color}`} />
                  <span className="flex-1 text-sm">{l.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    đang dùng
                  </Badge>
                  <button
                    onClick={() => removeLabel(l.name)}
                    className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {labels.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Chưa có nhãn nào.
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
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Khi</span>
                <select
                  value={rField}
                  onChange={(e) => setRField(e.target.value as any)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="from">Người gửi</option>
                  <option value="to">Người nhận</option>
                  <option value="subject">Tiêu đề</option>
                </select>
                <span className="text-muted-foreground">chứa</span>
                <Input
                  value={rContains}
                  onChange={(e) => setRContains(e.target.value)}
                  placeholder="@stos.vn"
                  className="h-8 flex-1 min-w-[120px]"
                />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">thì</span>
                <select
                  value={rAction}
                  onChange={(e) => setRAction(e.target.value as any)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="label">Gắn nhãn</option>
                  <option value="archive">Lưu trữ</option>
                  <option value="star">Đánh dấu sao</option>
                  <option value="forward">Chuyển tiếp</option>
                </select>
                {(rAction === "label" || rAction === "forward") && (
                  <Input
                    value={rValue}
                    onChange={(e) => setRValue(e.target.value)}
                    placeholder={rAction === "label" ? "Tên nhãn" : "email@..."}
                    className="h-8 w-[140px]"
                  />
                )}
                <Button size="sm" onClick={addRule}>
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
                    <div className="truncate text-xs text-muted-foreground">
                      Khi {labelField(r.whenField)} chứa "{r.whenContains}" →{" "}
                      {labelAction(r.thenAction)}
                      {r.thenValue ? ` "${r.thenValue}"` : ""}
                    </div>
                  </div>
                  <Switch
                    checked={r.active}
                    onCheckedChange={(v) =>
                      onChangeRules(rules.map((x) => (x.id === r.id ? { ...x, active: v } : x)))
                    }
                  />
                  <button
                    onClick={() => onChangeRules(rules.filter((x) => x.id !== r.id))}
                    className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {rules.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Chưa có quy tắc nào.
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function labelField(f: RuleDef["whenField"]) {
  return f === "from" ? "Người gửi" : f === "to" ? "Người nhận" : "Tiêu đề";
}
function labelAction(a: RuleDef["thenAction"]) {
  return a === "label"
    ? "gắn nhãn"
    : a === "archive"
      ? "lưu trữ"
      : a === "star"
        ? "đánh dấu sao"
        : "chuyển tiếp đến";
}
