/**
 * HARDEN-SELLWORK-1 — CI GATE
 *
 * Hai lớp bảo vệ chống hồi quy:
 *
 *  A. WORK GRAPH SCHEMA DRIFT
 *     Mọi `supabase.from("<table>").select("<cols>")` trong repo phải khớp
 *     với schema thật (`src/integrations/supabase/types.ts`). Đây là cách
 *     `starts_at` vs `start_at` từng lọt vào production: TypeScript không bắt
 *     được vì chuỗi select bị ép kiểu `as never` / `any`.
 *
 *  B. CONTRACT SNAPSHOT FAIL-CLOSED
 *     `bindWorkProductExecution` phải ném lỗi ở MỌI nhánh thất bại, và caller
 *     (`ai-tasks.functions.ts`) phải đóng lượt chạy FAILED trước khi gọi AI.
 *     Không được phép "âm thầm chạy tiếp khi chưa gắn được hợp đồng".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TYPES_FILE = join(ROOT, "src/integrations/supabase/types.ts");

/* ------------------------------------------------------------------ *
 * Schema map từ types.ts (nguồn sự thật do Supabase sinh ra)
 * ------------------------------------------------------------------ */

function parseSchema(): Map<string, Set<string>> {
  const src = readFileSync(TYPES_FILE, "utf8");
  const lines = src.split("\n");
  const map = new Map<string, Set<string>>();

  let currentTable: string | null = null;
  let inRow = false;
  let rowIndent = 0;

  for (const raw of lines) {
    const tableMatch = /^ {6}(\w+): \{$/.exec(raw);
    if (tableMatch) {
      currentTable = tableMatch[1];
      inRow = false;
      continue;
    }
    if (currentTable && /^ {8}Row: \{$/.test(raw)) {
      inRow = true;
      rowIndent = 10;
      map.set(currentTable, new Set<string>());
      continue;
    }
    if (inRow) {
      if (/^ {8}\}$/.test(raw)) {
        inRow = false;
        continue;
      }
      const col = new RegExp(`^ {${rowIndent}}(\\w+)\\??:`).exec(raw);
      if (col) map.get(currentTable!)!.add(col[1]);
    }
  }
  return map;
}

const SCHEMA = parseSchema();

/* ------------------------------------------------------------------ *
 * Quét mã nguồn
 * ------------------------------------------------------------------ */

const SCAN_DIRS = ["src/lib", "src/routes", "src/components", "src/features", "src/hooks", "src/domain"];
const EXT = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

/** Tách token cột cấp cao nhất, bỏ qua khối quan hệ lồng nhau `rel(a,b)`. */
function topLevelColumns(select: string): { columns: string[]; relations: string[] } {
  const columns: string[] = [];
  const relations: string[] = [];
  let depth = 0;
  let buf = "";
  const flush = () => {
    const token = buf.trim();
    buf = "";
    if (!token) return;
    const relMatch = /^([\w:!.]+)\s*\(/.exec(token);
    if (relMatch) {
      relations.push(relMatch[1].split(":").pop()!.split("!")[0]);
      return;
    }
    columns.push(token);
  };
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return { columns, relations };
}

/** Chuẩn hoá token cột: bỏ alias `alias:col`, bỏ cast `col::text`, bỏ modifier. */
function normalizeColumn(token: string): string | null {
  let t = token.trim();
  if (!t || t === "*") return null;
  if (t.includes("::")) t = t.split("::")[0];
  if (t.includes(":")) t = t.split(":").pop()!.trim();
  t = t.replace(/\.\.\.$/, "").trim();
  if (!/^\w+$/.test(t)) return null; // aggregate / json path — bỏ qua
  if (t === "count") return null;
  return t;
}

interface Drift {
  file: string;
  line: number;
  table: string;
  column: string;
}

function scanSchemaDrift(): { drifts: Drift[]; checked: number } {
  const drifts: Drift[] = [];
  let checked = 0;
  // `.from("table")` … `.select("cols")` trong cùng một biểu thức chuỗi.
  const re = /\.from\(\s*["'`](\w+)["'`]\s*(?:as\s+\w+\s*)?\)\s*(?:as\s+\w+\s*)?\.select\(\s*["'`]([^"'`]*)["'`]/g;

  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const [, table, select] = m;
      const cols = SCHEMA.get(table);
      if (!cols) continue; // view / RPC-backed / bảng ngoài public — không phán xét
      checked++;
      const line = src.slice(0, m.index).split("\n").length;
      const { columns } = topLevelColumns(select);
      for (const token of columns) {
        const col = normalizeColumn(token);
        if (!col) continue;
        if (!cols.has(col)) drifts.push({ file: rel, line, table, column: col });
      }
    }
  }
  return { drifts, checked };
}

/* ------------------------------------------------------------------ *
 * A. Work Graph schema drift
 * ------------------------------------------------------------------ */

describe("CI GATE A — schema drift trên truy vấn Supabase", () => {
  it("parse được schema từ types.ts", () => {
    expect(SCHEMA.size).toBeGreaterThan(50);
    expect(SCHEMA.get("meetings")?.has("start_at")).toBe(true);
    expect(SCHEMA.get("meetings")?.has("starts_at")).toBe(false);
  });

  it("mọi cột trong .select() đều tồn tại trong schema thật", () => {
    const { drifts, checked } = scanSchemaDrift();
    expect(checked).toBeGreaterThan(20);
    const report = drifts
      .map((d) => `  ${d.file}:${d.line} — ${d.table}.${d.column} KHÔNG tồn tại`)
      .join("\n");
    expect(drifts, `Schema drift phát hiện:\n${report}`).toEqual([]);
  });

  it("Work Graph dùng đúng cột thời gian của meetings (start_at)", () => {
    const wgFiles = FILES.filter((f) => /work-graph\.(server|functions)\.ts$/.test(f));
    expect(wgFiles.length).toBeGreaterThanOrEqual(2);
    for (const f of wgFiles) {
      const src = readFileSync(f, "utf8");
      const bad = src.split("\n").reduce<number[]>((acc, l, i) => {
        const code = l.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/\bstarts_at\b/.test(code)) acc.push(i + 1);
        return acc;
      }, []);
      expect(bad, `${relative(ROOT, f)} dùng cột không tồn tại 'starts_at' ở dòng ${bad.join(", ")}`).toEqual([]);
    }
  });

  it("route-resolver của Work Graph phủ hết loại thực thể điều hướng được", () => {
    const resolver = readFileSync(join(ROOT, "src/domain/work-graph/route-resolver.ts"), "utf8");
    // TENANT không có route chi tiết riêng — cố ý nằm ngoài danh sách.
    const NAVIGABLE = ["TASK", "MEETING", "DOCUMENT", "EMAIL", "CHAT_CHANNEL", "PERSON", "WORKSPACE"];
    for (const t of NAVIGABLE) {
      expect(resolver.includes(t), `route-resolver thiếu loại thực thể ${t}`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * B. Contract snapshot fail-closed
 * ------------------------------------------------------------------ */

const WORK_PRODUCTS = readFileSync(join(ROOT, "src/lib/api/work-products.server.ts"), "utf8");
const AI_TASKS = readFileSync(join(ROOT, "src/lib/api/ai-tasks.functions.ts"), "utf8");

function bindBody(): string {
  const start = WORK_PRODUCTS.indexOf("export async function bindWorkProductExecution");
  expect(start, "không tìm thấy bindWorkProductExecution").toBeGreaterThan(-1);
  return WORK_PRODUCTS.slice(start);
}

describe("CI GATE B — hợp đồng sản phẩm công việc fail-closed", () => {
  it("bindWorkProductExecution ném lỗi ở mọi nhánh thất bại", () => {
    const body = bindBody();
    expect(body).toMatch(/if\s*\(res\.error\)\s*throw new Error\("WORK_PRODUCT_BIND_FAILED"\)/);
    expect(body).toMatch(/if\s*\(!row\)\s*throw new Error\("WORK_PRODUCT_BIND_FAILED"\)/);
    expect(body).toMatch(/throw new Error\("WORK_PRODUCT_CONTRACT_MISMATCH"\)/);
  });

  it("không có nhánh trả về im lặng khi chưa gắn được hợp đồng", () => {
    const body = bindBody();
    expect(body).not.toMatch(/return\s*\{\s*bound:\s*false/);
    expect(body).not.toMatch(/catch\s*\{\s*\}/);
    expect(body).not.toMatch(/console\.(warn|error)[^\n]*\n\s*return/);
  });

  it("ALREADY_BOUND chỉ hợp lệ khi trùng đúng code + version", () => {
    const body = bindBody();
    expect(body).toMatch(/reason !== "ALREADY_BOUND"/);
    expect(body).toMatch(/workUnitCode/);
    expect(body).toMatch(/workUnitVersion/);
  });

  it("caller đóng lượt chạy FAILED trước khi gọi AI Gateway", () => {
    const bindIdx = AI_TASKS.indexOf("await bindWorkProductExecution(");
    const orchestrateIdx = AI_TASKS.indexOf("orchestrateWorkExecution");
    expect(bindIdx).toBeGreaterThan(-1);
    expect(orchestrateIdx).toBeGreaterThan(bindIdx);

    const between = AI_TASKS.slice(bindIdx, orchestrateIdx);
    expect(between).toMatch(/finish_ai_task_execution/);
    expect(between).toMatch(/_status:\s*"FAILED"/);
    expect(between).toMatch(/WORK_PRODUCT_CONTRACT_MISMATCH/);
    expect(between).toMatch(/WORK_PRODUCT_BIND_FAILED/);
    expect(between).toMatch(/throw new ApiError\(/);
  });

  it("preflight hợp đồng chạy trước khi mở lượt chạy", () => {
    const preflight = AI_TASKS.indexOf("validateWorkProductExecution({");
    const start = AI_TASKS.indexOf("start_ai_task_execution");
    expect(preflight).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(preflight);
    expect(AI_TASKS).toMatch(/WORK_PRODUCT_PREFLIGHT_FAILED/);
  });
});
