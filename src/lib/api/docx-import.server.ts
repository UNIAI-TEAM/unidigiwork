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
  /** Độ tin cậy dòng đầu là dòng tiêu đề (0..1). */
  headerConfidence?: number;
  /** Chỉ số các cột chủ yếu là số liệu. */
  numericCols?: number[];
  /** Có ô gộp / cấu trúc bất thường không. */
  ragged?: boolean;
}

/** Trọng số nhận diện từng loại — người dùng có thể hiệu chỉnh. */
export interface DetectionWeights {
  title: number;
  heading: number;
  listItem: number;
  quote: number;
  caption: number;
  table: number;
}

export const DEFAULT_DETECTION_WEIGHTS: DetectionWeights = {
  title: 1,
  heading: 1,
  listItem: 1,
  quote: 1,
  caption: 1,
  table: 1,
};

/** Điểm tối thiểu để chấp nhận một vai trò suy đoán. */
export const DETECTION_THRESHOLD = 1;

export function normalizeWeights(w?: Partial<DetectionWeights> | null): DetectionWeights {
  const clamp = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, 0), 3) : d;
  return {
    title: clamp(w?.title, 1),
    heading: clamp(w?.heading, 1),
    listItem: clamp(w?.listItem, 1),
    quote: clamp(w?.quote, 1),
    caption: clamp(w?.caption, 1),
    table: clamp(w?.table, 1),
  };
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
    /** Điểm tin cậy của vai trò đã chọn (sau khi nhân trọng số). */
    score?: number;
    /** Các tín hiệu dẫn tới kết luận, để người dùng hiểu và hiệu chỉnh. */
    signals?: string[];
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

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Nhận diện theo tên style Word (đa ngôn ngữ: Heading/Tiêu đề/Title/Quote/Caption...). */
function roleFromStyle(styleId: string | null): {
  role: BlockSemanticRole | null;
  level: number | null;
} {
  if (!styleId) return { role: null, level: null };
  const s = norm(styleId).replace(/[\s_-]/g, "");
  const heading = /^(heading|tieude|đềmục|titre|ueberschrift|berschrift|h)(\d)/.exec(s);
  if (heading) return { role: "HEADING", level: Number(heading[2]) };
  if (/^(title|tieudechinh|documenttitle)$/.test(s)) return { role: "TITLE", level: 0 };
  if (/^(subtitle|phude)$/.test(s)) return { role: "HEADING", level: 2 };
  if (/(quote|citation|trichdan|blockquote)/.test(s)) return { role: "QUOTE", level: null };
  if (/(caption|chuthich|ghichuanh)/.test(s)) return { role: "CAPTION", level: null };
  if (/(footnote|endnote|cuoitrang)/.test(s)) return { role: "FOOTNOTE", level: null };
  if (/(listparagraph|danhsach)/.test(s)) return { role: "LIST_ITEM", level: null };
  return { role: null, level: null };
}

/** Số thứ tự mục kiểu "1.", "1.2.3", "Điều 5", "Chương II", "Phần A", "Article 3". */
function headingNumberDepth(text: string): number | null {
  const t = text.trim();
  const dotted = /^(\d+(?:\.\d+){0,4})[.)]?\s+\S/.exec(t);
  if (dotted) return Math.min(dotted[1].split(".").length, 5);
  if (
    /^(điều|dieu|article|chương|chuong|chapter|phần|phan|part|mục|muc|section)\s+([0-9IVXLCM]+|[A-ZĐ])\b/i.test(
      t,
    )
  )
    return 1;
  return null;
}

function allRunsBold(b: Record<string, unknown>): boolean {
  const runs = b["runs"];
  if (!Array.isArray(runs) || !runs.length) return false;
  const withText = (runs as Array<{ text?: string; bold?: boolean }>).filter((r) =>
    (r.text ?? "").trim(),
  );
  return withText.length > 0 && withText.every((r) => r.bold === true);
}

function allRunsItalic(b: Record<string, unknown>): boolean {
  const runs = b["runs"];
  if (!Array.isArray(runs) || !runs.length) return false;
  const withText = (runs as Array<{ text?: string; italic?: boolean }>).filter((r) =>
    (r.text ?? "").trim(),
  );
  return withText.length > 0 && withText.every((r) => r.italic === true);
}

