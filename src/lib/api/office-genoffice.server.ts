// UniWork Office Engine Service — nhánh GenOffice (chỉ chạy phía máy chủ).
//
// Mã bộ máy tài liệu là bản nhúng Apache-2.0 của genspark-ai/genoffice
// (packages/docx-engine), commit ghi ở GENOFFICE_COMMIT. Không dùng vỏ ứng dụng
// máy tính, không dùng thương hiệu, không lấy mã trong /ee.
import {
  buildBlankDocx,
  parseDocx,
  saveDocx,
  generateTableModelXml,
  BLANK_BULLET_NUM_ID,
  BLANK_ORDERED_NUM_ID,
  type SaveBlock,
} from "@/vendor/genoffice/docx-engine";
import {
  OFFICE_FORMAT_META,
  parseContentBlocks,
  parseInlineRuns,
  plainText,
  type DocBlock,
  type OfficeRenderRequest,
  type OfficeRenderResult,
} from "@/domain/work-products/office-engine";

/** Commit gốc của GenOffice đã nhúng — dùng để tái lập kết quả đối chứng. */
export const GENOFFICE_COMMIT = "d24c964a3e693a52d9fece4fef03a4de34d0d853";
export const GENOFFICE_ENGINE_VERSION = "docx-engine@0.1.0";

type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };

function runsOf(text: string): Run[] {
  return parseInlineRuns(text).map((r) => ({
    text: r.text,
    ...(r.bold ? { bold: true } : {}),
    ...(r.italic ? { italic: true } : {}),
    ...(r.underline ? { underline: true } : {}),
  }));
}

function paragraph(runs: Run[], opts: Record<string, unknown> = {}): SaveBlock {
  return { kind: "generated", block: { type: "paragraph", runs, ...opts } } as SaveBlock;
}

/** Chuyển khối nội dung chuẩn hoá của UniWork thành khối ghi của GenOffice. */
export function toGenOfficeBlocks(blocks: DocBlock[]): SaveBlock[] {
  const out: SaveBlock[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "heading":
        out.push({
          kind: "generated",
          block: { type: "heading", level: b.level, runs: runsOf(b.text) },
        } as SaveBlock);
        break;
      case "bullet":
        out.push({
          kind: "generated",
          block: {
            type: "listItem",
            list: { kind: "bullet", numId: BLANK_BULLET_NUM_ID, ilvl: 0 },
            runs: runsOf(b.text),
          },
        } as SaveBlock);
        break;
      case "numbered":
        out.push({
          kind: "generated",
          block: {
            type: "listItem",
            list: { kind: "ordered", numId: BLANK_ORDERED_NUM_ID, ilvl: 0 },
            runs: runsOf(b.text),
          },
        } as SaveBlock);
        break;
      case "quote":
        out.push(paragraph(runsOf(b.text).map((r) => ({ ...r, italic: true })), {
          format: { indentLeft: 480 },
        }));
        break;
      case "table": {
        const [head, ...rest] = b.rows;
        const xml = generateTableModelXml({
          rows: [
            (head ?? []).map((c) => ({ paras: [plainText(c)], bold: true })),
            ...rest.map((r) => r.map((c) => ({ paras: [plainText(c)] }))),
          ],
        });
        out.push({ kind: "xml", xml } as SaveBlock);
        break;
      }
      case "pagebreak":
        out.push(paragraph([{ text: "" }], { pageBreakBefore: true }));
        break;
      default:
        out.push(paragraph(runsOf(b.text)));
    }
  }
  if (!out.length) out.push(paragraph([{ text: "" }]));
  return out;
}

function headerBlocks(req: OfficeRenderRequest): SaveBlock[] {
  const meta = `${req.businessType} · v${req.version}`;
  const prov = req.provenance
    .map((p) => `${p.type}: ${p.title}${p.stamp ? ` (${p.stamp})` : ""}`)
    .filter(Boolean);
  const out: SaveBlock[] = [
    { kind: "generated", block: { type: "heading", level: 1, runs: [{ text: req.title }] } } as SaveBlock,
    paragraph([{ text: meta, italic: true }]),
  ];
  if (prov.length) {
    out.push({
      kind: "generated",
      block: { type: "heading", level: 2, runs: [{ text: "Nguồn ngữ cảnh" }] },
    } as SaveBlock);
    for (const p of prov) {
      out.push({
        kind: "generated",
        block: {
          type: "listItem",
          list: { kind: "bullet", numId: BLANK_BULLET_NUM_ID, ilvl: 0 },
          runs: [{ text: p }],
        },
      } as SaveBlock);
    }
  }
  return out;
}

/** Chế độ A — tạo mới DOCX từ nội dung gốc của Kết quả công việc. */
export async function renderDocxWithGenOffice(req: OfficeRenderRequest): Promise<OfficeRenderResult> {
  const blank = await buildBlankDocx();
  const parsed = await parseDocx(blank);
  const blocks: SaveBlock[] = [...headerBlocks(req), ...toGenOfficeBlocks(parseContentBlocks(req.content))];
  const bytes = await saveDocx(parsed, blocks, { savedAt: new Date().toISOString() });
  return { bytes, mimeType: OFFICE_FORMAT_META.DOCX.mime, engine: "genoffice" };
}

export interface RoundTripEdit {
  /** Chuỗi cần tìm trong một đoạn văn của tài liệu gốc. */
  find: string;
  /** Nội dung thay thế cho đoạn đó. */
  replaceWith: string;
}

export interface RoundTripResult {
  bytes: Uint8Array;
  /** Số đoạn văn đã bị thay đổi. */
  editedBlocks: number;
  totalBlocks: number;
}

/**
 * Chế độ B — đọc một DOCX có sẵn, sửa đúng các đoạn được chỉ định và ghi lại.
 * Các đoạn không bị đụng tới được giữ nguyên nguyên văn (kind: "original").
 */
export async function roundTripDocxWithGenOffice(
  original: Uint8Array,
  edits: RoundTripEdit[],
): Promise<RoundTripResult> {
  const parsed = await parseDocx(original);
  const visible = parsed.blocks.filter((b: { hidden?: boolean }) => !b.hidden);
  let edited = 0;
  const blocks: SaveBlock[] = visible.map((raw) => {
    const b = raw as unknown as Record<string, unknown>;
    const text = Array.isArray(b["runs"])
      ? (b["runs"] as Array<{ text?: string }>).map((r) => r.text ?? "").join("")
      : "";
    const hit = edits.find((e) => text.includes(e.find));
    if (hit && b["type"] !== undefined) {
      edited += 1;
      return {
        kind: "generated",
        block: {
          ...(b as object),
          runs: runsOf(text.replace(hit.find, hit.replaceWith)),
        },
      } as SaveBlock;
    }
    return { kind: "original", docxIndex: b["docxIndex"] as number } as SaveBlock;
  });
  const bytes = await saveDocx(parsed, blocks, { savedAt: new Date().toISOString() });
  return { bytes, editedBlocks: edited, totalBlocks: visible.length };
}
