// AI CONTEXT ENGINE V1 — bề mặt trả lời grounded tối giản (Answer + Sources).
// Chỉ gọi khi người dùng chủ động hỏi (lazy, không auto-retrieve khi load trang).
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { askUni } from "@/lib/api/ai-context.functions";
import type { AiContextEntityType, AiGroundedResponse } from "@/domain/ai-context/contracts";
import { validateAnswerCitations } from "@/domain/ai-context/citations";

const KIND_LABEL: Record<AiContextEntityType, string> = {
  WORKSPACE: "Dự án",
  TASK: "Công việc",
  MEETING: "Cuộc họp",
  EMAIL: "Email",
  DOCUMENT: "Tài liệu",
  CHAT_CHANNEL: "Kênh chat",
  PERSON: "Thành viên",
  TENANT: "Tổ chức",
};

export function AskUniPanel({
  rootEntity,
  workspaceId,
  suggestions = ["Đang vướng gì?", "Tóm tắt tình trạng hiện tại", "Tuần này có trao đổi gì?"],
  label = "Hỏi UNI",
}: {
  rootEntity?: { type: AiContextEntityType; id: string };
  workspaceId?: string | null;
  suggestions?: string[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AiGroundedResponse | null>(null);
  const navigate = useNavigate();
  const ask = useServerFn(askUni);

  const mutation = useMutation({
    mutationFn: (q: string) =>
      ask({ data: { query: q, rootEntity: rootEntity ?? null, workspaceId: workspaceId ?? null } }),
    onSuccess: (data) => setResult(data),
  });

  const submit = (q: string) => {
    const value = q.trim();
    if (value.length < 2) return;
    setQuery(value);
    setResult(null);
    mutation.mutate(value);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> {label}
          </DialogTitle>
          <DialogDescription>
            Trả lời dựa trên dữ liệu bạn được phép xem, kèm nguồn trích dẫn.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
        >
          <Input
            aria-label="Câu hỏi cho UNI"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ví dụ: Dự án này đang vướng gì?"
          />
          <Button type="submit" disabled={mutation.isPending || query.trim().length < 2}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        {!result && !mutation.isPending && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button key={s} type="button" variant="secondary" size="sm" onClick={() => submit(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            Chưa thể trả lời lúc này. Vui lòng thử lại.
          </p>
        )}

        {result && (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {validateAnswerCitations(result.answer, result.sources).segments.map((seg, i) =>
                seg.type === "citation" && seg.source ? (
                  <button
                    key={`${seg.source.sourceId}-${i}`}
                    type="button"
                    title={seg.source.title}
                    className="mx-0.5 rounded bg-primary/10 px-1 align-baseline text-xs font-medium text-primary hover:bg-primary/20"
                    onClick={() => {
                      setOpen(false);
                      navigate({ href: seg.source!.href } as never);
                    }}
                  >
                    {seg.text}
                  </button>
                ) : (
                  <span key={`t-${i}`}>{seg.text}</span>
                ),
              )}
            </p>
            {result.partial && (
              <p className="text-xs text-muted-foreground">
                Một số nguồn chưa kiểm tra được trong lần này.
              </p>
            )}
            {result.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nguồn</p>
                <div className="flex flex-wrap gap-2">
                  {result.sources.map((s) => (
                    <button
                      key={s.sourceId}
                      type="button"
                      className="max-w-full truncate rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-muted"
                      onClick={() => {
                        setOpen(false);
                        navigate({ href: s.href } as never);
                      }}
                    >
                      {KIND_LABEL[s.entityType]} · {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}