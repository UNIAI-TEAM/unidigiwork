// Đối chứng bộ máy tạo tệp Office — chỉ dành cho quản trị viên (Product Lab).
// Chỉ hiển thị số liệu đo được từ tệp thật, không có chỉ số ước lượng.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminAccess } from "@/features/admin/access";
import { useI18n } from "@/lib/i18n";
import { benchmarkOfficeEngines, listOfficeEngineBenchmarks } from "@/lib/api/office-benchmark.functions";
import { getWorkDeliverableArtifactUrl } from "@/lib/api/work-deliverables.functions";

type Inspection = {
  opensSuccessfully: boolean;
  paragraphs: number;
  headings: number;
  tables: number;
  tableRows: number;
  listItems: number;
  runs: number;
  boldRuns: number;
  italicRuns: number;
  underlineRuns: number;
  pageBreaks: number;
  styleIds: string[];
  sizeBytes: number;
};

type Comparison = {
  error?: string;
  builtinRenderMs?: number;
  genofficeRenderMs?: number;
  builtin?: Inspection;
  genoffice?: Inspection;
  textSimilarity?: number;
  textIdentical?: boolean;
  missingInBuiltin?: string[];
  missingInGenoffice?: string[];
  roundTrip?: {
    unchangedParts: number;
    changedParts: number;
    addedParts: number;
    removedParts: number;
    preservedRatio: number;
    editedBlocks: number;
    totalBlocks: number;
  } | null;
};

type BenchmarkRow = {
  id: string;
  version: number;
  format: string;
  mode: string;
  status: string;
  failure_reason: string | null;
  genoffice_commit_sha: string | null;
  genoffice_engine_version: string | null;
  builtin_artifact_id: string | null;
  genoffice_artifact_id: string | null;
  comparison_json: Comparison;
  started_at: string;
  completed_at: string | null;
};

const yesNo = (v: boolean | undefined) => (v === undefined ? "—" : v ? "PASS" : "FAIL");
const num = (v: number | undefined) => (typeof v === "number" ? String(v) : "—");

function Row({ label, builtin, genoffice }: { label: string; builtin: string; genoffice: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b py-1.5 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="w-16 text-right font-medium tabular-nums">{builtin}</span>
      <span className="w-16 text-right font-medium tabular-nums">{genoffice}</span>
    </div>
  );
}

export function EngineBenchmarkPanel({ workProductId, version }: { workProductId: string; version: number }) {
  const { t } = useI18n();
  const { access } = useAdminAccess();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"GENERATE" | "ROUND_TRIP">("GENERATE");

  const list = useQuery({
    queryKey: ["work-products", workProductId, "benchmarks"],
    queryFn: () => listOfficeEngineBenchmarks({ data: { workProductId } }),
    enabled: access.isAdmin,
  });

  const run = useMutation({
    mutationFn: () => benchmarkOfficeEngines({ data: { workProductId, version, format: "DOCX", mode } }),
    onSuccess: (r) => {
      toast.success(`${t("wp.bench.title")}: ${r.status}`);
      void qc.invalidateQueries({ queryKey: ["work-products", workProductId, "benchmarks"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("wp.bench.failed")),
  });

  const download = async (artifactId: string | null) => {
    if (!artifactId) return;
    const { url } = await getWorkDeliverableArtifactUrl({ data: { artifactId } });
    window.open(url, "_blank", "noopener");
  };

  if (!access.isAdmin) return null;

  const rows = (list.data?.items ?? []) as unknown as BenchmarkRow[];
  const latest = rows[0];
  const c = latest?.comparison_json ?? {};

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{t("wp.bench.title")}</p>
        <Badge variant="outline" className="text-[10px]">
          DOCX
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t("wp.bench.hint")}</p>

      <div className="flex flex-wrap gap-2">
        {(["GENERATE", "ROUND_TRIP"] as const).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "secondary" : "outline"} onClick={() => setMode(m)}>
            {t(`wp.bench.mode.${m}` as never)}
          </Button>
        ))}
        <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending} className="gap-2">
          {run.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
          {t("wp.bench.run")}
        </Button>
      </div>

      {latest && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={latest.status === "PASSED" ? "default" : "outline"}>{latest.status}</Badge>
            <span className="text-muted-foreground">
              v{latest.version} · {latest.mode}
            </span>
            {latest.genoffice_commit_sha && (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {latest.genoffice_engine_version} @ {latest.genoffice_commit_sha.slice(0, 10)}
              </span>
            )}
          </div>

          {c.error && <p className="text-xs text-destructive">{c.error}</p>}

          {c.builtin && c.genoffice && (
            <div className="rounded-md border p-3">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-1.5 text-[11px] font-medium">
                <span>{t("wp.bench.metric")}</span>
                <span className="w-16 text-right">{t("wp.bench.builtin")}</span>
                <span className="w-16 text-right">{t("wp.bench.genoffice")}</span>
              </div>
              <Row label={t("wp.bench.opens")} builtin={yesNo(c.builtin.opensSuccessfully)} genoffice={yesNo(c.genoffice.opensSuccessfully)} />
              <Row label={t("wp.bench.paragraphs")} builtin={num(c.builtin.paragraphs)} genoffice={num(c.genoffice.paragraphs)} />
              <Row label={t("wp.bench.headings")} builtin={num(c.builtin.headings)} genoffice={num(c.genoffice.headings)} />
              <Row label={t("wp.bench.tables")} builtin={`${c.builtin.tables}/${c.builtin.tableRows}`} genoffice={`${c.genoffice.tables}/${c.genoffice.tableRows}`} />
              <Row label={t("wp.bench.lists")} builtin={num(c.builtin.listItems)} genoffice={num(c.genoffice.listItems)} />
              <Row label={t("wp.bench.styles")} builtin={`${c.builtin.boldRuns}/${c.builtin.italicRuns}/${c.builtin.underlineRuns}`} genoffice={`${c.genoffice.boldRuns}/${c.genoffice.italicRuns}/${c.genoffice.underlineRuns}`} />
              <Row label={t("wp.bench.pageBreaks")} builtin={num(c.builtin.pageBreaks)} genoffice={num(c.genoffice.pageBreaks)} />
              <Row label={t("wp.bench.missing")} builtin={num(c.missingInBuiltin?.length)} genoffice={num(c.missingInGenoffice?.length)} />
              <Row label={t("wp.bench.size")} builtin={num(c.builtin.sizeBytes)} genoffice={num(c.genoffice.sizeBytes)} />
              <Row label={t("wp.bench.time")} builtin={`${num(c.builtinRenderMs)} ms`} genoffice={`${num(c.genofficeRenderMs)} ms`} />
              {typeof c.textSimilarity === "number" && (
                <p className="pt-2 text-[11px] text-muted-foreground">
                  {t("wp.bench.similarity")}: {c.textSimilarity}%
                </p>
              )}
              {c.roundTrip && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {t("wp.bench.roundTrip")}: {c.roundTrip.unchangedParts} / {c.roundTrip.changedParts} /{" "}
                  {c.roundTrip.addedParts} / {c.roundTrip.removedParts} ({c.roundTrip.preservedRatio}%) ·{" "}
                  {c.roundTrip.editedBlocks}/{c.roundTrip.totalBlocks}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-2" disabled={!latest.builtin_artifact_id} onClick={() => void download(latest.builtin_artifact_id)}>
              <Download /> {t("wp.bench.builtin")}
            </Button>
            <Button size="sm" variant="outline" className="gap-2" disabled={!latest.genoffice_artifact_id} onClick={() => void download(latest.genoffice_artifact_id)}>
              <Download /> {t("wp.bench.genoffice")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
