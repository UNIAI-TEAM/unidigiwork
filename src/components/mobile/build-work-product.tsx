// Work Product thật — không hiện thanh chọn nữa: khi yêu cầu của người dùng nêu
// rõ loại kết quả (báo cáo / đề xuất / bài trình bày / bảng tính), UniWork tự
// soạn và ghi từng kết quả vào bảng nguồn, rồi chiếu vào Work Graph.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildWorkProduct,
  type WorkProductBuildKind,
} from "@/lib/api/work-product-build.functions";
import type { AiContextEntityType } from "@/domain/ai-context/contracts";
import { useI18n } from "@/lib/i18n";

const ICONS: Record<WorkProductBuildKind, typeof FileText> = {
  REPORT: FileBarChart,
  PROPOSAL: FileText,
  PRESENTATION: Presentation,
  SPREADSHEET: FileSpreadsheet,
};

type BuildState = {
  kind: WorkProductBuildKind;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  id?: string;
  title?: string;
};

export function WorkProductRun({
  kinds,
  brief,
  workspaceId,
  sourceEntities,
}: {
  kinds: WorkProductBuildKind[];
  brief: string;
  workspaceId?: string | null;
  sourceEntities: Array<{ type: AiContextEntityType; id: string }>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildFn = useServerFn(buildWorkProduct);
  const started = useRef(false);
  const [states, setStates] = useState<BuildState[]>(() =>
    kinds.map((kind) => ({ kind, status: "PENDING" as const })),
  );

  // Giữ props mới nhất trong ref: effect chỉ chạy MỘT lần khi mount.
  // (Trước đây deps đổi theo mỗi lần render tạo mảng mới → cleanup huỷ cập nhật
  // trạng thái trong khi `started` chặn chạy lại → thanh tiến trình kẹt ở "đang soạn".)
  const argsRef = useRef({ kinds, brief, workspaceId, sourceEntities });
  argsRef.current = { kinds, brief, workspaceId, sourceEntities };

  useEffect(() => {
    const { kinds: kindList, brief: briefText, workspaceId: wsId } = argsRef.current;
    if (started.current || kindList.length === 0) return;
    started.current = true;
    let cancelled = false;

    void (async () => {
      for (const kind of kindList) {
        if (cancelled) return;
        setStates((current) =>
          current.map((item) => (item.kind === kind ? { ...item, status: "RUNNING" } : item)),
        );
        try {
          const result = await buildFn({
            data: {
              idempotencyKey: crypto.randomUUID(),
              kind,
              brief: briefText.slice(0, 8000),
              ...(wsId ? { workspaceId: wsId } : {}),
              sourceEntities: argsRef.current.sourceEntities,
            },
          });
          if (cancelled) return;
          setStates((current) =>
            current.map((item) =>
              item.kind === kind
                ? { ...item, status: "DONE", id: result.id, title: result.title }
                : item,
            ),
          );
        } catch {
          if (cancelled) return;
          setStates((current) =>
            current.map((item) => (item.kind === kind ? { ...item, status: "FAILED" } : item)),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brief, buildFn, kinds, sourceEntities, workspaceId]);

  if (states.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{t("m.wp.running")}</p>
      <ul className="space-y-2">
        {states.map((state) => {
          const Icon = ICONS[state.kind];
          return (
            <li key={state.kind} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                {state.status === "RUNNING" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : state.status === "DONE" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : state.status === "FAILED" ? (
                  <TriangleAlert className="h-4 w-4 text-destructive" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {state.title ?? t(`wp.type.${state.kind}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.status === "DONE"
                    ? t("m.wp.built")
                    : state.status === "FAILED"
                      ? t("m.wp.buildError")
                      : state.status === "RUNNING"
                        ? t("m.wp.building")
                        : t("m.wp.queued")}
                </p>
              </div>
              {state.status === "DONE" && state.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0"
                  onClick={() =>
                    void navigate({ to: "/work-products/$id", params: { id: state.id! } })
                  }
                >
                  {t("m.wp.open")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