function cellText(cell: Record<string, unknown>): string {
  const rich = cell["richParas"];
  if (Array.isArray(rich) && rich.length) {
    return (rich as Array<Record<string, unknown>>)
      .map((p) => runsText(p))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const paras = cell["paras"];
  if (Array.isArray(paras)) return (paras as string[]).join(" ").replace(/\s+/g, " ").trim();
  return "";
}

/** Bóc nội dung bảng thành lưới chữ để AI đọc được (không đổi tài liệu gốc). */
function tableGrid(b: Record<string, unknown>): string[][] {
  const model = b["table"] as { rows?: unknown[] } | undefined;
  const rows = model?.rows;
  if (!Array.isArray(rows)) return [];
  // GenOffice có hai dạng: mảng ô trực tiếp, hoặc { cells: [...] }.
  return rows.map((r) => {
    const cells = Array.isArray(r) ? r : ((r as { cells?: unknown[] } | null)?.cells ?? []);
    return (cells as Array<Record<string, unknown>>).map((c) => cellText(c ?? {}));
  });
}

const NUMERIC_RE = /^[\s(]*[-+]?[\d.,%]+\s*(vnd|đ|usd|%|tr|k)?[\s).]*$/i;

function tableSummaryOf(grid: string[][], weight: number): TableSummary {
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const first = grid[0] ?? [];
  const body = grid.slice(1);

  // Cột nào chủ yếu là số liệu.
  const numericCols: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    const vals = body.map((r) => (r[c] ?? "").trim()).filter(Boolean);
    if (vals.length >= 2 && vals.filter((v) => NUMERIC_RE.test(v)).length / vals.length >= 0.6)
      numericCols.push(c);
  }

  // Dòng đầu là tiêu đề khi: có chữ ở mọi ô, ngắn, và không phải số ở các cột số liệu.
  const filled = first.filter((c) => c.trim().length > 0).length;
  let conf = 0;
  if (cols > 0) {
    conf += (filled / cols) * 0.5;
    if (first.every((c) => c.trim().length <= 40)) conf += 0.2;
    if (numericCols.length && numericCols.every((c) => !NUMERIC_RE.test((first[c] ?? "").trim())))
      conf += 0.3;
  }
  conf = Math.min(1, conf * (weight || 1));

  return {
    rows: grid.length,
    cols,
    headers: conf >= 0.5 ? first : [],
    preview: grid.slice(0, 6),
    headerConfidence: Math.round(conf * 100) / 100,
    numericCols,
    ragged: grid.some((r) => r.length !== cols),
  };
}

