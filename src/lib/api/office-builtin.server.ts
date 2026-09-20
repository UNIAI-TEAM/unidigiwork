// Bộ máy kết xuất nội bộ (dự phòng khi chưa cấu hình GenOffice).
// Sinh OOXML tối giản bằng fflate và PDF bằng pdf-lib; chạy được trên runtime edge.
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  OFFICE_FORMAT_META,
  blockText,
  parseContentBlocks,
  parseInlineRuns,
  plainText,
  type DocBlock,
  type OfficeEngineAdapter,
  type OfficeFormat,
  type OfficeRenderRequest,
  type OfficeRenderResult,
  type OfficeTemplate,
} from "@/domain/work-products/office-engine";
import { officeTemplateFor } from "@/domain/work-products/office-templates";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const tpl = (req: OfficeRenderRequest): OfficeTemplate => req.template ?? officeTemplateFor(req.businessType);

/* ----------------------------------------------------------------- DOCX */

/** Các đoạn chữ có định dạng nội tuyến → run OOXML. */
function docxRuns(text: string, extra = ""): string {
  return parseInlineRuns(text)
    .map((run) => {
      const props = [extra, run.bold ? "<w:b/>" : "", run.italic ? "<w:i/>" : "", run.underline ? '<w:u w:val="single"/>' : ""].join("");
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
    })
    .join("");
}

