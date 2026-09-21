// Build Work Product — sau khi AI trả lời xong, người dùng chọn dạng kết quả và
// UniWork dựng bản nháp thật trong Kết quả công việc, tự chiếu vào Work Graph.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileBarChart, FileSpreadsheet, FileText, Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildWorkProduct,
  type WorkProductBuildKind,
} from "@/lib/api/work-product-build.functions";
import type { AiContextEntityType } from "@/domain/ai-context/contracts";
import { useI18n } from "@/lib/i18n";

const KINDS: Array<{ kind: WorkProductBuildKind; icon: typeof FileText }> = [
  { kind: "REPORT", icon: FileBarChart },
  { kind: "PROPOSAL", icon: FileText },
  { kind: "PRESENTATION", icon: Presentation },
  { kind: "SPREADSHEET", icon: FileSpreadsheet },
];

export function BuildWorkProductBar({
  brief,
  workspaceId,
  conversationId,
  sourceEntities,
}: {
  brief: string;
  workspaceId?: string | null;
  conversationId?: string | null;
  sourceEntities: Array<{ type: AiContextEntityType; id: string }>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildFn = useServerFn(buildWorkProduct);
  const [running, setRunning] = useState<WorkProductBuildKind | null>(null);
  const [built, setBuilt] = useState<{ id: string; title: string } | null>(null);

  const build = useMutation({
    mutationFn: (kind: WorkProductBuildKind) =>
      buildFn({
        data: {
          idempotencyKey: crypto.randomUUID(),
          kind,
          brief: brief.slice(0, 8000),
          ...(workspaceId ? { workspaceId } : {}),
          ...(conversationId ? { conversationId } : {}),
          sourceEntities,
        },
      }),
    onSuccess: (result) => {
      setBuilt({ id: result.id, title: result.title });
      setRunning(null);
      toast.success(t("m.wp.built"));
    },
    onError: () => {
      setRunning(null);
      toast.error(t("m.wp.buildError"));
    },
  });

  if (built) {
    return (
      <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
        <p className="text-[13px] font-medium">{built.title}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 min-h-11"
          onClick={() => void navigate({ to: "/work-products/$id", params: { id: built.id } })}
        >
          {t("m.wp.open")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("m.wp.buildHint")}</p>
      <div className="flex flex-wrap gap-2">
        {KINDS.map(({ kind, icon: Icon }) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            className="min-h-11 gap-2"
            disabled={build.isPending}
            onClick={() => {
              setRunning(kind);
              build.mutate(kind);
            }}
          >
            {running === kind ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {t(`wp.type.${kind}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
