// Sinh fixture Word thật (docx-js) cho 3 loại nghiệp vụ: hợp đồng, báo cáo, báo giá.
import { mkdir } from "node:fs/promises";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const OUT = "fixtures/docx";
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text: string, width: number, head = false) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: head ? { fill: "D5E8F0", type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: head })] })],
  });
}

function table(rows: string[][], widths: number[]) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (r, i) =>
        new TableRow({ children: r.map((c, ci) => cell(c, widths[ci], i === 0)) }),
    ),
  });
}

function baseDoc(children: any[]) {
  return new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 24 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
}

const bullet = (t: string) =>
  new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(t)] });
const p = (t: string) => new Paragraph({ children: [new TextRun(t)] });
const h1 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });

const fixtures: Record<string, any> = {
  "hop-dong-dich-vu.docx": baseDoc([
    h1("HỢP ĐỒNG DỊCH VỤ SỐ 2026/UNI-012"),
    p("Bên A: Công ty Cổ phần ACME Việt Nam."),
    p("Bên B: Công ty TNHH UNICOM."),
    h2("Điều 1. Phạm vi công việc"),
    bullet("Triển khai nền tảng UNIWORK cho 200 người dùng."),
    bullet("Đào tạo quản trị viên và chuyển giao tài liệu vận hành."),
    h2("Điều 2. Giá trị và thanh toán"),
    p("Thời hạn thanh toán là 30 ngày kể từ ngày nhận hoá đơn hợp lệ."),
    table(
      [
        ["Hạng mục", "Giá trị (VND)"],
        ["Phí triển khai", "450.000.000"],
        ["Phí thuê bao năm đầu", "360.000.000"],
      ],
      [6360, 3000],
    ),
    h2("Điều 3. Bảo mật"),
    p("Hai bên cam kết bảo mật thông tin trong suốt thời hạn hợp đồng và 24 tháng sau khi kết thúc."),
  ]),
  "bao-cao-thang.docx": baseDoc([
    h1("BÁO CÁO VẬN HÀNH THÁNG 08/2026"),
    h2("1. Tổng quan"),
    p("Trong tháng 08/2026, hệ thống ghi nhận 1.240 phiên làm việc và 96 tài liệu bàn giao."),
    h2("2. Chỉ số chính"),
    table(
      [
        ["Chỉ số", "Tháng 07", "Tháng 08"],
        ["Tài liệu mới", "72", "96"],
        ["Tài liệu đã duyệt", "58", "81"],
        ["Sự cố nghiêm trọng", "2", "0"],
      ],
      [4360, 2500, 2500],
    ),
    h2("3. Rủi ro"),
    bullet("Thiếu nhân sự vận hành ca đêm."),
    bullet("Chi phí suy luận AI tăng 12% so với tháng trước."),
    h2("4. Kiến nghị"),
    p("Đề xuất bổ sung một kỹ sư vận hành và rà soát định mức chi phí AI trong quý tới."),
  ]),
  "bao-gia-trien-khai.docx": baseDoc([
    h1("BÁO GIÁ TRIỂN KHAI UNIWORK"),
    p("Kính gửi: Phòng Công nghệ thông tin, Công ty ACME."),
    h2("Phạm vi báo giá"),
    bullet("Thiết lập không gian làm việc và phân quyền theo tổ chức."),
    bullet("Tích hợp email, họp trực tuyến và kho tri thức."),
    h2("Bảng giá"),
    table(
      [
        ["Gói", "Số người dùng", "Đơn giá/tháng"],
        ["Standard", "100", "180.000"],
        ["Enterprise", "500", "150.000"],
      ],
      [3360, 3000, 3000],
    ),
    h2("Hiệu lực"),
    p("Báo giá có hiệu lực trong 15 ngày kể từ ngày phát hành."),
  ]),
};

await mkdir(OUT, { recursive: true });
for (const [name, doc] of Object.entries(fixtures)) {
  const buf = await Packer.toBuffer(doc);
  await Bun.write(`${OUT}/${name}`, buf);
  console.log("created", name, buf.byteLength, "bytes");
}
