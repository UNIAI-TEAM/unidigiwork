// Nhập dữ liệu thật (nhân sự AI, lịch họp, tiến độ) ngay trong CEO Command Center.
// Chỉ dùng lại các server function sẵn có; KPI được làm mới bằng cách invalidate cache.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importAiWorkers } from "@/lib/api/ai-workforce.functions";
import {
  importProjectMeetings,
  importTaskProgress,
  listProjects,
} from "@/lib/api/projects.functions";

type Kind = "workers" | "meetings" | "progress";

function pickColumn(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)));
}

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const TEMPLATES: Record<Kind, { file: string; csv: string }> = {
  workers: {
    file: "mau-nhan-su-ai.csv",
    csv: "Mã,Tên,Vai trò,Kỹ năng,Trạng thái\nATLAS,Atlas,Điều phối dự án,phân tích;báo cáo,ACTIVE\n",
  },
  meetings: {
    file: "mau-lich-hop.csv",
    csv: "Tiêu đề,Bắt đầu,Kết thúc,Địa điểm,Nội dung\nHọp tiến độ tuần,2026-09-14 09:00,2026-09-14 10:00,Phòng họp A,Rà soát tiến độ\n",
  },
  progress: {
    file: "mau-tien-do.csv",
    csv: "Tên công việc,% hoàn thành,Bắt đầu,Kết thúc\nBáo cáo tuần,70,2026-09-08,2026-09-12\n",
  },
};

async function readRows(file: File): Promise<string[][]> {
  const { readXlsxRows, readCsvRows } = await import("@/lib/xlsx-read");
  const rows = file.name.toLowerCase().endsWith(".csv")
    ? readCsvRows(await file.text())
    : readXlsxRows(await file.arrayBuffer());
  if (rows.length < 2) throw new Error("Tệp không có dữ liệu");
  return rows;
}

