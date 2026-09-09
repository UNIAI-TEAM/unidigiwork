// Nhập & vá tài liệu Word bằng bộ máy GenOffice thật (chỉ chạy phía máy chủ).
// Nguyên tắc: bản gốc không bao giờ bị ghi đè; mọi khối không sửa an toàn được
// giữ nguyên nguyên văn (kind: "original").
import { parseDocx, saveDocx, type SaveBlock } from "@/vendor/genoffice/docx-engine";
import { parseInlineRuns } from "@/domain/work-products/office-engine";
import { GENOFFICE_COMMIT, GENOFFICE_ENGINE_VERSION } from "./office-genoffice.server";

export { GENOFFICE_COMMIT, GENOFFICE_ENGINE_VERSION };

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCX_MAX_BYTES = 25 * 1024 * 1024;

export type BlockEditability = "EDITABLE" | "READ_ONLY_PRESERVED";

/** Vai trò ngữ nghĩa nhận diện được từ tài liệu Word. */
export type BlockSemanticRole =
  | "TITLE"
  | "HEADING"
  | "PARAGRAPH"
  | "LIST_ITEM"
  | "TABLE"
  | "QUOTE"
  | "CAPTION"
  | "FOOTNOTE"
  | "OTHER";

export interface TableSummary {
  rows: number;
  cols: number;
  headers: string[];
  /** Xem trước tối đa vài dòng đầu để AI hiểu dữ liệu. */
  preview: string[][];
}

export interface ImportedBlock {
  blockKey: string;
  ordinal: number;
  blockType: string;
  text: string;
  editability: BlockEditability;
  /** Neo về đúng phần tử trong tài liệu gốc + thông tin nhận diện ngữ nghĩa. */
  sourceAnchor: {
    docxIndex: number | null;
    styleId?: string | null;
    level?: number | null;
    role?: BlockSemanticRole;
    headingLevel?: number | null;
    /** Tiêu đề mục gần nhất phía trên (giúp AI hiểu ngữ cảnh). */
    section?: string | null;
    listKind?: "bullet" | "ordered" | null;
    table?: TableSummary | null;
    /** Vì sao khối được nhận là tiêu đề/trích dẫn (heuristic hay style Word). */
    detectedBy?: "style" | "outline" | "heuristic" | null;
  };
}

/** Các loại khối GenOffice có thể sửa chữ an toàn mà vẫn giữ định dạng gốc. */
const EDITABLE_TYPES = new Set(["paragraph", "heading", "listItem"]);

