// AI ACTION LAYER V1 — thẻ đề xuất: xem trước → chỉnh sửa → xác nhận.
// Không tự động thực thi, không preselect nút xác nhận, không confirm bằng phím Enter trong ô nhập.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Pencil, Sparkles, X, ExternalLink, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelAiAction, confirmAiAction, refreshAiActionProposal } from "@/lib/api/ai-actions.functions";
import type { RefreshedAiActionPreview } from "@/lib/api/ai-actions.functions";
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
  const refresh = useServerFn(refreshAiActionProposal);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [state, setState] = useState<"idle" | "running" | "done" | "cancelled">("idle");
  const [result, setResult] = useState<AiActionExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ACTION_STALE: dữ liệu đích đã đổi → chặn xác nhận cho tới khi người dùng xem lại preview mới.
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState<RefreshedAiActionPreview | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const payload = useMemo(() => ({ ...proposal.payload, ...edits }) as Record<string, any>, [proposal.payload, edits]);
  const blocking = proposal.ambiguities.filter((a) => !(a.field in edits));

  /** Preview rows kèm cờ "sẽ thay đổi" để mobile thấy rõ tác động trước khi xác nhận. */
  const rows = useMemo(
    () =>
      proposal.preview.map((row) => {
        const value = editedValue(row.label, payload) ?? row.value;
        const inert = !value || value === "Giữ nguyên" || value === "Chưa đặt" || value === "—" || value === "Chưa giao";
        const informational = row.label === "Trạng thái" || row.label === "Không gian làm việc";
        return { label: row.label, value, willChange: !inert && !informational };
      }),
    [proposal.preview, payload],
  );
  const changedRows = useMemo(() => rows.filter((r) => r.willChange), [rows]);

  const set = (k: string, v: unknown) => setEdits((p) => ({ ...p, [k]: v }));

  const onConfirm = async () => {
    if (state === "running" || state === "done") return;
    if (stale && !reviewed) return;
    setState("running");
    setError(null);
    try {
      const res = (await confirm({ data: { actionId: proposal.actionId, edits: edits as never } })) as AiActionExecutionResult;
      setResult(res);
      setState("done");
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Không thể thực hiện hành động.";
      if (/ACTION_STALE|đã thay đổi kể từ lúc UNI/i.test(msg)) {
        setStale(true);
        setReviewed(false);
        setRefreshed(null);
        setError(null);
      } else {
        setError(msg);
      }
      setState("idle");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = (await refresh({ data: { actionId: proposal.actionId } })) as RefreshedAiActionPreview;
      setRefreshed(res);
      setReviewed(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Không tải được đề xuất mới.");
    } finally {
      setRefreshing(false);
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
        {result.assignedAgent && (
          <p className="text-[12px] text-muted-foreground">
            Agent phụ trách: <span className="font-medium text-foreground">{result.assignedAgent.agentName}</span>
            {result.assignedAgent.profileName ? ` · ${result.assignedAgent.profileName}` : ""} — {result.assignedAgent.reason}
          </p>
        )}
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

      {stale && (
        <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-[12px]">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Dữ liệu đã thay đổi kể từ lúc UNI đề xuất
          </p>
          <p className="text-muted-foreground">
            Để tránh ghi đè thay đổi của người khác, hãy tải lại bản xem trước mới và kiểm tra trước khi xác nhận lại.
          </p>
          {!refreshed ? (
            <Button size="sm" variant="outline" className="min-h-11 w-full sm:min-h-9 sm:w-auto" onClick={() => void onRefresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Xem preview mới
            </Button>
          ) : (
            <div className="space-y-2">
              {refreshed.targetChanges.length > 0 ? (
                <ul className="space-y-1">
                  {refreshed.targetChanges.map((c) => (
                    <li key={c.label} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">{c.label}:</span>
                      <span className="rounded bg-surface px-1.5 py-0.5 line-through">{c.before}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{c.after}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Không phát hiện khác biệt hiển thị, nhưng phiên bản dữ liệu đã được làm mới.</p>
              )}
              <dl className="space-y-1 rounded-lg border border-border bg-background p-2">
                {refreshed.preview.map((row) => (
                  <div key={row.label} className="grid grid-cols-[110px_1fr] gap-2">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-medium break-words">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 accent-[var(--primary)]"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Tôi đã xem bản xem trước mới và muốn xác nhận lại
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {!editing ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            {changedRows.length > 0
              ? `${changedRows.length} trường sẽ thay đổi khi bạn xác nhận`
              : "Không có trường nào bị thay đổi"}
          </p>
          <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {rows.map((row) => (
              <div
                key={row.label}
                className={`grid grid-cols-1 gap-0.5 px-2.5 py-2 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-2 ${
                  row.willChange ? "bg-primary/5" : ""
                }`}
              >
                <dt className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span className="truncate">{row.label}</span>
                  {row.willChange && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-primary">
                      sẽ thay đổi
                    </span>
                  )}
                </dt>
                <dd className="min-w-0 text-[13px] font-medium break-words">{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
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

      <footer
        className="sticky bottom-0 -mx-3 grid grid-cols-2 gap-2 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mx-0 sm:flex sm:flex-wrap sm:border-0 sm:px-0 sm:pb-0"
      >
        <Button
          size="sm"
          onClick={() => void onConfirm()}
          disabled={state === "running" || blocking.length > 0 || (stale && !reviewed)}
          className="col-span-2 min-h-11 w-full sm:min-h-9 sm:w-auto sm:flex-1"
        >
          {state === "running" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          {stale ? "Xác nhận lại" : "Xác nhận"}
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 w-full sm:min-h-9 sm:w-auto" onClick={() => setEditing((v) => !v)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> {editing ? "Xong" : "Chỉnh sửa"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 w-full sm:min-h-9 sm:w-auto"
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
          <Input className="min-h-11 sm:min-h-9" id="ai-title" value={payload.title ?? ""} onChange={(e) => set("title", e.target.value)} />
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
            <Input className="min-h-11 sm:min-h-9" id="ai-start" type="datetime-local" value={toLocalInput(payload.startAt)} onChange={(e) => set("startAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-end" className="text-[12px]">Kết thúc</Label>
            <Input className="min-h-11 sm:min-h-9" id="ai-end" type="datetime-local" value={toLocalInput(payload.endAt)} onChange={(e) => set("endAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
        </>
      )}
      {t === "CREATE_EMAIL_DRAFT" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="ai-to" className="text-[12px]">Người nhận (email, cách nhau dấu phẩy)</Label>
            <Input className="min-h-11 sm:min-h-9" id="ai-to" value={(payload.to ?? []).join(", ")} onChange={(e) => set("to", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-subject" className="text-[12px]">Tiêu đề thư</Label>
            <Input className="min-h-11 sm:min-h-9" id="ai-subject" value={payload.subject ?? ""} onChange={(e) => set("subject", e.target.value)} />
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
