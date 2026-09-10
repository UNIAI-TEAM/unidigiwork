// Bản đồ công việc cho Kết quả công việc: liên kết tới công việc, cuộc họp,
// quyết định (biên bản) và tài liệu cụ thể trong tổ chức.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { workEntityHref } from "@/domain/work-graph/route-resolver";
import {
  linkWorkDeliverable,
  listWorkDeliverableLinks,
} from "@/lib/api/work-deliverables.functions";
import {
  getWorkGraphOverview,
  listWorkGraphTargets,
  rebuildWorkGraph,
  unlinkWorkEntities,
} from "@/lib/api/work-graph.functions";
import {
  autoLinkWorkGraphMatches,
  proposeWorkGraphMatches,

  type WorkGraphMatchSuggestion,
} from "@/lib/api/work-products-docx.functions";
import { WorkGraphSharePanel } from "./work-graph-share";

type TargetType = "TASK" | "MEETING" | "MEETING_ARTIFACT" | "DOCUMENT";

const TYPE_LABEL: Record<TargetType, string> = {
  TASK: "Công việc",
  MEETING: "Cuộc họp",
  MEETING_ARTIFACT: "Quyết định / Biên bản",
  DOCUMENT: "Tài liệu",
};

export function WorkGraphLinksPanel({ workProductId }: { workProductId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState<TargetType>("TASK");
  const [q, setQ] = useState("");
  const [relationship, setRelationship] = useState<"REFERENCES" | "RELATED_TO">("REFERENCES");
  const [matches, setMatches] = useState<WorkGraphMatchSuggestion[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const { data: links } = useQuery({
    queryKey: ["work-deliverable-links", workProductId],
    queryFn: () => listWorkDeliverableLinks({ data: { id: workProductId } }),
  });
  const { data: overview } = useQuery({
    queryKey: ["work-graph-overview"],
    queryFn: () => getWorkGraphOverview(),
  });
  const { data: targets, isFetching } = useQuery({
    queryKey: ["work-graph-targets", type, q],
    queryFn: () => listWorkGraphTargets({ data: { type, q, limit: 20 } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["work-deliverable-links", workProductId] });
    qc.invalidateQueries({ queryKey: ["work-graph-overview"] });
  };

  const linkMut = useMutation({
    mutationFn: (target: { type: TargetType; id: string }) =>
      linkWorkDeliverable({
        data: {
          id: workProductId,
          targetType: target.type,
          targetId: target.id,
          relationship,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Đã liên kết vào bản đồ công việc");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không liên kết được"),
  });

  const unlinkMut = useMutation({
    mutationFn: (edgeId: string) => unlinkWorkEntities({ data: { edgeId } }),
    onSuccess: () => {
      toast.success("Đã gỡ liên kết");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không gỡ được liên kết"),
  });

  const rebuildMut = useMutation({
    mutationFn: () => rebuildWorkGraph(),
    onSuccess: (r) => {
      toast.success(`Đã dựng lại: +${r.nodesAdded} điểm, +${r.edgesAdded} liên kết`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không dựng lại được bản đồ"),
  });

  // Gợi ý AI: đọc nội dung tài liệu rồi ghép vào công việc/cuộc họp đã có.
  const suggestMut = useMutation({
    mutationFn: () =>
      proposeWorkGraphMatches({
        data: {
          id: workProductId,
          locale: "vi",
          idempotencyKey: crypto.randomUUID(),
        } as any,
      }),

    onSuccess: (rows) => {
      setMatches(rows);
      setPicked(
        Object.fromEntries(
          rows
            .filter((r) => r.confidence >= 60)
            .map((r) => [`${r.targetType}:${r.targetId}`, true]),
        ),
      );
      if (!rows.length) toast.info("Chưa tìm thấy mục nào đủ căn cứ để gắn");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không phân tích được nội dung"),
  });

  const linkPickedMut = useMutation({
    mutationFn: async () => {
      const rows = (matches ?? []).filter((r) => picked[`${r.targetType}:${r.targetId}`]);
      for (const r of rows) {
        await linkWorkDeliverable({
          data: {
            id: workProductId,
            targetType: r.targetType,
            targetId: r.targetId,
            relationship: "REFERENCES",
          } as any,
  });

  // Gắn thật: AI đối chiếu nội dung rồi tạo liên kết ngay, không chỉ đề xuất.
  type AutoLinkResult = {
    linked: WorkGraphMatchSuggestion[];
    skipped: WorkGraphMatchSuggestion[];
    failed: Array<{ title: string; message: string }>;
    minConfidence: number;
    evaluated: number;
  };
  const [autoLinkResult, setAutoLinkResult] = useState<AutoLinkResult | null>(null);
  const autoLinkMut = useMutation({
    mutationFn: () =>
      autoLinkWorkGraphMatches({
        data: { id: workProductId, locale: "vi", idempotencyKey: crypto.randomUUID() } as any,
      }) as Promise<AutoLinkResult>,
    onSuccess: (r) => {
      setAutoLinkResult(r);
      setMatches(r.skipped.length ? r.skipped : null);
      setPicked({});
      if (r.linked.length) toast.success(`Đã gắn ${r.linked.length} mục vào bản đồ công việc`);
      else toast.info("Chưa có mục nào đủ căn cứ để gắn tự động");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không gắn được theo nội dung"),
  });

      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Đã gắn ${n} mục vào bản đồ công việc`);
      setMatches((cur) => (cur ?? []).filter((r) => !picked[`${r.targetType}:${r.targetId}`]));
      setPicked({});
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không gắn được"),
  });

  const pickedCount = Object.values(picked).filter(Boolean).length;

  const linkedIds = new Set((links ?? []).map((l: any) => `${l.entityType}:${l.entityId}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
        <span className="text-xs text-muted-foreground">
          Bản đồ tổ chức: {overview?.nodes ?? 0} điểm · {overview?.edges ?? 0} liên kết
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <WorkGraphSharePanel />
        </div>
        {overview?.canRebuild && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={rebuildMut.isPending}
            onClick={() => rebuildMut.mutate()}
          >
            {rebuildMut.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Dựng lại bản đồ
          </Button>
        )}
      </div>

      {/* Gắn tự động theo nội dung: AI đối chiếu tài liệu với công việc đã có */}
      <div className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">Gắn theo nội dung tài liệu</h4>
          <Button
            size="sm"
            className="ml-auto"
            disabled={autoLinkMut.isPending || suggestMut.isPending}
            onClick={() => autoLinkMut.mutate()}
          >
            {autoLinkMut.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            Gắn tự động theo nội dung
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={suggestMut.isPending || autoLinkMut.isPending}
            onClick={() => suggestMut.mutate()}
          >
            {suggestMut.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Chỉ đề xuất để duyệt
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "Gắn tự động" đọc nội dung thật của tài liệu và gắn ngay vào công việc, cuộc họp, biên bản
          khớp nhất (từ mức tin cậy 55% trở lên). Bạn có thể gỡ lại bất cứ lúc nào ở danh sách liên
          kết bên dưới.
        </p>
        {autoLinkResult && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
            <p>
              Đã đối chiếu {autoLinkResult.evaluated} mục, gắn {autoLinkResult.linked.length} mục.
            </p>
            {autoLinkResult.linked.map((m) => (
              <p key={`${m.targetType}:${m.targetId}`}>
                <span className="font-medium">
                  {TYPE_LABEL[m.targetType as TargetType] ?? m.targetType}: {m.title} (
                  {m.confidence}%)
                </span>{" "}
                <span className="text-muted-foreground">— {m.reason}</span>
              </p>
            ))}
            {autoLinkResult.failed.map((f, i) => (
              <p key={`f${i}`} className="text-destructive">
                Không gắn được {f.title}: {f.message}
              </p>
            ))}
          </div>
        )}

        {matches !== null && matches.length === 0 && !suggestMut.isPending && (
          <p className="text-xs text-muted-foreground">
            Không có mục nào đủ căn cứ. Bạn vẫn có thể chọn thủ công bên dưới.
          </p>
        )}
        {(matches ?? []).length > 0 && (
          <div className="space-y-1">
            {(matches ?? []).map((m) => {
              const key = `${m.targetType}:${m.targetId}`;
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent/40"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!picked[key]}
                    onChange={(e) => setPicked((cur) => ({ ...cur, [key]: e.target.checked }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{TYPE_LABEL[m.targetType]}</Badge>
                      <span className="font-medium">{m.title}</span>
                      {m.subtitle && (
                        <span className="text-xs text-muted-foreground">{m.subtitle}</span>
                      )}
                      <Badge variant="secondary">{m.confidence}%</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{m.reason}</span>
                  </span>
                </label>
              );
            })}
            <Button
              size="sm"
              className="mt-1"
              disabled={pickedCount === 0 || linkPickedMut.isPending}
              onClick={() => linkPickedMut.mutate()}
            >
              {linkPickedMut.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
              Gắn {pickedCount} mục đã chọn
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap gap-2">
          <Select value={type} onValueChange={(v) => setType(v as TargetType)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABEL) as TargetType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {TYPE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={relationship} onValueChange={(v) => setRelationship(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REFERENCES">Tham chiếu</SelectItem>
              <SelectItem value="RELATED_TO">Liên quan</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên…"
            className="min-w-[180px] flex-1"
          />
        </div>

        <div className="max-h-64 space-y-1 overflow-auto">
          {isFetching && <p className="p-2 text-xs text-muted-foreground">Đang tải…</p>}
          {!isFetching && (targets ?? []).length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Không có mục nào phù hợp.</p>
          )}
          {(targets ?? []).map((tItem) => {
            const already = linkedIds.has(`${tItem.type}:${tItem.id}`);
            return (
              <div
                key={`${tItem.type}:${tItem.id}`}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{tItem.title}</p>
                  {tItem.subtitle && (
                    <p className="truncate text-[11px] text-muted-foreground">{tItem.subtitle}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={already ? "ghost" : "outline"}
                  disabled={already || linkMut.isPending}
                  onClick={() => linkMut.mutate({ type: tItem.type, id: tItem.id })}
                >
                  <Link2 />
                  {already ? "Đã liên kết" : "Liên kết"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {(links ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có liên kết nào.</p>
        )}
        {(links ?? []).map((l: any) => (
          <div
            key={l.edgeId}
            className="flex items-center gap-2 rounded-lg border bg-background p-3"
          >
            <Badge variant="outline" className="text-[10px]">
              {TYPE_LABEL[l.entityType as TargetType] ?? l.entityType}
            </Badge>
            <span className="truncate text-xs text-muted-foreground">{l.relationship}</span>
            <a
              href={workEntityHref(l.entityType, l.entityId)}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Mở
            </a>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Gỡ liên kết"
              disabled={unlinkMut.isPending}
              onClick={() => unlinkMut.mutate(l.edgeId)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
