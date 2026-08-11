import fs from "node:fs";
import path from "node:path";

const root = "/dev-server";
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|dist|\.output/.test(p)) walk(p, out); }
    else if (/\.(ts|tsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
};
const files = walk(path.join(root, "src"));
const rel = (f) => f.replace(root + "/", "");

// 1. server functions inventory
const fns = [];
for (const f of files.filter((f) => /\.functions\.ts$/.test(f))) {
  const src = fs.readFileSync(f, "utf8");
  const re = /export const (\w+)\s*=\s*createServerFn\(\{\s*method:\s*"(\w+)"/g;
  let m;
  while ((m = re.exec(src))) fns.push({ name: m[1], method: m[2], file: rel(f), auth: /requireSupabaseAuth/.test(src.slice(m.index, m.index + 400)) });
}

// 2. consumers
const uiFiles = files.filter((f) => /src\/(routes|components|hooks|pages)\//.test(f));
const uiSrc = uiFiles.map((f) => ({ f: rel(f), s: fs.readFileSync(f, "utf8") }));
const allSrc = files.map((f) => ({ f: rel(f), s: fs.readFileSync(f, "utf8") }));
for (const fn of fns) {
  const re = new RegExp(`\\b${fn.name}\\b`);
  fn.uiConsumers = uiSrc.filter((u) => !u.f.endsWith(fn.file) && re.test(u.s)).map((u) => u.f);
  fn.anyConsumers = allSrc.filter((u) => u.f !== fn.file && re.test(u.s)).map((u) => u.f);
}

// 3. direct DB access in UI
const direct = [];
for (const u of uiSrc) {
  u.s.split("\n").forEach((line, i) => {
    const m = line.match(/supabase\s*\.\s*(from|rpc)\(\s*["'`]([\w.]+)/);
    if (m) {
      const win = u.s.split("\n").slice(i, i + 6).join(" ");
      const op = /\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(win) ? "WRITE" : m[1] === "rpc" ? "RPC" : "READ";
      direct.push({ file: u.f, line: i + 1, target: m[2], op });
    }
  });
}

// 4. suspicious patterns
const patterns = [
  ["TODO/FIXME", /\b(TODO|FIXME)\b/],
  ["mock/dummy/fake", /\b(mockData|dummyData|fakeData|placeholderData\s*=|demoData|MOCK_|DEMO_|SAMPLE_)/],
  ["coming soon", /coming soon|Sắp ra mắt|chưa hỗ trợ|not implemented/i],
  ["empty catch", /catch\s*(\([^)]*\))?\s*\{\s*\}/],
  ["swallow catch", /\.catch\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)/],
  ["setTimeout fake", /setTimeout\(/],
  ["localStorage", /localStorage\./],
];
const suspicious = [];
for (const u of uiSrc) {
  u.s.split("\n").forEach((line, i) => {
    for (const [label, re] of patterns) if (re.test(line)) suspicious.push({ file: u.f, line: i + 1, kind: label, code: line.trim().slice(0, 140) });
  });
}

// 5. toast.success without awaited mutation in same handler window
const toastOnly = [];
for (const u of uiSrc) {
  const lines = u.s.split("\n");
  lines.forEach((line, i) => {
    if (/toast\.success\(/.test(line)) {
      const win = lines.slice(Math.max(0, i - 25), i).join("\n");
      const hasCall = /await |mutateAsync|mutate\(|useServerFn|supabase\./.test(win);
      if (!hasCall) toastOnly.push({ file: u.f, line: i + 1, code: line.trim().slice(0, 120) });
    }
  });
}

// 6. onClick handlers count / buttons
let buttons = 0, onClicks = 0, forms = 0, mutations = 0;
for (const u of uiSrc) {
  buttons += (u.s.match(/<Button|<button/g) || []).length;
  onClicks += (u.s.match(/onClick=/g) || []).length;
  forms += (u.s.match(/onSubmit=/g) || []).length;
  mutations += (u.s.match(/useMutation\(/g) || []).length;
}

const routes = files.filter((f) => /src\/routes\//.test(f) && !/routeTree/.test(f)).map(rel);
const out = { generatedAt: new Date().toISOString(), counts: { routes: routes.length, serverFns: fns.length, uiFiles: uiFiles.length, buttons, onClicks, forms, mutations, directDbUi: direct.length, orphanFns: fns.filter((f) => f.uiConsumers.length === 0).length }, fns, direct, suspicious, toastOnly, routes };
fs.mkdirSync(path.join(root, "tests/runtime/crud/artifacts"), { recursive: true });
fs.writeFileSync(path.join(root, "tests/runtime/crud/artifacts/static-scan.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts, null, 2));
console.log("orphans:", fns.filter((f) => f.uiConsumers.length === 0).map((f) => f.name + " @" + f.file).join("\n "));
console.log("direct WRITE:", direct.filter((d) => d.op !== "READ").map((d) => `${d.file}:${d.line} ${d.op} ${d.target}`).join("\n "));
console.log("toastOnly:", toastOnly.length, toastOnly.slice(0, 20));
