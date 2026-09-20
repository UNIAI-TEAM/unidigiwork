import { unzipSync, strFromU8 } from "fflate";

/** Một dòng bảng tính đã đọc: mảng ô dạng chuỗi. */
export type SheetRows = string[][];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const items = xml.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  for (const si of items) {
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    out.push(decodeXmlEntities(parts.map((p) => p.replace(/<[^>]+>/g, "")).join("")));
  }
  return out;
}

/** Đọc sheet đầu tiên của file .xlsx thành mảng dòng/cột chuỗi. */
export function readXlsxRows(buffer: ArrayBuffer): SheetRows {
  const files = unzipSync(new Uint8Array(buffer));
  const sheetKey =
    Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/i.test(k)) ??
    Object.keys(files).find((k) => /^xl\/worksheets\/.*\.xml$/i.test(k));
  if (!sheetKey) throw new Error("Không tìm thấy bảng tính trong tệp");
  const sheetXml = strFromU8(files[sheetKey]!);
  const sharedKey = Object.keys(files).find((k) => /sharedStrings\.xml$/i.test(k));
  const shared = sharedKey ? readSharedStrings(strFromU8(files[sharedKey]!)) : [];

  const rows: SheetRows = [];
  for (const rowXml of sheetXml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c\b[^>]*(?:\/>|[\s\S]*?<\/c>)/g) ?? []) {
      const refMatch = cellXml.match(/r="([A-Z]+\d+)"/);
      const idx = refMatch ? colIndex(refMatch[1]!) : cells.length;
      const type = cellXml.match(/t="([^"]+)"/)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = decodeXmlEntities(
          (cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
            .map((p) => p.replace(/<[^>]+>/g, ""))
            .join(""),
        );
      } else {
        const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? (shared[Number(raw)] ?? "") : decodeXmlEntities(raw);
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
}

/** Đọc CSV đơn giản (hỗ trợ dấu nháy kép). */
export function readCsvRows(text: string): SheetRows {
  const rows: SheetRows = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Chuyển số serial ngày của Excel hoặc chuỗi ngày sang ISO yyyy-mm-dd. */
export function normalizeDateCell(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  }
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
