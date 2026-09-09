// Tài liệu Word đã nhập — sửa từng đoạn, xem đối chiếu và vá giữ nguyên bản gốc.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  GitCompare,
  ListChecks,
  Loader2,
  Lock,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  applyWorkProductAcceptedChanges,
  decideWorkProductChangeOps,
  listWorkProductBlocks,
  listWorkProductChangeOps,
  proposeAiWorkProductBlockEdits,
  proposeWorkProductChanges,
  proposeTasksFromWorkProduct,
  createTasksFromWorkProduct,
  listWorkProductDocxVersions,
  compareWorkProductDocxVersions,
  reanalyzeWorkProductDocx,
} from "@/lib/api/work-products-docx.functions";

const WEIGHT_KEYS = ["title", "heading", "listItem", "quote", "caption", "table"] as const;
type WeightKey = (typeof WEIGHT_KEYS)[number];
type Weights = Record<WeightKey, number>;

const DEFAULT_WEIGHTS: Weights = {
  title: 1,
  heading: 1,
  listItem: 1,
  quote: 1,
  caption: 1,
  table: 1,
};

const WEIGHT_LABELS: Record<WeightKey, string> = {
  title: "Tiêu đề tài liệu",
  heading: "Tiêu đề mục",
  listItem: "Gạch đầu dòng",
  quote: "Trích dẫn",
  caption: "Chú thích",
  table: "Bảng",
};

const ROLE_LABELS: Record<string, string> = {
  TITLE: "Tiêu đề tài liệu",
  HEADING: "Tiêu đề mục",
  PARAGRAPH: "Đoạn văn",
  LIST_ITEM: "Gạch đầu dòng",
  TABLE: "Bảng",
  QUOTE: "Trích dẫn",
  CAPTION: "Chú thích",
  FOOTNOTE: "Chú thích cuối trang",
  OTHER: "Khác",
};

const WEIGHTS_STORAGE_KEY = "uniwork.docx-detection-weights";

type DocxVersion = {
  id: string;
  role: string;
  version: number | null;
  created_at: string;
};

type DiffWord = { op: "same" | "del" | "ins"; text: string };
type DiffRow = {
  key: string;
  ordinal: number;
  blockType: string;
  change: "ADDED" | "REMOVED" | "MODIFIED";
  before: string;
  after: string;
  words: DiffWord[];
};
type CompareResult = {
  base: { id: string; role: string; version: number | null };
  target: { id: string; role: string; version: number | null };
  totals: {
    changed: number;
    added: number;
    removed: number;
    modified: number;
  };
  diffs: DiffRow[];
};

const versionLabel = (v: DocxVersion) =>
  v.role === "SOURCE_ORIGINAL" ? "Bản gốc" : `Phiên bản ${v.version ?? "?"}`;

type BlockAnchor = {
  role?: string | null;
  headingLevel?: number | null;
  section?: string | null;
  score?: number | null;
  signals?: string[] | null;
  table?: { rows?: number; cols?: number; headerConfidence?: number } | null;
} | null;

type Block = {
  id: string;
  block_key: string;
  ordinal: number;
  block_type: string;
  text: string | null;
  editability: string;
  source_anchor?: BlockAnchor;
};

type ChangeOp = {
  id: string;
  block_key: string;
  before_text: string;
  after_text: string;
  origin: string;
  status: string;
};

