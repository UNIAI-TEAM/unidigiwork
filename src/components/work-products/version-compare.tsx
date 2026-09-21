import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWorkDeliverableVersion } from "@/lib/api/work-deliverables.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type DiffRow = { kind: "same" | "add" | "del"; text: string };

/** Diff theo dòng (LCS) — đủ cho văn bản Markdown của kết quả công việc. */
function diffLines(before: string, after: string): { left: DiffRow[]; right: DiffRow[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const left: DiffRow[] = [];
  const right: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      left.push({ kind: "same", text: a[i]! });
      right.push({ kind: "same", text: b[j]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      left.push({ kind: "del", text: a[i]! });
      i += 1;
    } else {
      right.push({ kind: "add", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) left.push({ kind: "del", text: a[i++]! });
  while (j < m) right.push({ kind: "add", text: b[j++]! });
  return { left, right };
}

function Column({ rows, title }: { rows: DiffRow[]; title: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border bg-background">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-96 overflow-auto px-3 py-2 text-[12px] leading-5">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className={cn(
              "whitespace-pre-wrap break-words rounded px-1",
              r.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              r.kind === "del" && "bg-destructive/10 text-destructive line-through",
            )}
          >
            {r.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

/** So sánh nội dung hai phiên bản của cùng một kết quả công việc. */
export function VersionCompare({
  id,
  beforeVersion,
  afterVersion,
  onClose,
}: {
  id: string;
  beforeVersion: number;
  afterVersion: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const before = useQuery({
    queryKey: ["work-deliverable-version", id, beforeVersion],
    queryFn: () => getWorkDeliverableVersion({ data: { id, version: beforeVersion } }),
  });
  const after = useQuery({
    queryKey: ["work-deliverable-version", id, afterVersion],
    queryFn: () => getWorkDeliverableVersion({ data: { id, version: afterVersion } }),
  });

  const diff = useMemo(
    () =>
      diffLines(
        String((before.data as { content?: string } | null)?.content ?? ""),
        String((after.data as { content?: string } | null)?.content ?? ""),
      ),
    [before.data, after.data],
  );

  const loading = before.isLoading || after.isLoading;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{t("wp.compare.title")}</p>
        <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={onClose}>
          {t("wp.compare.close")}
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("wp.compare.loading")}</p>
      ) : (
        <div className="flex flex-col gap-2 lg:flex-row">
          <Column rows={diff.left} title={`${t("wp.compare.before")} · v${beforeVersion}`} />
          <Column rows={diff.right} title={`${t("wp.compare.after")} · v${afterVersion}`} />
        </div>
      )}
    </div>
  );
}
