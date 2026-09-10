import { readFile } from "node:fs/promises";
import { parseDocxToBlocks } from "@/lib/api/docx-import.server";
const p = await parseDocxToBlocks(new Uint8Array(await readFile("fixtures/docx/hop-dong-dich-vu.docx")), null);
console.log(JSON.stringify(p.blocks.slice(0, 4), null, 2));
