// Tài liệu Word đã nhập — sửa từng đoạn, xem đối chiếu và vá giữ nguyên bản gốc.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Loader2, Lock, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
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
} from "@/lib/api/work-products-docx.functions";

type Block = {
  id: string;
  block_key: string;
  ordinal: number;
  block_type: string;
  text: string | null;
  editability: string;
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

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["wp-blocks", productId],
    queryFn: () => listWorkProductBlocks({ data: { id: productId } }) as Promise<Block[]>,
  });
  const { data: ops } = useQuery({
    queryKey: ["wp-change-ops", productId],
    queryFn: () => listWorkProductChangeOps({ data: { id: productId } }) as Promise<ChangeOp[]>,
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

  const apply = useMutation({
    mutationFn: () => applyWorkProductAcceptedChanges({ data: { id: productId } }),
    onSuccess: (r: { version: number; preservation: { preservedRatio: number } }) => {
      refresh();
      toast.success(
        `Đã tạo phiên bản v${r.version} — giữ nguyên ${r.preservation.preservedRatio}% cấu trúc gốc`,
      );
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Word · giữ nguyên bản gốc</Badge>
        <span className="text-xs text-muted-foreground">
          {editable.length}/{(blocks ?? []).length} đoạn có thể sửa
        </span>
      </div>

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
