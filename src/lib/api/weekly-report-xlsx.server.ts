// Sinh tệp .xlsx tối giản cho báo cáo tuần Kết quả công việc (chạy được trên runtime edge).
import { zipSync, strToU8 } from "fflate";
import type { WeeklyReport, WeeklyReportRow } from "./work-deliverables.functions";

const FORMATS = ["DOCX", "XLSX", "PPTX", "PDF"] as const;

const TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Đề xuất",
  REPORT: "Báo cáo",
  CONTRACT: "Hợp đồng",
  ANALYSIS: "Phân tích",
  PLAN: "Kế hoạch",
  OTHER: "Khác",
  TOTAL: "Tổng cộng",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colName = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

type Cell = string | number;

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((cells, r) => {
      const tds = cells
        .map((c, i) => {
          const ref = `${colName(i)}${r + 1}`;
          if (typeof c === "number") return `<c r="${ref}"><v>${c}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${tds}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="10" width="14" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
}

/** Trả về tệp .xlsx dưới dạng base64. `only` lọc theo một định dạng tệp bàn giao nếu có. */
export function buildWeeklyReportXlsx(report: WeeklyReport, only: string | null): string {
  const formats = only ? [only] : [...FORMATS];
  const header: Cell[] = [
    "Loại tài liệu",
    "Tài liệu mới",
    "Lượt duyệt trong kỳ",
    "Đang chờ duyệt",
    "Đã duyệt",
    "Phiên bản",
    "Đang chia sẻ",
    "Lượt chia sẻ",
    ...formats,
  ];
  const line = (r: WeeklyReportRow): Cell[] => [
    TYPE_LABEL[r.businessType] ?? r.businessType,
    r.created,
    r.approved,
    r.inReview,
    r.approvedNow,
    r.versions,
    r.shared ?? 0,
    r.shareTargets ?? 0,
    ...formats.map((f) => r.formats?.[f] ?? 0),
  ];
  const visible = only ? report.rows.filter((r) => (r.formats?.[only] ?? 0) > 0) : report.rows;

  const rows: Cell[][] = [
    ["Báo cáo tuần — Kết quả công việc"],
    [`Kỳ báo cáo: ${report.from.slice(0, 10)} → ${report.to.slice(0, 10)}`],
    [],
    header,
    ...visible.map(line),
    line(report.totals),
    [],
    ["Lịch sử thay đổi tài liệu Word trong kỳ"],
    ["Người thay đổi", "Tổng thay đổi", "Người sửa", "AI đề xuất"],
    ...(report.editors ?? []).map((e): Cell[] => [e.name, e.total, e.human, e.ai]),
    [
      "Tổng cộng",
      report.changeTotals?.total ?? 0,
      report.changeTotals?.human ?? 0,
      report.changeTotals?.ai ?? 0,
    ],
  ];

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bao cao tuan" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml(rows)),
  };

  const zipped = zipSync(files, { level: 6 });
  let bin = "";
  for (const b of zipped) bin += String.fromCharCode(b);
  return btoa(bin);
}
