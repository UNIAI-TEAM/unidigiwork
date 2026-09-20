import { renderOfficeArtifact } from "../src/lib/api/office-engine.server";
import { compareEngines, comparePartPreservation } from "../src/lib/api/office-compare.server";
import { roundTripDocxWithGenOffice, GENOFFICE_COMMIT } from "../src/lib/api/office-genoffice.server";
import { writeFileSync } from "node:fs";

const content = `# Đề xuất hợp tác ACME
Đoạn mở đầu **quan trọng** với chữ *nghiêng* và <u>gạch chân</u>.

## Mục tiêu
- Tăng hiệu suất 30%
- Giảm chi phí vận hành

1. Giai đoạn 1
2. Giai đoạn 2

> Trích dẫn quyết định #182

| Hạng mục | Chi phí |
| --- | --- |
| Triển khai | 100.000.000 |
| Đào tạo | 20.000.000 |

---

## English section
Mixed Vietnamese/English content for fidelity testing.`;

const req = { format: "DOCX" as const, title: "Đề xuất ACME", content, businessType: "PROPOSAL", version: 3, workProductId: "test", provenance: [{ type: "DECISION", id: "182", title: "Quyết định #182", stamp: "v2" }] };

const t0 = Date.now();
const b = await renderOfficeArtifact(req, { engine: "BUILTIN" });
const bms = Date.now() - t0;
const t1 = Date.now();
const g = await renderOfficeArtifact(req, { engine: "GENOFFICE" });
const gms = Date.now() - t1;
writeFileSync("/tmp/bench-builtin.docx", b.bytes);
writeFileSync("/tmp/bench-genoffice.docx", g.bytes);
const cmp = await compareEngines(b.bytes, g.bytes, content);
const rt = await roundTripDocxWithGenOffice(g.bytes, [{ find: "Tăng hiệu suất 30%", replaceWith: "Tăng hiệu suất 40%" }]);
writeFileSync("/tmp/bench-roundtrip.docx", rt.bytes);
const pres = await comparePartPreservation(g.bytes, rt.bytes);
console.log(JSON.stringify({ commit: GENOFFICE_COMMIT, engines: { builtin: b.engine, genoffice: g.engine }, bms, gms, builtin: cmp.builtin, genoffice: cmp.genoffice, textSimilarity: cmp.textSimilarity, missingInGenoffice: cmp.missingInGenoffice, missingInBuiltin: cmp.missingInBuiltin, roundTrip: { ...pres, ...rt, bytes: undefined } }, null, 2));
