// Nhập nhân sự AI từ tệp Excel/CSV — chỉ phần trình bày, logic ở ai-workforce.functions.ts.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import { importAiWorkers, listTenantAiWorkers } from "@/lib/api/ai-workforce.functions";
import { readCsvRows, readXlsxRows, type SheetRows } from "@/lib/xlsx-read";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { Badge } from "@/components/ui/badge";

interface ImportRow {
  code?: string | null;
  name: string;
  role?: string | null;
  skills?: string[];
  status?: string | null;
}

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  ma: "code",
  code: "code",
  "mã": "code",
  ten: "name",
  "tên": "name",
  name: "name",
  "hoten": "name",
  vaitro: "role",
  "vai trò": "role",
  role: "role",
  chucdanh: "role",
  "chức danh": "role",
  kynang: "skills",
  "kỹ năng": "skills",
  skills: "skills",
  trangthai: "status",
  "trạng thái": "status",
  status: "status",
};

function normalizeHeader(v: string): keyof ImportRow | null {
  const key = v.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s+/g, "")] ?? null;
}

function toRows(sheet: SheetRows): ImportRow[] {
  if (!sheet.length) return [];
  const headers = (sheet[0] ?? []).map(normalizeHeader);
  const out: ImportRow[] = [];
  for (const line of sheet.slice(1)) {
    const row: ImportRow = { name: "" };
    headers.forEach((h, i) => {
      const cell = (line[i] ?? "").trim();
      if (!h || !cell) return;
      if (h === "skills") row.skills = cell.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      else row[h] = cell as never;
    });
    if (row.name) out.push(row);
  }
  return out;
}

const TEMPLATE = "Mã,Tên,Vai trò,Kỹ năng,Trạng thái\nWF_NOVA,NOVA,Trợ lý điều hành,Báo cáo;Lịch họp,ACTIVE\n";

export function AiWorkforceImport() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const wsId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const roster = useQuery({
    queryKey: ["tenant-ai-workers", wsId],
    queryFn: () => listTenantAiWorkers({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });

  const runImport = useMutation({
    mutationFn: (rows: ImportRow[]) => importAiWorkers({ data: { workspaceId: wsId, rows } }),
    onSuccess: (r) => {
      toast.success(`Đã nhập ${r.created} nhân sự mới, cập nhật ${r.updated} hồ sơ.`);
      if (r.failed.length) toast.error(`Không nhập được: ${r.failed.slice(0, 5).join(", ")}`);
      qc.invalidateQueries({ queryKey: ["tenant-ai-workers"] });
      qc.invalidateQueries({ queryKey: ["ai-brain"] });
      qc.invalidateQueries({ queryKey: ["ai-skills"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không nhập được tệp"),
  });

  async function onPick(file: File) {
    setBusy(true);
    try {
      const sheet = file.name.toLowerCase().endsWith(".csv")
        ? readCsvRows(await file.text())
        : readXlsxRows(await file.arrayBuffer());
      const rows = toRows(sheet);
      if (!rows.length) {
        toast.error("Tệp không có dòng nhân sự hợp lệ (cần cột Tên).");
        return;
      }
      await runImport.mutateAsync(rows.slice(0, 200));
    } catch (e: any) {
      toast.error(e?.message ?? "Không đọc được tệp");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-nhan-su-ai.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const list = roster.data ?? [];

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Nhập nhân sự AI từ Excel</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cột: Mã, Tên, Vai trò, Kỹ năng, Trạng thái. Vai trò và lịch sử làm việc được đồng bộ
            vào Bộ não AI ở lần đào tạo kế tiếp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            <Download className="h-4 w-4" /> Tải mẫu
          </button>
          <button
            type="button"
            disabled={!wsId || busy || runImport.isPending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy || runImport.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Nhập từ Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
        </div>
      </div>

      {list.length > 0 && (
        <ul className="mt-4 space-y-2">
          {list.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium">{w.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {w.role}
              </span>
              <Badge variant={w.status === "ACTIVE" ? "default" : "secondary"}>{w.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
