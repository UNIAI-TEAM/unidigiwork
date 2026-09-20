// Sinh fixture Word "thuần Việt" (không dùng style Heading) + nhãn chuẩn để hiệu chỉnh trọng số nhận diện.
import { mkdir, writeFile } from "node:fs/promises";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

export type GroundTruth = { text: string; role: string };

type Spec = {
  text: string;
  role: string;
  bold?: boolean;
  italic?: boolean;
  center?: boolean;
  indent?: number;
};

const specs: Spec[] = [
  { text: "BIÊN BẢN HỌP TRIỂN KHAI DỰ ÁN UNIWORK", role: "TITLE", bold: true, center: true },
  { text: "Thời gian: 09 giờ 00, ngày 10 tháng 9 năm 2026.", role: "PARAGRAPH" },
  { text: "Địa điểm: Trụ sở Công ty TNHH UNICOM, Hà Nội.", role: "PARAGRAPH" },
  { text: "1. THÀNH PHẦN THAM DỰ", role: "HEADING", bold: true },
  { text: "- Ông Nguyễn Văn A, Giám đốc dự án.", role: "LIST_ITEM" },
  { text: "- Bà Trần Thị B, Trưởng phòng vận hành.", role: "LIST_ITEM" },
  { text: "- Ông Lê Văn C, Kiến trúc sư giải pháp.", role: "LIST_ITEM" },
  { text: "2. NỘI DUNG THẢO LUẬN", role: "HEADING", bold: true },
  {
    text: "Các bên rà soát tiến độ giai đoạn một và thống nhất phạm vi bàn giao trong tháng 9, bao gồm cả tài liệu hướng dẫn vận hành cho phòng nghiệp vụ.",
    role: "PARAGRAPH",
  },
  {
    text: "“Chúng tôi cần bàn giao đúng hạn để kịp vận hành quý bốn.” — Nguyễn Văn A",
    role: "QUOTE",
    italic: true,
    indent: 720,
  },
  {
    text: "Phòng vận hành đề nghị bổ sung một kỹ sư trực hệ thống trong hai tuần đầu vận hành thử.",
    role: "PARAGRAPH",
  },
  { text: "2.1 Tiến độ hạng mục kỹ thuật", role: "HEADING", bold: true },
  { text: "a) Hoàn thành cấu hình môi trường kiểm thử.", role: "LIST_ITEM" },
  { text: "b) Chuyển dữ liệu mẫu sang môi trường vận hành thử.", role: "LIST_ITEM" },
  { text: "Bảng 1. Tiến độ các hạng mục chính", role: "CAPTION", italic: true },
  {
    text: "Tổng thời gian còn lại của giai đoạn một là mười hai ngày làm việc, chưa tính thời gian nghiệm thu của khách hàng.",
    role: "PARAGRAPH",
  },
  { text: "3. KẾT LUẬN VÀ PHÂN CÔNG", role: "HEADING", bold: true },
  {
    text: "“Phạm vi bàn giao giữ nguyên, không phát sinh chi phí.” — Trần Thị B",
    role: "QUOTE",
    italic: true,
    indent: 720,
  },
  {
    text: "- Ông Lê Văn C hoàn thiện tài liệu kiến trúc trước ngày 15 tháng 9.",
    role: "LIST_ITEM",
  },
  { text: "- Bà Trần Thị B chuẩn bị kịch bản nghiệm thu.", role: "LIST_ITEM" },
  { text: "Hình 2: Sơ đồ luồng phê duyệt sau điều chỉnh", role: "CAPTION", italic: true },
  {
    text: "Biên bản được lập thành hai bản có giá trị như nhau, mỗi bên giữ một bản để làm căn cứ thực hiện.",
    role: "PARAGRAPH",
  },
];

export const groundTruth: GroundTruth[] = specs.map((s) => ({ text: s.text, role: s.role }));

export async function generateCalibrationFixture(path = "fixtures/docx/bien-ban-thuan-viet.docx") {
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [
      {
        children: specs.map(
          (s) =>
            new Paragraph({
              alignment: s.center ? AlignmentType.CENTER : undefined,
              indent: s.indent ? { left: s.indent } : undefined,
              children: [new TextRun({ text: s.text, bold: s.bold, italics: s.italic })],
            }),
        ),
      },
    ],
  });
  await mkdir("fixtures/docx", { recursive: true });
  await writeFile(path, await Packer.toBuffer(doc));
  return path;
}

if (import.meta.main) {
  const path = await generateCalibrationFixture();
  console.log(`Đã tạo ${path} với ${groundTruth.length} khối có nhãn chuẩn.`);
}
