// Xuất danh sách sự kiện lệch timestamp (Calendar quy trình) ra CSV / PDF.
export type AnomalyRow = {
  runId: string;
  workflow: string;
  status: string;
  day: string;
  originalStarted: string;
  originalEnded: string;
  originalCreated: string;
  expectedStarted: string;
  expectedEnded: string;
  reasons: string;
};

type Meta = { title: string; from: string; to: string; tzLabel: string };

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEAD = [
  "Run ID",
  "Quy trình",
  "Trạng thái",
  "Ngày",
  "Bắt đầu (gốc)",
  "Kết thúc (gốc)",
  "Tạo lúc (gốc)",
  "Bắt đầu (kỳ vọng)",
  "Kết thúc (kỳ vọng)",
  "Lý do lệch",
];

const toRow = (r: AnomalyRow) => [
  r.runId,
  r.workflow,
  r.status,
  r.day,
  r.originalStarted,
  r.originalEnded,
  r.originalCreated,
  r.expectedStarted,
  r.expectedEnded,
  r.reasons,
];

export function exportAnomaliesCsv(rows: AnomalyRow[], meta: Meta) {
  const lines: unknown[][] = [
    [meta.title],
    ["Khoảng thời gian", `${meta.from} → ${meta.to}`],
    ["Múi giờ", meta.tzLabel],
    ["Số sự kiện lệch", rows.length],
    [],
    HEAD,
    ...rows.map(toRow),
  ];
  const csv = lines.map((l) => l.map(esc).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timestamp-anomalies_${meta.from}_${meta.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const cell = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

export function exportAnomaliesPdf(rows: AnomalyRow[], meta: Meta) {
  const body = rows
    .map((r) => `<tr>${toRow(r).map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${cell(meta.title)}</title>
<style>
 body{font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:24px;font-size:11px}
 h1{font-size:18px;margin:0 0 4px} .muted{color:#6b7280;font-size:11px;margin:0}
 table{width:100%;border-collapse:collapse;margin-top:12px}
 th,td{border:1px solid #e5e7eb;padding:5px 6px;text-align:left;vertical-align:top;word-break:break-word}
 th{background:#f9fafb;font-weight:600}
 @page{size:A4 landscape;margin:12mm}
</style></head><body>
<h1>${cell(meta.title)}</h1>
<p class="muted">Khoảng thời gian: ${cell(meta.from)} → ${cell(meta.to)} · Múi giờ: ${cell(meta.tzLabel)} · ${rows.length} sự kiện lệch</p>
<table><thead><tr>${HEAD.map((h) => `<th>${cell(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}
