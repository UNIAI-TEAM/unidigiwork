// Chạy hết luồng trên fixture Word thật: nhập → sửa tay → AI đề xuất → chấp nhận → vá → tải xuống.
import { readFile } from "node:fs/promises";
import { parseDocxToBlocks, patchDocxAnchored, sha256Hex } from "@/lib/api/docx-import.server";
import { comparePartPreservation, inspectDocx } from "@/lib/api/office-compare.server";

type Case = { file: string; needle: string; instruction: string };

const cases: Case[] = [
  {
    file: "hop-dong-dich-vu.docx",
    needle: "Thời hạn thanh toán là 30 ngày",
    instruction: "Đổi thời hạn thanh toán thành 60 ngày, giữ văn phong hợp đồng.",
  },
  {
    file: "bao-cao-thang.docx",
    needle: "Đề xuất bổ sung một kỹ sư vận hành",
    instruction: "Viết lại kiến nghị rõ ràng hơn, giữ nguyên dữ kiện đã nêu.",
  },
  {
    file: "bao-gia-trien-khai.docx",
    needle: "Báo giá có hiệu lực trong 15 ngày",
    instruction: "Viết lại điều khoản hiệu lực trang trọng hơn, giữ nguyên số ngày.",
  },
];

async function aiRewrite(text: string, instruction: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  try {
    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const res = streamText({
      model: createLovableResponsesProvider(apiKey).responses("openai/gpt-5.6-sol"),
      system:
        "Bạn là trợ lý biên tập tài liệu nghiệp vụ. Chỉ dùng dữ kiện có sẵn, không bịa. Trả về đúng một dòng nội dung đã sửa, không giải thích.",
      messages: [{ role: "user", content: `ĐOẠN: ${text}\nYÊU CẦU: ${instruction}` }],
      providerOptions: { lovable: { max_completion_tokens: 300 } },
    });
    const out = (await res.text).trim().split(/\r?\n/)[0].replace(/^\[?\d*\]?\s*/, "");
    return out && out !== text ? out : null;
  } catch (e) {
    console.log("  AI lỗi:", (e as Error).message);
    return null;
  }
}

let pass = 0;
for (const c of cases) {
  console.log(`\n=== ${c.file}`);
  const original = new Uint8Array(await readFile(`fixtures/docx/${c.file}`));
  const srcSha = await sha256Hex(original);

  // 1) Nhập: parse thành block có neo
  const parsed = await parseDocxToBlocks(original);
  const editable = parsed.blocks.filter((b) => b.editability === "EDITABLE");
  console.log(`nhập: ${parsed.totalBlocks} block, ${parsed.editableBlocks} sửa được`);

  // 2) Sửa tay: đoạn đầu tiên có thể sửa (không phải tiêu đề)
  const manual = editable.find((b) => b.blockType === "paragraph" && b.text.length > 30)!;
  const manualAfter = `${manual.text} (Đã rà soát ngày 09/09/2026.)`;

  // 3) AI đề xuất trên đoạn mục tiêu
  const target = parsed.blocks.find((b) => b.text.includes(c.needle))!;
  if (!target || target.editability !== "EDITABLE") {
    console.log("KHÔNG TÌM THẤY ĐOẠN MỤC TIÊU → FAIL");
    continue;
  }
  const aiAfter = (await aiRewrite(target.text, c.instruction)) ?? `${target.text} [đã rà soát]`;
  console.log(`AI đề xuất: ${aiAfter.slice(0, 90)}...`);

  // 4) Chấp nhận cả hai thay đổi rồi vá theo neo
  const ops = [
    {
      blockKey: manual.blockKey,
      docxIndex: manual.sourceAnchor.docxIndex!,
      before: manual.text,
      after: manualAfter,
    },
    {
      blockKey: target.blockKey,
      docxIndex: target.sourceAnchor.docxIndex!,
      before: target.text,
      after: aiAfter,
    },
  ].filter((o, i, a) => a.findIndex((x) => x.blockKey === o.blockKey) === i);

  const patched = await patchDocxAnchored(original, ops);
  const pres = await comparePartPreservation(original, patched.bytes);
  const insp = await inspectDocx(patched.bytes);
  const reparsed = await parseDocxToBlocks(patched.bytes);
  const outPath = `/tmp/fixture-out-${c.file}`;
  await Bun.write(outPath, patched.bytes);

  const checks = {
    opens: insp.opensSuccessfully,
    noMissingParts: insp.missingRequiredParts.length === 0,
    newTextPresent: insp.text.includes(aiAfter.slice(0, 40)),
    oldTextGone: !insp.text.includes(target.text),
    onlyDocumentXmlChanged:
      pres.changed.length === 1 && pres.changed[0] === "word/document.xml",
    noPartsAddedRemoved: pres.added.length === 0 && pres.removed.length === 0,
    tablesKept: insp.tables === (await inspectDocx(original)).tables,
    blockCountStable: reparsed.totalBlocks === parsed.totalBlocks,
    originalUntouched: (await sha256Hex(original)) === srcSha,
  };
  const ok = Object.values(checks).every(Boolean);
  if (ok) pass += 1;
  console.log("vá:", patched.editedBlocks, "đoạn |", JSON.stringify(pres));
  console.log("kiểm tra:", JSON.stringify(checks));
  console.log("tải xuống:", outPath, "|", ok ? "PASS" : "FAIL");
}

// An toàn: neo sai phải bị chặn
try {
  const b = new Uint8Array(await readFile("fixtures/docx/hop-dong-dich-vu.docx"));
  await patchDocxAnchored(b, [{ blockKey: "x", docxIndex: 9999, before: "a", after: "b" }]);
  console.log("\nSAFETY: FAIL (không chặn)");
} catch (e) {
  console.log("\nSAFETY:", (e as Error).message);
}

console.log(`\nKẾT QUẢ: ${pass}/${cases.length} fixture PASS`);
