// Hiệu chỉnh trọng số nhận diện Word: dò tìm bộ trọng số cho độ chính xác cao nhất trên fixture có nhãn chuẩn.
import { readFile } from "node:fs/promises";
import { parseDocxToBlocks } from "@/lib/api/docx-import.server";
import { generateCalibrationFixture, groundTruth } from "./docx-calibration-fixture";

type Weights = {
  title: number;
  heading: number;
  listItem: number;
  quote: number;
  caption: number;
  table: number;
};

const FIXTURE = "fixtures/docx/bien-ban-thuan-viet.docx";

async function evaluate(bytes: Uint8Array, weights: Weights) {
  const parsed = await parseDocxToBlocks(bytes, weights);
  const byText = new Map<string, string>();
  for (const b of parsed.blocks as any[]) {
    byText.set(String(b.text ?? "").trim(), String(b.sourceAnchor?.role ?? "PARAGRAPH"));
  }
  const perRole = new Map<string, { ok: number; total: number }>();
  let ok = 0;
  for (const gt of groundTruth) {
    const got = byText.get(gt.text.trim()) ?? "MISSING";
    const bucket = perRole.get(gt.role) ?? { ok: 0, total: 0 };
    bucket.total += 1;
    if (got === gt.role) {
      bucket.ok += 1;
      ok += 1;
    }
    perRole.set(gt.role, bucket);
  }
  return { accuracy: ok / groundTruth.length, perRole };
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const bytes = new Uint8Array(await readFile(await generateCalibrationFixture(FIXTURE)));

const baseline: Weights = { title: 1, heading: 1, listItem: 1, quote: 1, caption: 1, table: 1 };
const grid = [0.8, 1, 1.2, 1.4, 1.6];
let best = { weights: baseline, accuracy: (await evaluate(bytes, baseline)).accuracy };

for (const title of grid)
  for (const heading of grid)
    for (const listItem of grid)
      for (const quote of grid)
        for (const caption of grid) {
          const w: Weights = { title, heading, listItem, quote, caption, table: 1.2 };
          const { accuracy } = await evaluate(bytes, w);
          if (accuracy > best.accuracy) best = { weights: w, accuracy };
        }

const before = await evaluate(bytes, baseline);
const after = await evaluate(bytes, best.weights);

console.log(`Trọng số mặc định cũ (tất cả = 1): ${pct(before.accuracy)}`);
console.log(`Trọng số hiệu chỉnh: ${JSON.stringify(best.weights)} → ${pct(after.accuracy)}`);
console.log("\nLoại nhận diện\tTrước\tSau");
for (const role of new Set([...before.perRole.keys(), ...after.perRole.keys()])) {
  const b = before.perRole.get(role)!;
  const a = after.perRole.get(role)!;
  console.log(`${role}\t${b.ok}/${b.total}\t${a.ok}/${a.total}`);
}