function docxTable(rows: string[][], accent: string): string {
  const body = rows
    .map((cells, r) => {
      const shade = r === 0 ? `<w:shd w:val="clear" w:fill="${accent}"/>` : "";
      const color = r === 0 ? '<w:color w:val="FFFFFF"/><w:b/>' : "";
      return `<w:tr>${cells
        .map(
          (cell) =>
            `<w:tc><w:tcPr>${shade}</w:tcPr><w:p><w:pPr/>${docxRuns(cell, color)}</w:p></w:tc>`,
        )
        .join("")}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D5D9E4"/><w:left w:val="single" w:sz="4" w:color="D5D9E4"/><w:bottom w:val="single" w:sz="4" w:color="D5D9E4"/><w:right w:val="single" w:sz="4" w:color="D5D9E4"/><w:insideH w:val="single" w:sz="4" w:color="D5D9E4"/><w:insideV w:val="single" w:sz="4" w:color="D5D9E4"/></w:tblBorders></w:tblPr>${body}</w:tbl><w:p/>`;
}

function docxParagraph(b: DocBlock, accent: string): string {
  if (b.kind === "table") return docxTable(b.rows, accent);
  if (b.kind === "pagebreak") return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  if (b.kind === "heading") {
    const size = b.level === 1 ? 32 : b.level === 2 ? 26 : 24;
    return `<w:p><w:pPr><w:pStyle w:val="Heading${b.level}"/><w:spacing w:before="240" w:after="120"/></w:pPr>${docxRuns(b.text, `<w:b/><w:sz w:val="${size}"/><w:color w:val="${accent}"/>`)}</w:p>`;
  }
  if (b.kind === "bullet")
    return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${docxRuns(b.text)}</w:p>`;
  if (b.kind === "numbered")
    return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${docxRuns(b.text)}</w:p>`;
  if (b.kind === "quote")
    return `<w:p><w:pPr><w:ind w:left="480"/><w:pBdr><w:left w:val="single" w:sz="18" w:color="${accent}"/></w:pBdr></w:pPr>${docxRuns(b.text, '<w:i/><w:color w:val="555A66"/>')}</w:p>`;
  return `<w:p><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr>${docxRuns(b.text)}</w:p>`;
}

function buildDocx(req: OfficeRenderRequest): Uint8Array {
  const t = tpl(req);
  const blocks = parseContentBlocks(req.content);
  const cover = t.cover
    ? [
        `<w:p><w:pPr><w:spacing w:before="2400" w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="${t.accent}"/></w:rPr><w:t xml:space="preserve">${esc(t.header)}</w:t></w:r></w:p>`,
        `<w:p><w:r><w:rPr><w:b/><w:sz w:val="60"/></w:rPr><w:t xml:space="preserve">${esc(req.title)}</w:t></w:r></w:p>`,
        `<w:p><w:pPr><w:spacing w:before="240"/></w:pPr><w:r><w:rPr><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${esc(`${t.label} · v${req.version}`)}</w:t></w:r></w:p>`,
        `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
      ]
    : [
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="${t.accent}"/></w:rPr><w:t xml:space="preserve">${esc(req.title)}</w:t></w:r></w:p>`,
        `<w:p><w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${esc(`${t.label} · v${req.version}`)}</w:t></w:r></w:p>`,
      ];
  const body = [...cover, ...blocks.map((b) => docxParagraph(b, t.accent))].join("");

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`),
    "word/numbering.xml": strToU8(numbering),
    "word/document.xml": strToU8(document),
  });
}

/* ----------------------------------------------------------------- XLSX */

function buildXlsx(req: OfficeRenderRequest): Uint8Array {
  const blocks = parseContentBlocks(req.content);
  const rows: Array<[string, string]> = [
    ["Tiêu đề", req.title],
    ["Loại", req.businessType],
    ["Phiên bản", `v${req.version}`],
    ["", ""],
    ["Mục", "Nội dung"],
    ...blocks
      .filter((b) => b.kind !== "pagebreak")
      .map(
        (b) =>
          [
            b.kind === "heading"
              ? "Tiêu đề mục"
              : b.kind === "bullet"
                ? "Gạch đầu dòng"
                : b.kind === "numbered"
                  ? "Mục đánh số"
                  : b.kind === "quote"
                    ? "Trích dẫn"
                    : b.kind === "table"
                      ? "Bảng"
                      : "Đoạn",
            plainText(blockText(b)),
          ] as [string, string],
      ),
  ];
  if (req.provenance.length) {
    rows.push(["", ""], ["Nguồn ngữ cảnh", "Tên"]);
    for (const p of req.provenance) rows.push([p.type, p.title]);
  }

  const sheetRows = rows
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r
          .map(
            (cell, c) =>
              `<c r="${String.fromCharCode(65 + c)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ket qua" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="90" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

/* ----------------------------------------------------------------- PPTX */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function slideXml(title: string, bullets: string[]): string {
  const body = bullets.length
    ? bullets
        .map((b) => `<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="vi-VN" sz="1800"/><a:t>${esc(b)}</a:t></a:r></a:p>`)
        .join("")
    : `<a:p><a:endParaRPr lang="vi-VN"/></a:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="628650" y="457200"/><a:ext cx="7886700" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN" sz="3200" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="628650" y="1700213"/><a:ext cx="7886700" cy="3600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>
</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;
}

function buildPptx(req: OfficeRenderRequest): Uint8Array {
  const t = tpl(req);
  const blocks = parseContentBlocks(req.content);
  const slides: Array<{ title: string; bullets: string[] }> = [
    { title: req.title, bullets: [`${t.label} · v${req.version}`, t.header] },
  ];
  for (const b of blocks) {
    if (b.kind === "pagebreak") continue;
    if (b.kind === "heading") {
      slides.push({ title: plainText(b.text), bullets: [] });
      continue;
    }
    const text = plainText(blockText(b));
    if (!text) continue;
    const last = slides[slides.length - 1];
    if (last.bullets.length >= 8) slides.push({ title: `${last.title} (tiếp)`, bullets: [text] });
    else last.bullets.push(text);
  }

  const files: Record<string, Uint8Array> = {};
  const sldIds = slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");
  const presRels = slides
    .map((_, i) => `<Relationship Id="rId${i + 2}" Type="${R}/slide" Target="slides/slide${i + 1}.xml"/>`)
    .join("");
  const overrides = slides
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");

  slides.forEach((s, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slideXml(s.title, s.bullets));
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  });

  files["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${overrides}</Types>`);
  files["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  files["ppt/presentation.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  files["ppt/_rels/presentation.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${presRels}</Relationships>`);
  files["ppt/slideMasters/slideMaster1.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
  files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  files["ppt/slideLayouts/slideLayout1.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  files["ppt/theme/theme1.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${A}" name="UNIWORK"><a:themeElements><a:clrScheme name="UNIWORK"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="11133C"/></a:dk2><a:lt2><a:srgbClr val="F5F7FB"/></a:lt2><a:accent1><a:srgbClr val="087BFF"/></a:accent1><a:accent2><a:srgbClr val="D600E8"/></a:accent2><a:accent3><a:srgbClr val="11133C"/></a:accent3><a:accent4><a:srgbClr val="087BFF"/></a:accent4><a:accent5><a:srgbClr val="D600E8"/></a:accent5><a:accent6><a:srgbClr val="11133C"/></a:accent6><a:hlink><a:srgbClr val="087BFF"/></a:hlink><a:folHlink><a:srgbClr val="D600E8"/></a:folHlink></a:clrScheme><a:fontScheme name="UNIWORK"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="UNIWORK"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

  return zipSync(files);
}

/* ------------------------------------------------------------------ PDF */

const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
const FONT_BOLD_URL = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";
let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [r, b] = await Promise.all([fetch(FONT_URL), fetch(FONT_BOLD_URL)]);
  if (!r.ok || !b.ok) throw new Error("FONT_FETCH_FAILED");
  fontCache = { regular: await r.arrayBuffer(), bold: await b.arrayBuffer() };
  return fontCache;
}

function hexRgb(hex: string) {
  const n = parseInt(hex, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function buildPdf(req: OfficeRenderRequest): Promise<Uint8Array> {
  const t = tpl(req);
  const accent = hexRgb(t.accent);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await loadFonts();
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  const [W, H] = [595.28, 841.89];
  const margin = 56;
  let page = pdf.addPage([W, H]);
  let y = H - margin;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - margin;
  };

  const wrap = (text: string, size: number, font: typeof regular, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const draw = (text: string, size: number, font: typeof regular, indent = 0, color = rgb(0.07, 0.07, 0.16)) => {
    for (const line of wrap(text, size, font, W - margin * 2 - indent)) {
      if (y < margin + size + 24) newPage();
      page.drawText(line, { x: margin + indent, y: y - size, size, font, color });
      y -= size * 1.5;
    }
  };

  // Bìa hoặc tiêu đề đầu trang theo mẫu.
  if (t.cover) {
    page.drawRectangle({ x: 0, y: H - 200, width: W, height: 200, color: accent });
    page.drawText(t.header, { x: margin, y: H - 90, size: 12, font: bold, color: rgb(1, 1, 1) });
    let ty = H - 130;
    for (const line of wrap(req.title, 28, bold, W - margin * 2)) {
      page.drawText(line, { x: margin, y: ty, size: 28, font: bold, color: rgb(1, 1, 1) });
      ty -= 34;
    }
    y = H - 240;
    draw(`${t.label} · v${req.version}`, 11, regular, 0, rgb(0.45, 0.47, 0.55));
    newPage();
  } else {
    page.drawRectangle({ x: margin, y: H - margin - 4, width: 48, height: 4, color: accent });
    y -= 16;
    draw(req.title, 22, bold);
    draw(`${t.label} · v${req.version}`, 10, regular, 0, rgb(0.45, 0.47, 0.55));
    y -= 8;
  }

  for (const b of parseContentBlocks(req.content)) {
    if (b.kind === "pagebreak") {
      newPage();
    } else if (b.kind === "heading") {
      y -= 6;
      draw(plainText(b.text), b.level === 1 ? 16 : b.level === 2 ? 14 : 12, bold, 0, accent);
    } else if (b.kind === "bullet") {
      draw(`•  ${plainText(b.text)}`, 11, regular, 14);
    } else if (b.kind === "numbered") {
      draw(`${b.index}.  ${plainText(b.text)}`, 11, regular, 14);
    } else if (b.kind === "quote") {
      draw(plainText(b.text), 11, regular, 20, rgb(0.35, 0.37, 0.45));
    } else if (b.kind === "table") {
      for (const [i, row] of b.rows.entries())
        draw(row.map((c) => plainText(c)).join("   |   "), 10, i === 0 ? bold : regular, 6, i === 0 ? accent : undefined);
      y -= 6;
    } else {
      draw(plainText(b.text), 11, regular);
    }
  }

  if (req.provenance.length) {
    y -= 10;
    draw("Nguồn ngữ cảnh", 12, bold, 0, accent);
    for (const p of req.provenance) draw(`•  [${p.type}] ${p.title}`, 10, regular, 14, rgb(0.35, 0.37, 0.45));
  }

  // Chân trang trên mọi trang.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${t.footer}  ·  ${i + 1}/${pages.length}`, {
      x: margin,
      y: 28,
      size: 8,
      font: regular,
      color: rgb(0.55, 0.57, 0.63),
    });
  });

  return pdf.save();
}

/* -------------------------------------------------------------- adapter */

export const builtinOfficeEngine: OfficeEngineAdapter = {
  name: "builtin",
  supports: () => true,
  async render(req: OfficeRenderRequest): Promise<OfficeRenderResult> {
    const bytes =
      req.format === "DOCX"
        ? buildDocx(req)
        : req.format === "XLSX"
          ? buildXlsx(req)
          : req.format === "PPTX"
            ? buildPptx(req)
            : await buildPdf(req);
    return { bytes, mimeType: OFFICE_FORMAT_META[req.format as OfficeFormat].mime, engine: "builtin" };
  },
};
