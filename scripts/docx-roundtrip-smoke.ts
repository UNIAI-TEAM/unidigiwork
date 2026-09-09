// Bằng chứng chạy thật: nhập DOCX → sửa 1 đoạn → vá giữ nguyên gói OOXML.
import { renderDocxWithGenOffice } from "@/lib/api/office-genoffice.server";
import { parseDocxToBlocks, patchDocxAnchored, sha256Hex } from "@/lib/api/docx-import.server";
import { comparePartPreservation, inspectDocx } from "@/lib/api/office-compare.server";

const content = `# Hợp đồng dịch vụ ACME

## Điều khoản thương mại

The contract period is 30 days.

Thời hạn thanh toán là 30 ngày kể từ ngày nhận hoá đơn.

- Phạm vi: triển khai UNIWORK
- Hỗ trợ: 12 tháng

| Hạng mục | Giá |
| --- | --- |
| Triển khai | 100.000.000 |
`;

const src = await renderDocxWithGenOffice({
  format: "DOCX",
  title: "Hợp đồng dịch vụ ACME",
  content,
  businessType: "CONTRACT",
  version: 1,
  workProductId: "fixture",
  provenance: [],
});

const parsed = await parseDocxToBlocks(src.bytes);
const target = parsed.blocks.find((b) => b.text.includes("Thời hạn thanh toán là 30 ngày"))!;
console.log("blocks:", parsed.totalBlocks, "editable:", parsed.editableBlocks);
console.log("target:", target.blockKey, target.editability, JSON.stringify(target.sourceAnchor));

const patched = await patchDocxAnchored(src.bytes, [
  {
    blockKey: target.blockKey,
    docxIndex: target.sourceAnchor.docxIndex!,
    before: target.text,
    after: "Thời hạn thanh toán là 60 (sáu mươi) ngày kể từ ngày nhận hoá đơn hợp lệ.",
  },
]);

const pres = await comparePartPreservation(src.bytes, patched.bytes);
const insp = await inspectDocx(patched.bytes);
console.log("edited:", patched.editedBlocks, "/", patched.totalBlocks);
console.log("preservation:", JSON.stringify(pres));
console.log("opens:", insp.opensSuccessfully, "missing:", insp.missingRequiredParts);
console.log("has 60 days:", insp.text.includes("60 (sáu mươi) ngày"));
console.log("old text gone:", !insp.text.includes("Thời hạn thanh toán là 30 ngày"));
console.log("tables preserved:", insp.tables, "headings:", insp.headings, "listItems:", insp.listItems);
console.log("sha src:", (await sha256Hex(src.bytes)).slice(0, 16), "sha new:", (await sha256Hex(patched.bytes)).slice(0, 16));

// An toàn: neo sai phải dừng.
try {
  await patchDocxAnchored(src.bytes, [{ blockKey: "x", docxIndex: 99999, before: "a", after: "b" }]);
  console.log("SAFETY: FAIL (không chặn)");
} catch (e) {
  console.log("SAFETY:", (e as Error).message, (e as any).detail);
}
await Bun.write("/tmp/rt-src.docx", src.bytes);
await Bun.write("/tmp/rt-patched.docx", patched.bytes);
