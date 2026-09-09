// Đo đạc khách quan hai tệp DOCX (chỉ chạy phía máy chủ).
// Mọi con số đều được đo từ chính tệp; không có chỉ số suy đoán.
import JSZip from "jszip";

export interface DocxInspection {
  validZip: boolean;
  opensSuccessfully: boolean;
  parts: string[];
  missingRequiredParts: string[];
  danglingRelationships: string[];
  paragraphs: number;
  headings: number;
  tables: number;
  tableRows: number;
  images: number;
  listItems: number;
  sections: number;
  pageBreaks: number;
  headersFooters: number;
  hyperlinks: number;
  bookmarks: number;
  runs: number;
  boldRuns: number;
  italicRuns: number;
  underlineRuns: number;
  fonts: string[];
  fontSizes: number[];
  alignments: string[];
  styleIds: string[];
  pageSize: { widthTwips: number; heightTwips: number } | null;
  margins: { top: number; right: number; bottom: number; left: number } | null;
  text: string;
  sizeBytes: number;
  error?: string;
}

const REQUIRED_PARTS = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];

const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const uniq = (v: string[]) => Array.from(new Set(v)).sort();

/** Chuẩn hoá văn bản để so trung thực nội dung (bỏ khoảng trắng thừa). */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function inspectDocx(bytes: Uint8Array): Promise<DocxInspection> {
  const empty: DocxInspection = {
    validZip: false,
    opensSuccessfully: false,
    parts: [],
    missingRequiredParts: [...REQUIRED_PARTS],
    danglingRelationships: [],
    paragraphs: 0,
    headings: 0,
    tables: 0,
    tableRows: 0,
    images: 0,
    listItems: 0,
    sections: 0,
    pageBreaks: 0,
    headersFooters: 0,
    hyperlinks: 0,
    bookmarks: 0,
    runs: 0,
    boldRuns: 0,
    italicRuns: 0,
    underlineRuns: 0,
    fonts: [],
    fontSizes: [],
    alignments: [],
    styleIds: [],
    pageSize: null,
    margins: null,
    text: "",
    sizeBytes: bytes.byteLength,
  };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "ZIP_LOAD_FAILED" };
  }

  const parts = Object.keys(zip.files).filter((p) => !zip.files[p]!.dir).sort();
  const missing = REQUIRED_PARTS.filter((p) => !parts.includes(p));
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { ...empty, validZip: true, parts, missingRequiredParts: missing, error: "NO_DOCUMENT_PART" };

  const xml = await docFile.async("string");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsXml = relsFile ? await relsFile.async("string") : "";
  const relIds = new Set(Array.from(relsXml.matchAll(/Id="([^"]+)"/g)).map((m) => m[1]!));
  const used = uniq(Array.from(xml.matchAll(/r:(?:id|embed)="([^"]+)"/g)).map((m) => m[1]!));
  const dangling = used.filter((id) => !relIds.has(id));

  const text = normalizeText(
    Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
      .map((m) => decodeEntities(m[1]!))
      .join(" "),
  );

  const sect = /<w:pgSz\b([^/>]*)\/>/.exec(xml);
  const attr = (s: string, k: string) => {
    const m = new RegExp(`w:${k}="(-?\\d+)"`).exec(s);
    return m ? Number(m[1]) : 0;
  };
  const marg = /<w:pgMar\b([^/>]*)\/>/.exec(xml);

  return {
    validZip: true,
    opensSuccessfully: missing.length === 0 && dangling.length === 0,
    parts,
    missingRequiredParts: missing,
    danglingRelationships: dangling,
    paragraphs: countOf(xml, /<w:p[ >]/g),
    headings: countOf(xml, /<w:pStyle w:val="Heading\d"/g) + countOf(xml, /<w:outlineLvl\b/g),
    tables: countOf(xml, /<w:tbl>/g),
    tableRows: countOf(xml, /<w:tr[ >]/g),
    images: countOf(xml, /<a:blip\b/g),
    listItems: countOf(xml, /<w:numPr>/g),
    sections: countOf(xml, /<w:sectPr[ >]/g),
    pageBreaks: countOf(xml, /w:type="page"/g),
    headersFooters: parts.filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p)).length,
    hyperlinks: countOf(xml, /<w:hyperlink\b/g),
    bookmarks: countOf(xml, /<w:bookmarkStart\b/g),
    runs: countOf(xml, /<w:r[ >]/g),
    boldRuns: countOf(xml, /<w:b\/>|<w:b w:val="(?:1|true)"/g),
    italicRuns: countOf(xml, /<w:i\/>|<w:i w:val="(?:1|true)"/g),
    underlineRuns: countOf(xml, /<w:u\b/g),
    fonts: uniq(Array.from(xml.matchAll(/w:ascii="([^"]+)"/g)).map((m) => m[1]!)),
    fontSizes: uniq(Array.from(xml.matchAll(/<w:sz w:val="(\d+)"/g)).map((m) => m[1]!)).map(Number),
    alignments: uniq(Array.from(xml.matchAll(/<w:jc w:val="([^"]+)"/g)).map((m) => m[1]!)),
    styleIds: uniq(Array.from(xml.matchAll(/<w:pStyle w:val="([^"]+)"/g)).map((m) => m[1]!)),
    pageSize: sect ? { widthTwips: attr(sect[1]!, "w"), heightTwips: attr(sect[1]!, "h") } : null,
    margins: marg
      ? {
          top: attr(marg[1]!, "top"),
          right: attr(marg[1]!, "right"),
          bottom: attr(marg[1]!, "bottom"),
          left: attr(marg[1]!, "left"),
        }
      : null,
    text,
    sizeBytes: bytes.byteLength,
  };
}

/* ------------------------------ giữ nguyên phần OOXML ------------------------------ */

export interface PartPreservation {
  unchangedParts: number;
  changedParts: number;
  addedParts: number;
  removedParts: number;
  changed: string[];
  added: string[];
  removed: string[];
  /** Tỷ lệ phần OOXML gốc giữ nguyên (không tính siêu dữ liệu vỏ ZIP). */
  preservedRatio: number;
}

/** Siêu dữ liệu vỏ ZIP, không tính là thay đổi nội dung tài liệu. */
const CONTAINER_PARTS = new Set(["docProps/core.xml", "docProps/app.xml"]);

async function partHashes(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(bytes);
  const out = new Map<string, string>();
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || CONTAINER_PARTS.has(name)) continue;
    const buf = await file.async("uint8array");
    const digest = await crypto.subtle.digest("SHA-256", buf as unknown as ArrayBuffer);
    out.set(
      name,
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  return out;
}

export async function comparePartPreservation(
  original: Uint8Array,
  produced: Uint8Array,
): Promise<PartPreservation> {
  const a = await partHashes(original);
  const b = await partHashes(produced);
  const changed: string[] = [];
  let unchanged = 0;
  for (const [name, hash] of a) {
    if (!b.has(name)) continue;
    if (b.get(name) === hash) unchanged += 1;
    else changed.push(name);
  }
  const added = Array.from(b.keys()).filter((n) => !a.has(n));
  const removed = Array.from(a.keys()).filter((n) => !b.has(n));
  const total = a.size || 1;
  return {
    unchangedParts: unchanged,
    changedParts: changed.length,
    addedParts: added.length,
    removedParts: removed.length,
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
    preservedRatio: Math.round((unchanged / total) * 1000) / 10,
  };
}

/* --------------------------------- báo cáo so sánh --------------------------------- */

export interface EngineComparison {
  builtin: DocxInspection;
  genoffice: DocxInspection;
  textIdentical: boolean;
  /** Độ trùng khớp văn bản giữa hai tệp (0..100). */
  textSimilarity: number;
  missingInGenoffice: string[];
  missingInBuiltin: string[];
  roundTrip?: PartPreservation & { editedBlocks: number; totalBlocks: number };
}

function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

/** Tỷ lệ trùng khớp theo túi từ — số đo, không phải đánh giá chủ quan. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length && !tb.length) return 100;
  const bag = new Map<string, number>();
  for (const t of tb) bag.set(t, (bag.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of ta) {
    const n = bag.get(t) ?? 0;
    if (n > 0) {
      hit += 1;
      bag.set(t, n - 1);
    }
  }
  return Math.round((hit / Math.max(ta.length, tb.length)) * 1000) / 10;
}

/** Các từ có trong nguồn nhưng vắng ở tệp kết xuất. */
export function missingTokens(source: string, produced: string): string[] {
  const bag = new Set(tokens(produced));
  return uniq(tokens(source).filter((t) => !bag.has(t))).slice(0, 50);
}

export async function compareEngines(
  builtinBytes: Uint8Array,
  genofficeBytes: Uint8Array,
  sourceText: string,
): Promise<EngineComparison> {
  const [builtin, genoffice] = await Promise.all([inspectDocx(builtinBytes), inspectDocx(genofficeBytes)]);
  const src = normalizeText(sourceText);
  return {
    builtin,
    genoffice,
    textIdentical: builtin.text === genoffice.text,
    textSimilarity: textSimilarity(builtin.text, genoffice.text),
    missingInGenoffice: missingTokens(src, genoffice.text),
    missingInBuiltin: missingTokens(src, builtin.text),
  };
}