export function CeoImportPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const refs = {
    workers: useRef<HTMLInputElement>(null),
    meetings: useRef<HTMLInputElement>(null),
    progress: useRef<HTMLInputElement>(null),
  };

  const importWorkersFn = useServerFn(importAiWorkers);
  const importMeetingsFn = useServerFn(importProjectMeetings);
  const importProgressFn = useServerFn(importTaskProgress);

  const projectsQuery = useQuery({
    queryKey: ["ceo", "import-projects", workspaceId ?? ""],
    queryFn: () => listProjects({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: Boolean(workspaceId),
  });
  const projects = projectsQuery.data ?? [];

  function refreshKpi() {
    qc.invalidateQueries({ queryKey: ["ceo"] });
    qc.invalidateQueries({ queryKey: ["ai-brain"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  }

  const run = useMutation({
    mutationFn: async ({ kind, file }: { kind: Kind; file: File }) => {
      const rows = await readRows(file);
      const headers = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
      const body = rows.slice(1);

      if (kind === "workers") {
        if (!workspaceId) throw new Error("Chưa chọn không gian làm việc");
        const nameCol = pickColumn(headers, ["tên", "ten", "name", "nhân sự"]);
        const codeCol = pickColumn(headers, ["mã", "ma", "code"]);
        const roleCol = pickColumn(headers, ["vai trò", "vai tro", "role", "chức"]);
        const skillCol = pickColumn(headers, ["kỹ năng", "ky nang", "skill"]);
        const statusCol = pickColumn(headers, ["trạng thái", "trang thai", "status"]);
        if (nameCol < 0) throw new Error("Thiếu cột tên nhân sự");
        const payload = body
          .map((r) => {
            const name = (r[nameCol] ?? "").trim();
            if (!name) return null;
            const skills = skillCol >= 0 ? (r[skillCol] ?? "") : "";
            return {
              name: name.slice(0, 120),
              code: codeCol >= 0 ? (r[codeCol] ?? "").trim() || null : null,
              role: roleCol >= 0 ? (r[roleCol] ?? "").trim() || null : null,
              status: statusCol >= 0 ? (r[statusCol] ?? "").trim() || null : null,
              skills: skills
                .split(/[;,|]/)
                .map((s) => s.trim().slice(0, 80))
                .filter(Boolean)
                .slice(0, 30),
            };
          })
          .filter(Boolean)
          .slice(0, 200) as Array<Record<string, unknown>>;
        if (!payload.length) throw new Error("Không có dòng hợp lệ");
        const res = (await importWorkersFn({
          data: { workspaceId, rows: payload },
        })) as { created?: number; updated?: number };
        return `Đã nhập nhân sự AI: ${res.created ?? 0} mới, ${res.updated ?? 0} cập nhật`;
      }

      if (!projectId) throw new Error("Hãy chọn dự án trước khi nhập");

      if (kind === "meetings") {
        const { normalizeDateCell } = await import("@/lib/xlsx-read");
        const titleCol = pickColumn(headers, ["tiêu đề", "tieu de", "title", "họp"]);
        const startCol = pickColumn(headers, ["bắt đầu", "bat dau", "start", "thời gian"]);
        const endCol = pickColumn(headers, ["kết thúc", "ket thuc", "end"]);
        const locCol = pickColumn(headers, ["địa điểm", "dia diem", "location", "phòng"]);
        const agendaCol = pickColumn(headers, ["nội dung", "noi dung", "agenda"]);
        if (titleCol < 0 || startCol < 0) throw new Error("Thiếu cột tiêu đề hoặc thời gian");
        const payload = body
          .map((r) => {
            const title = (r[titleCol] ?? "").trim();
            const rawStart = (r[startCol] ?? "").trim();
            if (!title || !rawStart) return null;
            const rawEnd = endCol >= 0 ? (r[endCol] ?? "").trim() : "";
            return {
              title: title.slice(0, 500),
              startAt: normalizeDateCell(rawStart) === rawStart ? rawStart : rawStart,
              endAt: rawEnd || null,
              location: locCol >= 0 ? (r[locCol] ?? "").trim() || null : null,
              agenda: agendaCol >= 0 ? (r[agendaCol] ?? "").trim() || null : null,
            };
          })
          .filter(Boolean)
          .slice(0, 100) as Array<Record<string, unknown>>;
        if (!payload.length) throw new Error("Không có dòng hợp lệ");
        const res = (await importMeetingsFn({ data: { projectId, rows: payload } })) as {
          created: number;
          invalid: string[];
        };
        return `Đã nhập ${res.created} cuộc họp${res.invalid.length ? ` · ${res.invalid.length} dòng lỗi` : ""}`;
      }

      const titleCol = pickColumn(headers, ["tên", "ten", "title", "công việc", "task"]);
      const pctCol = pickColumn(headers, ["%", "hoàn thành", "hoan thanh", "progress"]);
      const startCol = pickColumn(headers, ["bắt đầu", "bat dau", "start"]);
      const endCol = pickColumn(headers, ["kết thúc", "ket thuc", "end", "finish"]);
      if (titleCol < 0) throw new Error("Thiếu cột tên công việc");
      const { normalizeDateCell } = await import("@/lib/xlsx-read");
      const payload = body
        .map((r) => {
          const title = (r[titleCol] ?? "").trim();
          if (!title) return null;
          const pctRaw = pctCol >= 0 ? (r[pctCol] ?? "").replace("%", "").trim() : "";
          const pctNum = pctRaw === "" ? null : Number(pctRaw.replace(",", "."));
          return {
            title: title.slice(0, 400),
            progressPct:
              pctNum === null || Number.isNaN(pctNum)
                ? null
                : Math.max(0, Math.min(100, Math.round(pctNum))),
            startAt: startCol >= 0 ? normalizeDateCell(r[startCol] ?? "") : null,
            endAt: endCol >= 0 ? normalizeDateCell(r[endCol] ?? "") : null,
          };
        })
        .filter(Boolean)
        .slice(0, 500) as Array<Record<string, unknown>>;
      if (!payload.length) throw new Error("Không có dòng hợp lệ");
      const res = (await importProgressFn({ data: { projectId, rows: payload } })) as {
        updated: number;
        notFoundCount: number;
        invalidCount: number;
      };
      const warn: string[] = [];
      if (res.notFoundCount) warn.push(`${res.notFoundCount} dòng không khớp`);
      if (res.invalidCount) warn.push(`${res.invalidCount} dòng lỗi`);
      return `Đã cập nhật tiến độ ${res.updated} công việc${warn.length ? ` · ${warn.join(", ")}` : ""}`;
    },
    onSuccess: (msg) => {
      toast.success(msg);
      refreshKpi();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Không nhập được tệp"),
    onSettled: () => setBusy(null),
  });

  function onPick(kind: Kind, file: File | null | undefined) {
    if (!file) return;
    setBusy(kind);
    run.mutate({ kind, file });
  }

  const items: { kind: Kind; label: string; hint: string }[] = [
    { kind: "workers", label: "Nhân sự AI", hint: "Mã, tên, vai trò, kỹ năng" },
    { kind: "meetings", label: "Lịch họp", hint: "Tiêu đề, thời gian, địa điểm" },
    { kind: "progress", label: "Tiến độ công việc", hint: "Tên việc, %, ngày" },
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Nhập dữ liệu thật (Excel/CSV)</h2>
        <span className="text-xs text-muted-foreground">KPI cập nhật ngay sau khi nhập</span>
      </div>

      <div className="mt-3">
        <label className="text-xs text-muted-foreground" htmlFor="ceo-import-project">
          Dự án áp dụng (cho lịch họp và tiến độ)
        </label>
        <select
          id="ceo-import-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">— Chọn dự án —</option>
          {projects.map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.kind} className="rounded-xl border border-border p-3">
            <div className="text-sm font-medium">{it.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{it.hint}</div>
            <input
              ref={refs[it.kind]}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                onPick(it.kind, e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11 flex-1"
                disabled={busy !== null}
                onClick={() => refs[it.kind].current?.click()}
              >
                {busy === it.kind ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Nhập
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => downloadCsv(TEMPLATES[it.kind].file, TEMPLATES[it.kind].csv)}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Mẫu
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