function runsText(b: Record<string, unknown>): string {
  const runs = b["runs"];
  if (!Array.isArray(runs)) return "";
  return (runs as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function editabilityOf(b: Record<string, unknown>, text: string): BlockEditability {
  const type = String(b["type"] ?? "");
  if (!EDITABLE_TYPES.has(type)) return "READ_ONLY_PRESERVED";
  if (!text.trim()) return "READ_ONLY_PRESERVED";
  if (b["docxIndex"] === null || b["docxIndex"] === undefined) return "READ_ONLY_PRESERVED";
  // Nội dung có đối tượng nhúng / trường động: không sửa được mà vẫn an toàn.
  for (const key of ["drawings", "images", "fields", "sdt", "math", "charts", "textboxes", "ink"]) {
    const v = b[key];
    if (Array.isArray(v) ? v.length > 0 : Boolean(v)) return "READ_ONLY_PRESERVED";
  }
  return "EDITABLE";
}

export interface ParsedDocxImport {
  blocks: ImportedBlock[];
  /** Nội dung native (markdown-ish) chỉ để hiển thị/tìm kiếm, KHÔNG dùng để dựng lại tài liệu. */
  content: string;
  totalBlocks: number;
  editableBlocks: number;
}

/** Đọc một DOCX có sẵn thành các khối có neo về tài liệu gốc. */
export async function parseDocxToBlocks(bytes: Uint8Array): Promise<ParsedDocxImport> {
  const parsed = await parseDocx(bytes);
  const visible = (parsed.blocks as unknown as Array<Record<string, unknown>>).filter((b) => !b["hidden"]);

  const blocks: ImportedBlock[] = [];
  const lines: string[] = [];
  let ordinal = 0;

  for (const b of visible) {
    const type = String(b["type"] ?? "paragraph");
    const text = runsText(b);
    const editability = editabilityOf(b, text);
    const docxIndex = (b["docxIndex"] as number | null | undefined) ?? null;
    ordinal += 1;
    blocks.push({
      blockKey: `wp-block-${docxIndex ?? `x${ordinal}`}`,
      ordinal,
      blockType: type,
      text,
      editability,
      sourceAnchor: {
        docxIndex,
        styleId: (b["styleId"] as string | undefined) ?? null,
        level: (b["level"] as number | undefined) ?? null,
      },
    });

    if (type === "heading") {
      const lvl = Math.min(Math.max(Number(b["level"] ?? 1), 1), 3);
      lines.push(`${"#".repeat(lvl)} ${text}`);
    } else if (type === "listItem") {
      const kind = (b["list"] as { kind?: string } | undefined)?.kind;
      lines.push(kind === "ordered" ? `1. ${text}` : `- ${text}`);
    } else if (type === "table") {
      lines.push("[bảng — giữ nguyên bản gốc]");
    } else if (text) {
      lines.push(text);
    } else {
      lines.push(`[${type} — giữ nguyên bản gốc]`);
    }
    lines.push("");
  }

  return {
    blocks,
    content: lines.join("\n").trim(),
    totalBlocks: blocks.length,
    editableBlocks: blocks.filter((b) => b.editability === "EDITABLE").length,
  };
}

export interface AnchoredEdit {
  blockKey: string;
  docxIndex: number;
  before: string;
  after: string;
}

export class PatchUnsafeError extends Error {
  constructor(public readonly detail: string) {
    super("PATCH_UNSAFE");
  }
}

export interface PatchResult {
  bytes: Uint8Array;
  editedBlocks: number;
  totalBlocks: number;
  appliedKeys: string[];
}

function runsOf(text: string) {
  return parseInlineRuns(text).map((r) => ({
    text: r.text,
    ...(r.bold ? { bold: true } : {}),
    ...(r.italic ? { italic: true } : {}),
    ...(r.underline ? { underline: true } : {}),
  }));
}

/**
 * Vá đúng chỗ trên tài liệu gốc theo neo `docxIndex`.
 * Khối không nằm trong danh sách sửa được giữ nguyên nguyên văn.
 * Neo không khớp / nội dung gốc đã đổi → PATCH_UNSAFE, không sửa gì cả.
 */
export async function patchDocxAnchored(original: Uint8Array, edits: AnchoredEdit[]): Promise<PatchResult> {
  if (!edits.length) throw new PatchUnsafeError("NO_EDITS");
  const parsed = await parseDocx(original);
  const visible = (parsed.blocks as unknown as Array<Record<string, unknown>>).filter((b) => !b["hidden"]);
  const byIndex = new Map<number, Record<string, unknown>>();
  for (const b of visible) {
    const idx = b["docxIndex"];
    if (typeof idx === "number") byIndex.set(idx, b);
  }

  // Kiểm tra an toàn TRƯỚC khi ghi bất cứ thứ gì.
  for (const e of edits) {
    const target = byIndex.get(e.docxIndex);
    if (!target) throw new PatchUnsafeError(`ANCHOR_NOT_FOUND:${e.blockKey}`);
    const text = runsText(target);
    if (editabilityOf(target, text) !== "EDITABLE") throw new PatchUnsafeError(`BLOCK_NOT_EDITABLE:${e.blockKey}`);
    if (text.trim() !== e.before.trim()) throw new PatchUnsafeError(`SOURCE_CHANGED:${e.blockKey}`);
  }

  const editByIndex = new Map(edits.map((e) => [e.docxIndex, e]));
  let edited = 0;
  const blocks: SaveBlock[] = visible.map((b) => {
    const idx = b["docxIndex"] as number | undefined;
    const e = typeof idx === "number" ? editByIndex.get(idx) : undefined;
    if (e) {
      edited += 1;
      return { kind: "generated", block: { ...(b as object), runs: runsOf(e.after) } } as SaveBlock;
    }
    return { kind: "original", docxIndex: idx as number } as SaveBlock;
  });

  const bytes = await saveDocx(parsed, blocks, { savedAt: new Date().toISOString() });
  return { bytes, editedBlocks: edited, totalBlocks: visible.length, appliedKeys: edits.map((e) => e.blockKey) };
}
