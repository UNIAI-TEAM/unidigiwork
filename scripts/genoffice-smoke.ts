// Kiểm tra nhanh bộ máy GenOffice đã nhúng (chạy: bun scripts/genoffice-smoke.ts)
import { writeFileSync, readFileSync } from "node:fs";
import { renderDocxWithGenOffice, roundTripDocxWithGenOffice } from "@/lib/api/office-genoffice.server";

const content = `# Đề xuất hợp tác\n\nĐây là **đoạn văn** với *nghiêng* và tiếng Việt có dấu.\n\n## Phạm vi\n\n- Mục một\n- Mục hai\n\n1. Bước một\n2. Bước hai\n\n| Hạng mục | Giá |\n| --- | --- |\n| Triển khai | 100 |\n| Vận hành | 50 |\n\n> Ghi chú quan trọng.\n`;

const out = await renderDocxWithGenOffice({
  format: "DOCX",
  title: "Proposal QA",
  content,
  businessType: "PROPOSAL",
  version: 3,
  workProductId: "smoke",
  provenance: [{ type: "MEETING", id: "1", title: "Họp kickoff", stamp: "v2" }],
});
writeFileSync("/tmp/genoffice-a.docx", out.bytes);
console.log("mode A bytes", out.bytes.byteLength);

const rt = await roundTripDocxWithGenOffice(readFileSync("/tmp/genoffice-a.docx"), [
  { find: "Ghi chú quan trọng", replaceWith: "Ghi chú đã sửa" },
]);
writeFileSync("/tmp/genoffice-b.docx", rt.bytes);
console.log("mode B", rt.editedBlocks, "/", rt.totalBlocks, rt.bytes.byteLength);
