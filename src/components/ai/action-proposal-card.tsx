// AI ACTION LAYER V1 — thẻ đề xuất: xem trước → chỉnh sửa → xác nhận.
// Không tự động thực thi, không preselect nút xác nhận, không confirm bằng phím Enter trong ô nhập.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Pencil, Sparkles, X, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelAiAction, confirmAiAction } from "@/lib/api/ai-actions.functions";
import type { AiActionExecutionResult, ProposedAiAction } from "@/domain/ai-actions/contracts";

type Edits = Record<string, unknown>;

/** Chuyển ISO ↔ giá trị input datetime-local theo giờ VN. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
};

export function ActionProposalCard({ proposal }: { proposal: ProposedAiAction }) {
  const navigate = useNavigate();
  const confirm = useServerFn(confirmAiAction);
  const cancel = useServerFn(cancelAiAction);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [state, setState] = useState<"idle" | "running" | "done" | "cancelled">("idle");
  const [result, setResult] = useState<AiActionExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => ({ ...proposal.payload, ...edits }) as Record<string, any>, [proposal.payload, edits]);
  const blocking = proposal.ambiguities.filter((a) => !(a.field in edits));

  const set = (k: string, v: unknown) => setEdits((p) => ({ ...p, [k]: v }));

  const onConfirm = async () => {
    if (state === "running" || state === "done") return;
    setState("running");
    setError(null);
    try {
      const res = (await confirm({ data: { actionId: proposal.actionId, edits: edits as never } })) as AiActionExecutionResult;
      setResult(res);
      setState("done");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Không thể thực hiện hành động.");
      setState("idle");
    }
  };

  if (state === "cancelled") {
    return <p className="rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-muted-foreground">Đã bỏ qua đề xuất của UNI. Không có dữ liệu nào thay đổi.</p>;
  }

  if (state === "done" && result) {
    return (
      <div className="space-y-2 rounded-xl border border-success/40 bg-success/5 px-3 py-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <Check className="h-4 w-4 text-success" /> {result.message}
        </p>
        {result.href && (
          <Button size="sm" variant="outline" onClick={() => navigate({ to: result.href! })}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Mở
          </Button>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label={`UNI đề xuất: ${proposal.title}`}
      className="space-y-3 rounded-xl border border-primary/30 bg-background px-3 py-3 text-sm"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold">UNI đề xuất · {proposal.title}</span>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Cần bạn xác nhận</span>
      </header>

      {!editing ? (
        <dl className="space-y-1.5">
          {proposal.preview.map((row) => (
            <div key={row.label} className="grid grid-cols-[110px_1fr] gap-2">
              <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
              <dd className="text-[13px] font-medium break-words">{editedValue(row.label, payload) ?? row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <EditForm proposal={proposal} payload={payload} set={set} />
      )}

      {proposal.sourceRefs.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          Đề xuất từ:
          {proposal.sourceRefs.slice(0, 3).map((s) => (
            <button key={s.sourceId} onClick={() => navigate({ to: s.href })} className="rounded-full bg-surface px-2 py-0.5 text-primary hover:underline">
              {s.title}
            </button>
          ))}
        </p>
      )}

      {blocking.map((a) => (
        <div key={a.field} className="space-y-1.5 rounded-lg border border-border bg-surface p-2.5 text-[12px]">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> {a.message}
          </p>
          {a.candidates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.candidates.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => set(a.field, a.field === "to" ? [c.id] : a.field === "participantIds" ? [c.id] : c.id)}
                  className="rounded-full border border-border px-2 py-1 hover:bg-surface"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-[12px] text-destructive">{error}</p>}

      <footer className="sticky bottom-0 flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => void onConfirm()}
          disabled={state === "running" || blocking.length > 0}
          className="min-h-11 flex-1 md:min-h-9"
        >
          {state === "running" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          Xác nhận
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 md:min-h-9" onClick={() => setEditing((v) => !v)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> {editing ? "Xong" : "Chỉnh sửa"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 md:min-h-9"
          onClick={() => {
            void cancel({ data: { actionId: proposal.actionId } });
            setState("cancelled");
          }}
        >
          <X className="mr-1.5 h-3.5 w-3.5" /> Huỷ
        </Button>
      </footer>
    </section>
  );
}

function editedValue(label: string, p: Record<string, any>): string | null {
  if (label === "Tiêu đề" || label === "Tiêu đề mới") return p.title ?? p.subject ?? null;
  if (label === "Người nhận") return (p.to ?? []).join(", ") || null;
  if (label === "Nội dung") return p.body ? String(p.body).slice(0, 400) : null;
  return null;
}

function EditForm({
  proposal,
  payload,
  set,
}: {
  proposal: ProposedAiAction;
  payload: Record<string, any>;
  set: (k: string, v: unknown) => void;
}) {
  const stop = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") e.stopPropagation();
  };
  const t = proposal.actionType;
  return (
    <div className="space-y-2.5" onKeyDown={stop}>
      {(t === "CREATE_TASK" || t === "UPDATE_TASK_FIELDS" || t === "CREATE_MEETING") && (
        <div className="space-y-1">
          <Label htmlFor="ai-title" className="text-[12px]">Tiêu đề</Label>
          <Input id="ai-title" value={payload.title ?? ""} onChange={(e) => set("title", e.target.value)} />
        </div>
      )}
      {(t === "CREATE_TASK" || t === "UPDATE_TASK_FIELDS") && (
        <div className="space-y-1">
          <Label htmlFor="ai-due" className="text-[12px]">Hạn hoàn thành</Label>
          <Input
            id="ai-due"
            type="datetime-local"
            value={toLocalInput(payload.dueAt)}
            onChange={(e) => set("dueAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </div>
      )}
      {t === "CREATE_MEETING" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="ai-start" className="text-[12px]">Bắt đầu</Label>
            <Input id="ai-start" type="datetime-local" value={toLocalInput(payload.startAt)} onChange={(e) => set("startAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-end" className="text-[12px]">Kết thúc</Label>
            <Input id="ai-end" type="datetime-local" value={toLocalInput(payload.endAt)} onChange={(e) => set("endAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
        </>
      )}
      {t === "CREATE_EMAIL_DRAFT" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="ai-to" className="text-[12px]">Người nhận (email, cách nhau dấu phẩy)</Label>
            <Input id="ai-to" value={(payload.to ?? []).join(", ")} onChange={(e) => set("to", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-subject" className="text-[12px]">Tiêu đề thư</Label>
            <Input id="ai-subject" value={payload.subject ?? ""} onChange={(e) => set("subject", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-body" className="text-[12px]">Nội dung</Label>
            <Textarea id="ai-body" rows={6} value={payload.body ?? ""} onChange={(e) => set("body", e.target.value)} />
          </div>
        </>
      )}
      {(t === "CREATE_TASK" || t === "UPDATE_TASK_FIELDS") && (
        <div className="space-y-1">
          <Label htmlFor="ai-desc" className="text-[12px]">Mô tả</Label>
          <Textarea id="ai-desc" rows={3} value={payload.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>
      )}
    </div>
  );
}