/** Bảng điểm cho từng vai trò suy đoán, kèm tín hiệu để giải thích. */
function scoreRoles(args: {
  text: string;
  bold: boolean;
  italic: boolean;
  format: Record<string, unknown>;
  seenBodyText: boolean;
  prevWasTable: boolean;
  weights: DetectionWeights;
}): { role: BlockSemanticRole; score: number; signals: string[]; headingLevel: number | null } {
  const { text, bold, italic, format, seenBodyText, prevWasTable, weights } = args;
  const raw: Record<string, number> = { TITLE: 0, HEADING: 0, LIST_ITEM: 0, QUOTE: 0, CAPTION: 0 };
  const sig: Record<string, string[]> = {
    TITLE: [],
    HEADING: [],
    LIST_ITEM: [],
    QUOTE: [],
    CAPTION: [],
  };
  const add = (role: string, v: number, why: string) => {
    raw[role] += v;
    if (v > 0) sig[role].push(why);
  };

  const len = text.length;
  const short = len <= 120;
  const centered = format["align"] === "center";
  const indent = Number(format["indentLeft"] ?? 0);
  const endsSentence = /[.;!?]$/.test(text);
  const numDepth = headingNumberDepth(text);
  const upper = short && text === text.toLocaleUpperCase("vi") && /\p{L}/u.test(text);

  // ---- Tiêu đề mục
  if (numDepth) add("HEADING", 0.8, "đánh số mục");
  if (/^(điều|dieu|chương|chuong|phần|phan|mục|muc|article|chapter|section|phụ lục|phu luc)\b/i.test(text))
    add("HEADING", 0.5, "từ khoá mục");
  if (bold) add("HEADING", 0.45, "chữ đậm");
  if (upper) add("HEADING", 0.5, "chữ in hoa");
  if (short && !endsSentence) add("HEADING", 0.35, "ngắn, không kết câu");
  if (centered) add("HEADING", 0.15, "căn giữa");
  if (endsSentence) raw["HEADING"] -= 0.5;
  if (len > 160) raw["HEADING"] -= 0.8;
  if (/:$/.test(text) && !bold) raw["HEADING"] -= 0.3;

  // ---- Tiêu đề tài liệu
  if (!seenBodyText) {
    if (upper) add("TITLE", 0.6, "in hoa ở đầu tài liệu");
    if (centered) add("TITLE", 0.5, "căn giữa ở đầu tài liệu");
    if (bold && short) add("TITLE", 0.4, "đậm và ngắn");
    if (numDepth) raw["TITLE"] -= 0.8;
  } else {
    raw["TITLE"] -= 1;
  }

  // ---- Gạch đầu dòng
  if (/^([-–—•●▪*+]|\p{L}\)|\(\p{L}\)|\d+[.)])\s+\S/u.test(text)) add("LIST_ITEM", 0.9, "ký hiệu đầu dòng");
  if (indent >= 360 && !italic) add("LIST_ITEM", 0.2, "thụt lề");

  // ---- Trích dẫn
  if (/^[“"'«].*[”"'»]\s*$/.test(text)) add("QUOTE", 0.8, "nằm trong dấu ngoặc kép");
  if (italic) add("QUOTE", 0.45, "chữ nghiêng");
  if (indent >= 360) add("QUOTE", 0.4, "thụt lề");
  if (/(^|\s)[—–-]\s*\p{Lu}[\p{L}\s.]{2,40}$/u.test(text)) add("QUOTE", 0.3, "có nguồn dẫn");
  if (bold) raw["QUOTE"] -= 0.3;

  // ---- Chú thích
  if (/^(hình|bảng|biểu|biểu đồ|sơ đồ|figure|fig|table|chart)\s*\d*\s*([.:–-]|\s)/i.test(text))
    add("CAPTION", 0.9, "mở đầu bằng Hình/Bảng");
  if (prevWasTable && short && italic) add("CAPTION", 0.4, "ngay sau bảng, chữ nghiêng");
  if (len > 200) raw["CAPTION"] -= 0.6;

  const weighted: Array<[BlockSemanticRole, number]> = [
    ["TITLE", raw["TITLE"] * weights.title],
    ["HEADING", raw["HEADING"] * weights.heading],
    ["LIST_ITEM", raw["LIST_ITEM"] * weights.listItem],
    ["QUOTE", raw["QUOTE"] * weights.quote],
    ["CAPTION", raw["CAPTION"] * weights.caption],
  ];
  weighted.sort((a, b) => b[1] - a[1]);
  const [best, score] = weighted[0];
  if (score < DETECTION_THRESHOLD)
    return { role: "PARAGRAPH", score: Math.round(score * 100) / 100, signals: [], headingLevel: null };

  return {
    role: best,
    score: Math.round(score * 100) / 100,
    signals: sig[best] ?? [],
    headingLevel: best === "TITLE" ? 0 : best === "HEADING" ? (numDepth ?? (upper ? 1 : 2)) : null,
  };
}

function markdownTable(grid: string[][]): string {
  if (!grid.length) return "[bảng — giữ nguyên bản gốc]";
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const pad = (r: string[]) =>
    Array.from({ length: cols }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|") || " ");
  const out = [`| ${pad(grid[0]).join(" | ")} |`, `| ${Array(cols).fill("---").join(" | ")} |`];
  for (const r of grid.slice(1, 30)) out.push(`| ${pad(r).join(" | ")} |`);
  if (grid.length > 30)
    out.push(
      `| … còn ${grid.length - 30} dòng | ${Array(cols - 1)
        .fill(" ")
        .join(" | ")} |`,
    );
  return out.join("\n");
}

/** Đọc một DOCX có sẵn thành các khối có neo về tài liệu gốc, kèm nhận diện ngữ nghĩa. */
export async function parseDocxToBlocks(
  bytes: Uint8Array,
  weightsInput?: Partial<DetectionWeights> | null,
): Promise<ParsedDocxImport> {
  const weights = normalizeWeights(weightsInput);
  const parsed = await parseDocx(bytes);
  const visible = (parsed.blocks as unknown as Array<Record<string, unknown>>).filter(
    (b) => !b["hidden"],
  );

  const blocks: ImportedBlock[] = [];
  const lines: string[] = [];
  let ordinal = 0;
  let currentSection: string | null = null;
  let seenBodyText = false;
  let prevWasTable = false;

  for (const b of visible) {
    const type = String(b["type"] ?? "paragraph");
    let text = runsText(b);
    const trimmed = text.trim();
    const editability = editabilityOf(b, text);
    const docxIndex = (b["docxIndex"] as number | null | undefined) ?? null;
    const styleId = (b["styleId"] as string | undefined) ?? null;
    const rawLevel = (b["level"] as number | undefined) ?? null;
    const listInfo = b["list"] as { kind?: "bullet" | "ordered" } | undefined;
    const format = (b["format"] as Record<string, unknown> | undefined) ?? {};
    const styled = roleFromStyle(styleId);

    let role: BlockSemanticRole = "PARAGRAPH";
    let headingLevel: number | null = null;
    let detectedBy: "style" | "outline" | "heuristic" | null = null;
    let grid: string[][] = [];
    let table: TableSummary | null = null;
    let score: number | null = null;
    let signals: string[] = [];

    if (type === "table") {
      role = "TABLE";
      grid = tableGrid(b);
      table = tableSummaryOf(grid, weights.table);
      detectedBy = "style";
      score = table.headerConfidence ?? null;
      signals = table.headers.length ? ["có dòng tiêu đề"] : [];
      if (table.numericCols?.length) signals.push(`${table.numericCols.length} cột số liệu`);
      // Bảng không sửa được, nhưng cần có chữ để tìm kiếm và cho AI đọc hiểu.
      if (!text.trim() && grid.length) text = markdownTable(grid);
    } else if (type === "image" || type === "passthrough") {
      role = "OTHER";
    } else if (type === "heading") {
      role = "HEADING";
      headingLevel = Math.min(Math.max(Number(rawLevel ?? styled.level ?? 1), 1), 9);
      detectedBy = b["outlineOnly"] ? "outline" : "style";
      signals = ["style Word"];
    } else if (type === "listItem" || listInfo?.kind) {
      role = "LIST_ITEM";
      detectedBy = "style";
      signals = ["danh sách Word"];
    } else if (styled.role) {
      role = styled.role;
      headingLevel = styled.role === "HEADING" ? (styled.level ?? rawLevel ?? 1) : null;
      if (styled.role === "TITLE") headingLevel = 0;
      detectedBy = "style";
      signals = [`style "${styleId}"`];
    } else if (typeof rawLevel === "number") {
      role = "HEADING";
      headingLevel = Math.min(Math.max(rawLevel, 1), 9);
      detectedBy = "outline";
      signals = ["cấp outline"];
    } else if (trimmed) {
      // Chấm điểm theo tín hiệu: tài liệu Việt Nam thường không dùng style Heading chuẩn.
      const guess = scoreRoles({
        text: trimmed,
        bold: allRunsBold(b),
        italic: allRunsItalic(b),
        format,
        seenBodyText,
        prevWasTable,
        weights,
      });
      score = guess.score;
      if (guess.role !== "PARAGRAPH") {
        role = guess.role;
        headingLevel = guess.headingLevel;
        detectedBy = "heuristic";
        signals = guess.signals;
      }
    }

    if (role === "PARAGRAPH" && trimmed) seenBodyText = true;
    if (role === "HEADING" || role === "TITLE") currentSection = trimmed || currentSection;
    prevWasTable = type === "table";

    ordinal += 1;
    blocks.push({
      blockKey: `wp-block-${docxIndex ?? `x${ordinal}`}`,
      ordinal,
      blockType: type,
      text,
      editability,
      sourceAnchor: {
        docxIndex,
        styleId,
        level: rawLevel,
        role,
        headingLevel,
        section: role === "HEADING" || role === "TITLE" ? null : currentSection,
        listKind: listInfo?.kind ?? null,
        table,
        detectedBy,
      },
    });

    if (role === "TITLE") {
      lines.push(`# ${text}`);
    } else if (role === "HEADING") {
      const lvl = Math.min(Math.max(headingLevel ?? 1, 1), 6);
      lines.push(`${"#".repeat(lvl)} ${text}`);
    } else if (role === "LIST_ITEM") {
      lines.push(listInfo?.kind === "ordered" ? `1. ${text}` : `- ${text}`);
    } else if (role === "QUOTE") {
      lines.push(`> ${text}`);
    } else if (role === "CAPTION") {
      lines.push(`*${text}*`);
    } else if (type === "table") {
      lines.push(markdownTable(grid));
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
export async function patchDocxAnchored(
  original: Uint8Array,
  edits: AnchoredEdit[],
): Promise<PatchResult> {
  if (!edits.length) throw new PatchUnsafeError("NO_EDITS");
  const parsed = await parseDocx(original);
  const visible = (parsed.blocks as unknown as Array<Record<string, unknown>>).filter(
    (b) => !b["hidden"],
  );
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
    if (editabilityOf(target, text) !== "EDITABLE")
      throw new PatchUnsafeError(`BLOCK_NOT_EDITABLE:${e.blockKey}`);
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
  return {
    bytes,
    editedBlocks: edited,
    totalBlocks: visible.length,
    appliedKeys: edits.map((e) => e.blockKey),
  };
}