export function DocxRoundTripPanel({
  productId,
  activeSources,
}: {
  productId: string;
  activeSources: Array<{ type: string; id: string }>;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [taskSuggestions, setTaskSuggestions] = useState<
    Array<{ title: string; priority: string; checked: boolean }>
  >([]);
  const [followUps, setFollowUps] = useState<
    Array<{ kind: "TASK" | "DECISION" | "MEETING"; title: string; detail: string; priority: string; checked: boolean }>
  >([]);
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);

  // Trọng số lưu theo trình duyệt của người dùng, đọc sau khi gắn để tránh lệch hiển thị.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WEIGHTS_STORAGE_KEY);
      if (raw) setWeights({ ...DEFAULT_WEIGHTS, ...(JSON.parse(raw) as Partial<Weights>) });
    } catch {
      /* bỏ qua dữ liệu hỏng */
    }
  }, []);

  const saveWeights = (next: Weights) => {
    setWeights(next);
    try {
      localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua khi trình duyệt chặn lưu */
    }
  };

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["wp-blocks", productId],
    queryFn: () => listWorkProductBlocks({ data: { id: productId } }) as Promise<Block[]>,
  });
  const { data: ops } = useQuery({
    queryKey: ["wp-change-ops", productId],
    queryFn: () => listWorkProductChangeOps({ data: { id: productId } }) as Promise<ChangeOp[]>,
  });

  const [showCompare, setShowCompare] = useState(false);
  const [baseId, setBaseId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const { data: versions } = useQuery({
    queryKey: ["wp-docx-versions", productId],
    queryFn: () =>
      listWorkProductDocxVersions({ data: { id: productId } }) as Promise<DocxVersion[]>,
  });
  const compare = useMutation({
    mutationFn: () =>
      compareWorkProductDocxVersions({
        data: {
          id: productId,
          ...(baseId ? { baseArtifactId: baseId } : {}),
          ...(targetId ? { targetArtifactId: targetId } : {}),
        },
      }) as Promise<CompareResult>,
    onSuccess: () => setShowCompare(true),
    onError: (e: any) =>
      toast.error(
        e?.message?.includes("NOT_ENOUGH_VERSIONS")
          ? "Chưa có phiên bản sửa đổi để so sánh."
          : "Không so sánh được hai bản.",
      ),
  });

  const reanalyze = useMutation({
    mutationFn: () => reanalyzeWorkProductDocx({ data: { id: productId, weights } }),
    onSuccess: (r: { updated: number; counts: Record<string, number> }) => {
      qc.invalidateQueries({ queryKey: ["wp-blocks", productId] });
      toast.success(`Đã nhận diện lại ${r.updated} đoạn`);
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("NOT_IMPORTED_DOCX")
          ? "Chỉ áp dụng cho tài liệu Word đã nhập."
          : "Không phân tích lại được tài liệu.",
      ),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wp-change-ops", productId] });
    qc.invalidateQueries({ queryKey: ["wp-blocks", productId] });
    qc.invalidateQueries({ queryKey: ["work-deliverable", productId] });
  };

  const pending = useMemo(() => (ops ?? []).filter((o) => o.status === "PENDING"), [ops]);
  const accepted = useMemo(() => (ops ?? []).filter((o) => o.status === "ACCEPTED"), [ops]);

  const propose = useMutation({
    mutationFn: (v: { blockId: string; after: string }) =>
      proposeWorkProductChanges({ data: { id: productId, changes: [v], origin: "HUMAN" } }),
    onSuccess: () => {
      setSelected(null);
      setDraft("");
      refresh();
      toast.success("Đã tạo thay đổi chờ duyệt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const askAi = useMutation({
    mutationFn: (blockKeys: string[]) =>
      proposeAiWorkProductBlockEdits({
        data: { id: productId, blockKeys, instruction, sources: activeSources },
      }),
    onSuccess: () => {
      setInstruction("");
      refresh();
      toast.success("AI đã đề xuất chỉnh sửa");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestTasks = useMutation({
    mutationFn: () => proposeTasksFromWorkProduct({ data: { id: productId } }),
    onSuccess: (r: { suggestions: Array<{ title: string; priority: string }> }) => {
      setTaskSuggestions(r.suggestions.map((s) => ({ ...s, checked: true })));
      toast.success("AI đã gợi ý công việc");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createTasks = useMutation({
    mutationFn: () =>
      createTasksFromWorkProduct({
        data: {
          id: productId,
          tasks: taskSuggestions
            .filter((t) => t.checked)
            .map((t) => ({ title: t.title, priority: t.priority as "low" })),
        },
      }),
    onSuccess: (r: { created: Array<{ id: string }> }) => {
      setTaskSuggestions([]);
      qc.invalidateQueries({ queryKey: ["work-deliverable-links", productId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Đã tạo ${r.created.length} công việc và liên kết vào tài liệu`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (v: { changeIds?: string[]; decision: "ACCEPTED" | "REJECTED"; all?: boolean }) =>
      decideWorkProductChangeOps({
        data: { id: productId, changeIds: v.changeIds, decision: v.decision, all: v.all ?? false },
      }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestFollowUps = useMutation({
    mutationFn: (version?: number) =>
      proposeFollowUpsFromDocxChanges({
        data: { id: productId, ...(version ? { version } : {}) },
      }),
    onSuccess: (r: {
      suggestions: Array<{
        kind: "TASK" | "DECISION" | "MEETING";
        title: string;
        detail: string;
        priority: string;
      }>;
    }) => {
      setFollowUps(r.suggestions.map((s) => ({ ...s, checked: true })));
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("NO_APPLIED_CHANGES")
          ? "Chưa có thay đổi nào được áp dụng để phân tích."
          : "Chưa gợi ý được hành động tiếp theo.",
      ),
  });

  const createFollowUps = useMutation({
    mutationFn: () =>
      createFollowUpsFromWorkProduct({
        data: {
          id: productId,
          items: followUps
            .filter((f) => f.checked)
            .map((f) => ({
              kind: f.kind,
              title: f.title,
              detail: f.detail,
              priority: f.priority as "low",
            })),
        },
      }),
    onSuccess: (r: { created: Array<{ kind: string }> }) => {
      setFollowUps([]);
      qc.invalidateQueries({ queryKey: ["work-deliverable-links", productId] });
      qc.invalidateQueries({ queryKey: ["work-deliverable-comments", productId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success(`Đã tạo ${r.created.length} mục tiếp theo`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: () => applyWorkProductAcceptedChanges({ data: { id: productId } }),
    onSuccess: (r: { version: number; preservation: { preservedRatio: number } }) => {
      refresh();
      toast.success(
        `Đã tạo phiên bản v${r.version} — giữ nguyên ${r.preservation.preservedRatio}% cấu trúc gốc`,
      );
      // Sau khi chấp nhận, tự động phân tích nội dung vừa đổi để gợi ý bước tiếp theo.
      suggestFollowUps.mutate(r.version);
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("PATCH_UNSAFE")
          ? "Phần này của tài liệu chưa thể sửa an toàn mà vẫn giữ nguyên định dạng gốc."
          : e.message,
      ),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const editable = (blocks ?? []).filter((b) => b.editability === "EDITABLE");
  const roleCounts = (blocks ?? []).reduce<Record<string, number>>((acc, b) => {
    const role = b.source_anchor?.role || "PARAGRAPH";
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Word · giữ nguyên bản gốc</Badge>
        <span className="text-xs text-muted-foreground">
          {editable.length}/{(blocks ?? []).length} đoạn có thể sửa
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => setShowWeights((v) => !v)}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Cấu hình nhận diện
        </Button>
      </div>

      {/* Trọng số nhận diện từng loại nội dung */}
      {showWeights && (
        <Card className="space-y-3 p-3">
          <p className="text-xs text-muted-foreground">
            Tăng trọng số nếu tài liệu của bạn hay bị bỏ sót loại đó; giảm nếu bị nhận nhầm. Chỉ ảnh
            hưởng cách đọc hiểu, không sửa tệp gốc.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {WEIGHT_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{WEIGHT_LABELS[k]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {weights[k].toFixed(1)}×
                  </span>
                </div>
                <Slider
                  value={[weights[k]]}
                  min={0}
                  max={2}
                  step={0.1}
                  onValueChange={(v) => saveWeights({ ...weights, [k]: v[0] ?? 1 })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={reanalyze.isPending}
              onClick={() => reanalyze.mutate()}
            >
              {reanalyze.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3" />
              )}
              Nhận diện lại tài liệu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => saveWeights(DEFAULT_WEIGHTS)}
            >
              <RotateCcw className="h-3 w-3" />
              Mặc định
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(roleCounts).map(([role, n]) => (
              <Badge key={role} variant="outline" className="text-[10px]">
                {ROLE_LABELS[role] ?? role}: {n}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* So sánh bản gốc và bản đã sửa */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">So sánh bản gốc và bản đã sửa</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={compare.isPending || (versions ?? []).length < 2}
            onClick={() => compare.mutate()}
          >
            {compare.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <GitCompare className="h-3 w-3" />
            )}
            So sánh nội dung
          </Button>
        </div>

        {(versions ?? []).length >= 2 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="h-8 rounded-md border bg-background px-2"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
            >
              <option value="">Bản gốc</option>
              {(versions ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">so với</span>
            <select
              className="h-8 rounded-md border bg-background px-2"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Bản mới nhất</option>
              {(versions ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Cần ít nhất một phiên bản đã sửa để so sánh.
          </p>
        )}

        {showCompare && compare.data && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{compare.data.totals.changed} đoạn khác nhau</Badge>
              <Badge variant="outline">Sửa {compare.data.totals.modified}</Badge>
              <Badge variant="outline">Thêm {compare.data.totals.added}</Badge>
              <Badge variant="outline">Xoá {compare.data.totals.removed}</Badge>
              <button
                type="button"
                className="ml-auto text-muted-foreground underline"
                onClick={() => setShowCompare(false)}
              >
                Ẩn
              </button>
            </div>

            {compare.data.diffs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Hai bản có nội dung giống nhau.</p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {compare.data.diffs.map((d) => (
                  <div key={d.key} className="rounded-md border p-2 text-xs">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {d.change === "ADDED"
                          ? "Thêm mới"
                          : d.change === "REMOVED"
                            ? "Đã xoá"
                            : "Đã sửa"}
                      </Badge>
                      <span className="text-muted-foreground">Đoạn {d.ordinal}</span>
                    </div>
                    <p className="leading-relaxed">
                      {d.words.map((w, i) => (
                        <span
                          key={`${d.key}-${i}`}
                          className={cn(
                            w.op === "del" &&
                              "bg-destructive/10 text-destructive line-through decoration-destructive/60",
                            w.op === "ins" && "bg-primary/10 text-primary",
                          )}
                        >
                          {w.text}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tạo công việc từ tài liệu */}
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">Tạo công việc từ tài liệu</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={suggestTasks.isPending}
            onClick={() => suggestTasks.mutate()}
          >
            {suggestTasks.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ListChecks className="h-3 w-3" />
            )}
            Gợi ý công việc
          </Button>
        </div>
        {taskSuggestions.length > 0 && (
          <div className="space-y-1">
            {taskSuggestions.map((t, i) => (
              <label
                key={`${t.title}-${i}`}
                className="flex items-start gap-2 rounded-md border p-2 text-xs"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={t.checked}
                  onChange={(e) =>
                    setTaskSuggestions((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, checked: e.target.checked } : x)),
                    )
                  }
                />
                <span className="flex-1">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t.priority}
                </Badge>
              </label>
            ))}
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={createTasks.isPending || !taskSuggestions.some((t) => t.checked)}
              onClick={() => createTasks.mutate()}
            >
              {createTasks.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Tạo công việc đã chọn
            </Button>
          </div>
        )}
      </Card>

      {/* Nhờ AI sửa */}
      <Card className="space-y-2 p-3">
        <p className="text-xs font-medium">Nhờ AI đề xuất chỉnh sửa</p>
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ví dụ: đổi thời hạn thanh toán thành 60 ngày và viết trang trọng hơn"
          className="min-h-[64px] text-sm"
        />
        <Button
          size="sm"
          className="gap-2"
          disabled={!instruction.trim() || !selected || askAi.isPending}
          onClick={() => selected && askAi.mutate([selected])}
        >
          {askAi.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Đề xuất cho đoạn đang chọn
        </Button>
      </Card>

      {/* Danh sách đoạn */}
      <div className="space-y-2">
        {(blocks ?? []).map((b) => {
          const locked = b.editability !== "EDITABLE";
          const isOpen = selected === b.block_key;
          return (
            <div
              key={b.id}
              className={cn(
                "rounded-lg border p-3 text-sm",
                locked && "bg-muted/40",
                isOpen && "border-primary",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {ROLE_LABELS[b.source_anchor?.role || "PARAGRAPH"] ?? "Đoạn văn"}
                  {b.source_anchor?.headingLevel ? ` ${b.source_anchor.headingLevel}` : ""}
                </Badge>
                {b.source_anchor?.table && (
                  <Badge variant="outline" className="text-[10px]">
                    {b.source_anchor.table.rows ?? 0}×{b.source_anchor.table.cols ?? 0} ô
                  </Badge>
                )}
                {(b.source_anchor?.signals ?? []).slice(0, 3).map((s) => (
                  <span key={s} className="text-[10px] text-muted-foreground">
                    · {s}
                  </span>
                ))}
              </div>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                  {b.text || <span className="text-muted-foreground">(không có nội dung chữ)</span>}
                </p>
                {locked ? (
                  <Lock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-label="Giữ nguyên"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => {
                      setSelected(isOpen ? null : b.block_key);
                      setDraft(b.text ?? "");
                    }}
                  >
                    {isOpen ? "Đóng" : "Sửa"}
                  </Button>
                )}
              </div>
              {isOpen && !locked && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-[80px] text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!draft.trim() || draft === b.text || propose.isPending}
                    onClick={() => propose.mutate({ blockId: b.id, after: draft })}
                  >
                    Gửi thay đổi
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Đối chiếu thay đổi */}
      {pending.length > 0 && (
        <Card className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Đối chiếu thay đổi ({pending.length})</p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => decide.mutate({ decision: "ACCEPTED", all: true })}
              >
                Chấp nhận tất cả
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => decide.mutate({ decision: "REJECTED", all: true })}
              >
                Từ chối tất cả
              </Button>
            </div>
          </div>
          {pending.map((o) => (
            <div key={o.id} className="rounded-md border p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge
                  variant={o.origin === "AI" ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {o.origin === "AI" ? "AI đề xuất" : "Người dùng sửa"}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-destructive">- {o.before_text}</p>
              <p className="whitespace-pre-wrap text-emerald-600 dark:text-emerald-400">
                + {o.after_text}
              </p>
              <div className="mt-2 flex gap-1">
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => decide.mutate({ changeIds: [o.id], decision: "ACCEPTED" })}
                >
                  <Check className="h-3 w-3" /> Chấp nhận
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => decide.mutate({ changeIds: [o.id], decision: "REJECTED" })}
                >
                  <X className="h-3 w-3" /> Từ chối
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Áp dụng */}
      {accepted.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
          <p className="text-xs text-muted-foreground">
            {accepted.length} thay đổi đã chấp nhận, chờ ghi vào tệp Word mới.
          </p>
          <Button
            size="sm"
            className="gap-2"
            disabled={apply.isPending}
            onClick={() => apply.mutate()}
          >
            {apply.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="h-4 w-4" />
            )}
            Tạo phiên bản Word mới
          </Button>
        </Card>
      )}
    </div>
  );
}
