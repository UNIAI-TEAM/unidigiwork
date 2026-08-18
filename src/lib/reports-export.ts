// Xuất báo cáo (KPI, workspaces, hoạt động) ra CSV và PDF (in trình duyệt, unicode-safe).
import type { DepartmentReport, ReportOverview } from "@/lib/api/reports.functions";

type Meta = {
  from: string;
  to: string;
  title: string;
  compare?: boolean;
  prev?: { from: string; to: string };
  departments?: DepartmentReport | null;
  departmentFilter?: string | null;
};

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");

const fileStamp = (m: Meta) => `${m.from}_${m.to}`;

function download(name: string, content: string, mime: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function sections(report: ReportOverview, meta: Meta) {
  const k = report.kpis;
  const st = report.tasks_by_status;
  const kpis: Array<[string, number]> = [
    ["Tổng người dùng", k.users],
    ["Người dùng hoạt động", k.active_users],
    ["Workspaces", k.workspaces],
    ["Công việc", k.tasks],
    ["Cuộc họp", k.meetings],
    ["Tài liệu", k.documents],
  ];
  const status: Array<[string, number]> = [
    ["Hoàn thành", st.done],
    ["Đang làm", st.in_progress],
    ["Chờ xử lý", st.todo],
    ["Bị chặn", st.blocked],
    ["Đã huỷ", st.canceled],
    ["Tổng", st.total],
  ];
  return { kpis, status, workspaces: report.workspaces ?? [], activity: report.activity ?? [], meta };
}

export function exportReportCsv(report: ReportOverview, meta: Meta) {
  const s = sections(report, meta);
  const rows: unknown[][] = [];
  rows.push([meta.title]);
  rows.push(["Khoảng thời gian", `${meta.from} → ${meta.to}`]);
  if (meta.compare && meta.prev) rows.push(["Kỳ so sánh", `${meta.prev.from} → ${meta.prev.to}`]);
  rows.push([]);
  rows.push(["KPI", "Giá trị"]);
  s.kpis.forEach((r) => rows.push(r));
  rows.push([]);
  rows.push(["Trạng thái công việc", "Số lượng"]);
  s.status.forEach((r) => rows.push(r));
  rows.push([]);
  rows.push(["Workspace", "Công việc", "Thành viên", "Tiến độ (%)", "Trạng thái"]);
  s.workspaces.forEach((w) => rows.push([w.name, w.tasks, w.members, w.progress, w.status]));
  rows.push([]);
  rows.push(["Ngày", "Công việc", "Cuộc họp", "Tài liệu", "Hoàn thành"]);
  s.activity.forEach((a) => rows.push([a.day, a.tasks, a.meetings, a.documents, a.completed]));
  const dept = meta.departments;
  if (dept) {
    const drows = meta.departmentFilter
      ? dept.rows.filter((r) => r.department === meta.departmentFilter)
      : dept.rows;
    rows.push([]);
    rows.push([`Báo cáo theo phòng ban (${meta.from} → ${meta.to})`]);
    if (meta.departmentFilter) rows.push(["Lọc phòng ban", meta.departmentFilter]);
    rows.push(["Phòng ban", "Thành viên", "Công việc", "Tài liệu", "Cuộc họp", "Tổng báo cáo"]);
    drows.forEach((r) =>
      rows.push([r.department, r.members, r.tasks, r.documents, r.meetings, r.total]),
    );
    const tot = drows.reduce(
      (s2, r) => ({
        tasks: s2.tasks + r.tasks,
        documents: s2.documents + r.documents,
        meetings: s2.meetings + r.meetings,
        total: s2.total + r.total,
      }),
      { tasks: 0, documents: 0, meetings: 0, total: 0 },
    );
    rows.push(["Tổng", "", tot.tasks, tot.documents, tot.meetings, tot.total]);
  }
  download(`uniwork-report_${fileStamp(meta)}.csv`, toCsv(rows), "text/csv");
}

const table = (head: string[], body: (string | number)[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "")}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

export function exportReportPdf(report: ReportOverview, meta: Meta) {
  const s = sections(report, meta);
  const dept = meta.departments;
  const drows = dept
    ? meta.departmentFilter
      ? dept.rows.filter((r) => r.department === meta.departmentFilter)
      : dept.rows
    : [];
  const deptHtml = dept
    ? `<h2>Báo cáo theo phòng ban${meta.departmentFilter ? ` · ${meta.departmentFilter}` : ""}</h2>${table(
        ["Phòng ban", "Thành viên", "Công việc", "Tài liệu", "Cuộc họp", "Tổng báo cáo"],
        drows.map((r) => [r.department, r.members, r.tasks, r.documents, r.meetings, r.total]),
      )}`
    : "";
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${meta.title}</title>
<style>
 *{box-sizing:border-box}
 body{font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:28px;font-size:12px}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 8px}
 .muted{color:#6b7280;font-size:11px;margin:0}
 table{width:100%;border-collapse:collapse;margin-top:6px}
 th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left}
 th{background:#f9fafb;font-weight:600}
 td:not(:first-child),th:not(:first-child){text-align:right}
 @page{size:A4;margin:14mm}
</style></head><body>
<h1>${meta.title}</h1>
<p class="muted">Khoảng thời gian: ${meta.from} → ${meta.to}${
    meta.compare && meta.prev ? ` · Kỳ so sánh: ${meta.prev.from} → ${meta.prev.to}` : ""
  }</p>
<h2>KPI</h2>${table(["Chỉ số", "Giá trị"], s.kpis.map(([a, b]) => [a, b.toLocaleString("vi-VN")]))}
<h2>Công việc theo trạng thái</h2>${table(["Trạng thái", "Số lượng"], s.status.map(([a, b]) => [a, b.toLocaleString("vi-VN")]))}
<h2>Top workspace / dự án</h2>${table(
    ["Workspace", "Công việc", "Thành viên", "Tiến độ", "Trạng thái"],
    s.workspaces.map((w) => [w.name, w.tasks, w.members, `${w.progress}%`, w.status]),
  )}
<h2>Dữ liệu biểu đồ hoạt động</h2>${table(
    ["Ngày", "Công việc", "Cuộc họp", "Tài liệu", "Hoàn thành"],
    s.activity.map((a) => [a.day, a.tasks, a.meetings, a.documents, a.completed]),
  )}
${deptHtml}
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}