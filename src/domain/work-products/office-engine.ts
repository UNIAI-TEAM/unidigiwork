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
  | { kind: "bullet"; text: string };

export function parseContentBlocks(content: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    const b = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) {
      blocks.push({ kind: "bullet", text: b[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
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
