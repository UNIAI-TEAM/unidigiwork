import { readFile } from "node:fs/promises";
import { parseDocxToBlocks } from "@/lib/api/docx-import.server";
const files = ["hop-dong-dich-vu.docx","bao-cao-thang.docx","bao-gia-trien-khai.docx"];
for (const f of files) {
  const p = await parseDocxToBlocks(new Uint8Array(await readFile(`fixtures/docx/${f}`)), null);
  console.log("=== " + f);
  p.blocks.forEach((b: any, i: number) => console.log(`${i}\t${b.semanticRole}\t${b.detectedBy ?? "-"}\t${b.detectionScore ?? "-"}\t${String(b.content ?? "").slice(0,70).replace(/\n/g," ")}`));
}
