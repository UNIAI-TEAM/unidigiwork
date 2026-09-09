// Hợp đồng OfficeEngineAdapter — Kết quả công việc có nhiều bản thể hiện (representation).
// Nội dung gốc (native) là nguồn sự thật; DOCX/XLSX/PPTX/PDF chỉ là bản kết xuất của một phiên bản.

export const OFFICE_FORMATS = ["DOCX", "XLSX", "PPTX", "PDF"] as const;
export type OfficeFormat = (typeof OFFICE_FORMATS)[number];

export const OFFICE_FORMAT_META: Record<OfficeFormat, { mime: string; ext: string; label: string }> = {
  DOCX: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    label: "Word (DOCX)",
  },
  XLSX: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    label: "Excel (XLSX)",
  },
  PPTX: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: "pptx",
    label: "PowerPoint (PPTX)",
  },
  PDF: { mime: "application/pdf", ext: "pdf", label: "PDF" },
};

export function isOfficeFormat(v: unknown): v is OfficeFormat {
  return typeof v === "string" && (OFFICE_FORMATS as readonly string[]).includes(v);
}

/** Yêu cầu kết xuất: luôn gắn với một phiên bản cụ thể để audit truy vết được. */
export interface OfficeRenderRequest {
  format: OfficeFormat;
  title: string;
  /** Nội dung native (markdown-ish) của phiên bản được kết xuất. */
  content: string;
  businessType: string;
  version: number;
  workProductId: string;
  /** Nguồn gốc ngữ cảnh đã snapshot ở phiên bản đó. */
  provenance: Array<{ type: string; id: string; title: string; stamp?: string | null }>;
  /** Mẫu trình bày theo loại tài liệu (bìa, đầu/chân trang, màu nhấn). */
  template?: OfficeTemplate;
}

export interface OfficeTemplate {
  key: string;
  /** Màu nhấn dạng hex 6 ký tự, không có dấu #. */
  accent: string;
  label: string;
  cover: boolean;
  header: string;
  footer: string;
}

export interface OfficeRenderResult {
  bytes: Uint8Array;
  mimeType: string;
  /** Tên bộ máy đã tạo tệp: "genoffice" hoặc "builtin". */
  engine: string;
}

export interface OfficeEngineAdapter {
  readonly name: string;
  supports(format: OfficeFormat): boolean;
  render(req: OfficeRenderRequest): Promise<OfficeRenderResult>;
}

/** Khối nội dung đã chuẩn hoá — dùng chung cho mọi bộ máy kết xuất. */
export type DocBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; text: string; index: number }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "pagebreak" };

/** Đoạn chữ có định dạng nội tuyến (đậm/nghiêng/gạch chân). */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|<u>[\s\S]*?<\/u>|\*[^*]+\*|_[^_]+_)/g;

/** Tách một dòng thành các đoạn chữ có định dạng. */
export function parseInlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) runs.push({ text: text.slice(last, idx) });
    const token = m[0];
    if (token.startsWith("**") || token.startsWith("__")) runs.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith("<u>")) runs.push({ text: token.slice(3, -4), underline: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    last = idx + token.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length ? runs : [{ text }];
}

/** Chữ thuần của một khối (bỏ ký hiệu định dạng). */
export function plainText(text: string): string {
  return parseInlineRuns(text)
    .map((r) => r.text)
    .join("");
}

export function parseContentBlocks(content: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let counter = 0;
  let table: string[][] | null = null;

  const flushTable = () => {
    if (table && table.length) blocks.push({ kind: "table", rows: table });
    table = null;
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();

    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // Bỏ dòng phân cách kiểu |---|---|
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        table = table ?? [];
        table.push(cells);
      }
      continue;
    }
    flushTable();

    if (!line) {
      counter = 0;
      continue;
    }
    if (/^(---|\*\*\*|===)$/.test(line)) {
      blocks.push({ kind: "pagebreak" });
      counter = 0;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      counter = 0;
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    const q = /^>\s+(.*)$/.exec(line);
    if (q) {
      blocks.push({ kind: "quote", text: q[1] });
      continue;
    }
    const n = /^\d+[.)]\s+(.*)$/.exec(line);
    if (n) {
      counter += 1;
      blocks.push({ kind: "numbered", text: n[1], index: counter });
      continue;
    }
    counter = 0;
    const b = /^([-*•])\s+(.*)$/.exec(line);
    if (b) {
      blocks.push({ kind: "bullet", text: b[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }
  flushTable();
  return blocks;
}

/** Chữ đại diện của một khối, dùng cho các bộ máy chỉ nhận văn bản. */
export function blockText(b: DocBlock): string {
  if (b.kind === "table") return b.rows.map((r) => r.join(" | ")).join(" / ");
  if (b.kind === "pagebreak") return "";
  return b.text;
}

export function officeFileName(title: string, version: number, format: OfficeFormat): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "work-product";
  return `${base}-v${version}.${OFFICE_FORMAT_META[format].ext}`;
}
