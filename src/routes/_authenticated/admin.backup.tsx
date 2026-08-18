import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Upload, Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminAccess } from "@/features/admin/access";
import {
  exportAiWorkforceBackup,
  restoreAiWorkforceBackup,
} from "@/lib/api/admin-backup.functions";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  head: () => ({
    meta: [
      { title: "Sao lưu & khôi phục — UNIWORK" },
      {
        name: "description",
        content: "Tải dữ liệu nhân sự AI về ổ đĩa và khôi phục lại khi cần.",
      },
    ],
  }),
  component: AdminBackupPage,
});

type RestoreMode = "merge" | "replace";

function AdminBackupPage() {
  const { t } = useI18n();
  const { access } = useAdminAccess();
  const canWrite = access.canWrite;
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [lastCounts, setLastCounts] = useState<Record<string, number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportMut = useMutation({
    mutationFn: () => exportAiWorkforceBackup(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uniwork-ai-workforce-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastCounts(payload.counts);
      toast.success(t("adm.28"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("adm.29"));
      }
      return restoreAiWorkforceBackup({
        data: { payload: parsed as never, mode },
      });
    },
    onSuccess: (res) => {
      setLastCounts(res.restored);
      toast.success(t("adm.30"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">{t("adm.31")}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("adm.32")}
          {t("adm.33")}
        </p>
        <button
          onClick={() => exportMut.mutate()}
          disabled={exportMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {exportMut.isPending ? t("adm.34") : t("adm.35")}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">{t("adm.36")}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("adm.37")}
        </p>
        {!canWrite && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-[12px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("adm.38")}</span>
          </div>
        )}

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <label
            className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
              mode === "merge" ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name="restore-mode"
              className="sr-only"
              disabled={!canWrite}
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
            />
            <div className="text-sm font-medium">{t("adm.39")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("adm.40")}
            </div>
          </label>
          <label
            className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
              mode === "replace" ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name="restore-mode"
              className="sr-only"
              disabled={!canWrite}
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            <div className="text-sm font-medium">{t("adm.41")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("adm.42")}
            </div>
          </label>
        </div>

        {mode === "replace" && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("adm.43")}
              {t("adm.44")}
            </span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (
              mode === "replace" &&
              !window.confirm(t("adm.45"))
            ) {
              return;
            }
            restoreMut.mutate(file);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={restoreMut.isPending || !canWrite}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium hover:bg-surface-2/70 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {restoreMut.isPending ? t("adm.46") : t("adm.47")}
        </button>
      </section>

      {lastCounts && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">{t("adm.48")}</h2>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {Object.entries(lastCounts).map(([table, count]) => (
              <li
                key={table}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-[12px]"
              >
                <span className="font-mono text-muted-foreground">{table}</span>
                <span className="font-medium">{count} bản ghi</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
