import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Activity, ShieldCheck, Radio, CheckCircle2, XCircle, ArrowLeft, Copy, ChevronLeft, ChevronRight, ChevronDown, Download, X, ArrowUp, ArrowDown, Columns3, RefreshCw, Bookmark, Trash2, Save, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { traceByCorrelationId, exportTraceCsv } from "@/lib/api/admin.functions";

const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;
const ALL_KINDS = ["quota", "audit", "outbox"] as const;
type Kind = (typeof ALL_KINDS)[number];

const ALL_SEVERITIES = ["info", "warn", "error"] as const;
type Severity = (typeof ALL_SEVERITIES)[number];
const SEVERITY_META: Record<Severity, { label: string; className: string }> = {
  info: { label: "INFO", className: "text-sky-400 border-sky-500/40" },
  warn: { label: "WARN", className: "text-amber-400 border-amber-500/40" },
  error: { label: "ERROR", className: "text-red-400 border-red-500/40" },
};
function severityOfItem(item: { kind: string; data: unknown }): Severity {
  const d = (item.data ?? {}) as Record<string, unknown>;
  if (item.kind === "quota_check") return d.allowed ? "info" : "error";
  if (item.kind === "outbox") {
    if (d.last_error || d.status === "failed") return "error";
    if (d.status === "pending" || d.status === "running") return "warn";
    return "info";
  }
  return "info";
}

const ALL_STATUSES = ["success", "failure", "pending"] as const;
type Status = (typeof ALL_STATUSES)[number];
const STATUS_META: Record<Status, { label: string; className: string }> = {
  success: { label: "Thành công", className: "text-emerald-400 border-emerald-500/40" },
  failure: { label: "Thất bại", className: "text-red-400 border-red-500/40" },
  pending: { label: "Đang xử lý", className: "text-amber-400 border-amber-500/40" },
};
function statusOfItem(item: { kind: string; data: unknown }): Status {
  const d = (item.data ?? {}) as Record<string, unknown>;
  if (item.kind === "quota_check") return d.allowed ? "success" : "failure";
  if (item.kind === "outbox") {
    if (d.last_error || d.status === "failed") return "failure";
    if (d.status === "pending" || d.status === "running") return "pending";
    return "success";
  }
  return "success";
}

const COLUMN_DEFS = [
  { key: "time", label: "Thời gian" },
  { key: "kind", label: "Loại" },
  { key: "label", label: "Nhãn (meter/event)" },
  { key: "status", label: "Trạng thái" },
  { key: "meta", label: "Chỉ số (Δ/usage/attempts)" },
  { key: "tenant", label: "Tenant" },
  { key: "actor", label: "Actor" },
  { key: "target", label: "Aggregate/Resource ID" },
  { key: "payload", label: "Payload / Lỗi" },
] as const;
type ColumnKey = (typeof COLUMN_DEFS)[number]["key"];
type ColumnPrefs = Record<ColumnKey, boolean>;
const DEFAULT_COLUMNS: ColumnPrefs = {
  time: true, kind: true, label: true, status: true,
  meta: true, tenant: true, actor: true, target: true, payload: true,
};
const COLUMNS_STORAGE_KEY = "uniwork.admin.trace.columns.v1";
const COLUMN_ORDER_STORAGE_KEY = "uniwork.admin.trace.columnOrder.v1";
const COLUMN_PRESETS_STORAGE_KEY = "uniwork.admin.trace.columnPresets.v1";
const CSV_OPTIONS_STORAGE_KEY = "uniwork.admin.trace.csv.v1";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = COLUMN_DEFS.map((c) => c.key) as ColumnKey[];
function normalizeColumnOrder(input: unknown): ColumnKey[] {
  const valid = new Set<string>(DEFAULT_COLUMN_ORDER as string[]);
  const seen = new Set<string>();
  const out: ColumnKey[] = [];
  if (Array.isArray(input)) {
    for (const k of input) {
      if (typeof k === "string" && valid.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k as ColumnKey);
      }
    }
  }
  for (const k of DEFAULT_COLUMN_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

type ColumnPreset = { id: string; name: string; columns: ColumnPrefs; order: ColumnKey[] };

type FilenameTz = "utc" | "local";
type FilenamePartKey =
  | "prefix"
  | "correlationId"
  | "variant"
  | "keyword"
  | "from"
  | "to"
  | "sort"
  | "severities"
  | "statuses"
  | "kinds"
  | "timestamp";
type FilenamePart = { key: FilenamePartKey; enabled: boolean };
const FILENAME_PART_LABELS: Record<FilenamePartKey, string> = {
  prefix: "Prefix (trace)",
  correlationId: "Correlation ID",
  variant: "Variant (all/columns)",
  keyword: "Keyword (kw_…)",
  from: "From (from_…)",
  to: "To (to_…)",
  sort: "Sort (sort_…)",
  severities: "Severities (sev_…)",
  statuses: "Statuses (st_…)",
  kinds: "Kinds (kd_…)",
  timestamp: "Timestamp",
};
const DEFAULT_FILENAME_TEMPLATE: FilenamePart[] = [
  { key: "prefix", enabled: true },
  { key: "correlationId", enabled: true },
  { key: "variant", enabled: true },
  { key: "keyword", enabled: true },
  { key: "from", enabled: true },
  { key: "to", enabled: true },
  { key: "sort", enabled: true },
  { key: "severities", enabled: true },
  { key: "statuses", enabled: true },
  { key: "kinds", enabled: true },
  { key: "timestamp", enabled: true },
];
function normalizeFilenameTemplate(v: unknown): FilenamePart[] {
  const known = new Set<FilenamePartKey>(DEFAULT_FILENAME_TEMPLATE.map((p) => p.key));
  const seen = new Set<FilenamePartKey>();
  const out: FilenamePart[] = [];
  if (Array.isArray(v)) {
    for (const p of v) {
      if (!p || typeof p !== "object") continue;
      const k = (p as { key?: unknown }).key;
      if (typeof k !== "string" || !known.has(k as FilenamePartKey) || seen.has(k as FilenamePartKey)) continue;
      seen.add(k as FilenamePartKey);
      out.push({ key: k as FilenamePartKey, enabled: (p as { enabled?: unknown }).enabled !== false });
    }
  }
  for (const p of DEFAULT_FILENAME_TEMPLATE) {
    if (!seen.has(p.key)) out.push({ ...p });
  }
  return out;
}
type CsvOptions = {
  delimiter: "," | ";" | "\t";
  quoteChar: '"' | "'";
  bom: boolean;
  filenameTz: FilenameTz;
  zip: boolean;
  includeMetadata: boolean;
  separateMetadata: boolean;
  metaJson: boolean;
  autoFixMetadata: boolean;
  filenameTemplate: FilenamePart[];
};
const DEFAULT_CSV_OPTIONS: CsvOptions = {
  delimiter: ",",
  quoteChar: '"',
  bom: true,
  filenameTz: "utc",
  zip: false,
  includeMetadata: true,
  separateMetadata: false,
  metaJson: false,
  autoFixMetadata: true,
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
};

function triggerBlobDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function buildCsvMetadataLine(
  info: {
    correlationId: string;
    variant: "all" | "columns";
    keyword?: string;
    fromIso?: string;
    toIso?: string;
    sort?: "asc" | "desc";
    severities?: readonly Severity[];
    statuses?: readonly Status[];
    kinds?: readonly Kind[];
    rowCount?: number;
  },
  csv: CsvOptions,
): string {
  const setStr = (vals: readonly string[] | undefined, total: number) => {
    if (!vals || vals.length === 0) return "all";
    if (vals.length === total) return "all";
    return vals.join("|");
  };
  const kw = info.keyword?.trim();
  const genTz = csv.filenameTz;
  const localTzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatTs = (d: Date): string => {
    if (genTz === "utc") return d.toISOString().replace(/\.\d{3}Z$/, "Z");
    // Local: YYYY-MM-DDTHH:mm:ss±HH:MM
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const mo = pad(d.getMonth() + 1);
    const da = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return `${y}-${mo}-${da}T${h}:${mi}:${s}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  };
  const formatIso = (iso: string | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return formatTs(d);
  };
  const generatedAt = formatTs(new Date());
  const fields: Array<[string, string]> = [
    ["source", "UNIWORK /admin/trace"],
    ["variant", info.variant === "all" ? "all-results (CSV tất cả kết quả)" : "current-cols (CSV cột hiện tại)"],
    ["correlation_id", info.correlationId],
    ["keyword", kw ?? ""],
    ["from", formatIso(info.fromIso)],
    ["to", formatIso(info.toIso)],
    ["sort", info.sort ?? ""],
    ["severities", setStr(info.severities, ALL_SEVERITIES.length)],
    ["statuses", setStr(info.statuses, ALL_STATUSES.length)],
    ["kinds", setStr(info.kinds, ALL_KINDS.length)],
    ["timezone", genTz === "utc" ? "UTC" : localTzName],
    ["generated_at", generatedAt],
  ];
  if (typeof info.rowCount === "number") fields.push(["rows", String(info.rowCount)]);
  // Sử dụng đúng delimiter/quote đang chọn: mỗi cặp key=value được csvEscape
  // riêng, rồi join bằng delimiter hiện tại (giữ prefix "# " ở đầu tiên).
  const tokens = fields.map(([k, v], i) => {
    const token = `${i === 0 ? "# " : ""}${k}=${v}`;
    return csvEscape(token, csv.delimiter, csv.quoteChar);
  });
  return tokens.join(csv.delimiter);
}
async function downloadCsvOrZip(csvText: string, csvFilename: string, opts: CsvOptions, metadataLine?: string): Promise<void> {
  return downloadCsvOrZipWithFooter(csvText, csvFilename, opts, metadataLine, undefined);
}
async function downloadCsvOrZipWithFooter(
  csvText: string,
  csvFilename: string,
  opts: CsvOptions,
  metadataLine?: string,
  footerLine?: string,
): Promise<void> {
  let metaLine = metadataLine;
  if (opts.includeMetadata && metadataLine) {
    const r = resolveMetadataLine(metadataLine, opts);
    metaLine = r.line;
    recordMetadataCheck({
      at: new Date().toISOString(),
      variant: "export",
      mode: "strict",
      ok: r.ok,
      fieldCount: validateMetadataLine(metaLine, opts).fieldCount,
      delimiter: opts.delimiter,
      quoteChar: opts.quoteChar,
      message: (r.fixed ? "Auto-fixed · " : "") + r.message,
      line: metaLine,
    });
    if (r.fixed) {
      toast.info("Đã tự động sửa dòng metadata để parse OK trước khi export.");
    } else if (!r.ok) {
      const v = validateMetadataLine(metaLine ?? "", opts);
      const detail = v.issues
        .slice(0, 3)
        .map((i) => `• ${i.index >= 0 ? `Trường #${i.index + 1}` : "Dòng"} (ký tự ${i.position})${i.key ? ` key="${i.key}"` : ""}: ${i.message}`)
        .join("\n");
      toast.warning(`Metadata không parse được với delimiter/quote đang chọn: ${r.message}`, {
        description: detail || undefined,
        duration: 8000,
      });
    }
  }
  const useSeparate = opts.zip && opts.separateMetadata && (!!metaLine || !!footerLine);
  const header = !useSeparate && opts.includeMetadata && metaLine ? metaLine + "\r\n" : "";
  const footer = !useSeparate && footerLine ? (csvText.endsWith("\n") ? "" : "\r\n") + footerLine + "\r\n" : "";
  const body = (opts.bom ? "\ufeff" : "") + header + csvText + footer;
  if (opts.zip) {
    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = { [csvFilename]: strToU8(body) };
    if (useSeparate) {
      const metaName = toMetaFilename(csvFilename);
      const parts: string[] = [];
      if (opts.includeMetadata && metaLine) parts.push(metaLine);
      if (footerLine) parts.push(footerLine);
      files[metaName] = strToU8(parts.join("\r\n") + "\r\n");
    }
    if (opts.metaJson && (metaLine || footerLine)) {
      files[toMetaJsonFilename(csvFilename)] = strToU8(
        buildMetaJson(csvFilename, opts, opts.includeMetadata ? metaLine : undefined, footerLine),
      );
    }
    const zipped = zipSync(files, { level: 6 });
    triggerBlobDownload(new Blob([zipped as BlobPart], { type: "application/zip" }), toZipFilename(csvFilename));
  } else {
    triggerBlobDownload(new Blob([body], { type: "text/csv;charset=utf-8;" }), csvFilename);
  }
}

/** Build a single-line CSV footer với tổng rows, số record theo severity, và thời gian xử lý. */
function buildCsvFooterLine(
  info: {
    variant: "all" | "columns";
    totalRows: number;
    severityCounts: { info: number; warn: number; error: number };
    durationMs: number;
    truncated?: boolean;
    exportedRows?: number;
  },
  csv: CsvOptions,
): string {
  const fields: Array<[string, string]> = [
    ["summary", info.variant === "all" ? "all-results" : "current-cols"],
    ["total_rows", String(info.totalRows)],
  ];
  if (typeof info.exportedRows === "number" && info.exportedRows !== info.totalRows) {
    fields.push(["exported_rows", String(info.exportedRows)]);
  }
  if (info.truncated) fields.push(["truncated", "true"]);
  fields.push(
    ["severity_info", String(info.severityCounts.info)],
    ["severity_warn", String(info.severityCounts.warn)],
    ["severity_error", String(info.severityCounts.error)],
    ["processing_ms", String(Math.max(0, Math.round(info.durationMs)))],
  );
  const line = "# " + fields.map(([k, v]) => `${k}=${v}`).join(" | ");
  return csvEscape(line, csv.delimiter, csv.quoteChar);
}

/** Chuẩn hoá tên file .zip từ tên .csv tương ứng: giữ nguyên stem (bao gồm timezone, sort, severity, status, kinds, keyword, from/to). */
/** Thống kê của lần export gần nhất, dùng để xem trước processing_ms và tổng rows. */
type LastExportStats = {
  variant: "all" | "columns";
  rows: number;
  processingMs: number;
  at: number;
};

function toZipFilename(csvFilename: string): string {
  return csvFilename.replace(/\.csv$/i, "") + ".zip";
}

/** Tên file metadata đi kèm khi tách khỏi CSV trong ZIP (giữ nguyên stem). */
function toMetaFilename(csvFilename: string): string {
  return csvFilename.replace(/\.csv$/i, "") + ".meta.txt";
}

/** Tên file metadata JSON đi kèm trong ZIP (giữ nguyên stem). */
function toMetaJsonFilename(csvFilename: string): string {
  return csvFilename.replace(/\.csv$/i, "") + ".meta.json";
}

/** Tách chuỗi "k=v" thành cặp; giữ nguyên phần value có chứa "=". */
function splitKeyValue(token: string): [string, string] | null {
  const t = token.replace(/^#\s*/, "").trim();
  const i = t.indexOf("=");
  if (i <= 0) return null;
  return [t.slice(0, i).trim(), t.slice(i + 1)];
}

/** Chuyển giá trị chuỗi sang số khi hợp lệ để JSON dễ import lại. */
function coerceMetaValue(key: string, raw: string): string | number | boolean {
  if (/^(rows|total_rows|exported_rows|processing_ms|severity_(info|warn|error))$/.test(key)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

/** Build nội dung `<stem>.meta.json` từ dòng metadata + footer đang dùng cho CSV. */
function buildMetaJson(
  csvFilename: string,
  opts: CsvOptions,
  metadataLine?: string,
  footerLine?: string,
): string {
  const meta: Record<string, string | number | boolean> = {};
  if (metadataLine) {
    const tokens = parseCsvLine(metadataLine, opts.delimiter, opts.quoteChar);
    for (const tk of tokens ?? []) {
      const kv = splitKeyValue(tk);
      if (kv) meta[kv[0]] = coerceMetaValue(kv[0], kv[1]);
    }
  }
  const summary: Record<string, string | number | boolean> = {};
  if (footerLine) {
    const unquoted = parseCsvLine(footerLine, opts.delimiter, opts.quoteChar)?.[0] ?? footerLine;
    for (const tk of unquoted.replace(/^#\s*/, "").split(" | ")) {
      const kv = splitKeyValue(tk);
      if (kv) summary[kv[0]] = coerceMetaValue(kv[0], kv[1]);
    }
  }
  const payload = {
    schema: "uniwork.trace.export.meta/v1",
    file: {
      csv: csvFilename,
      zip: toZipFilename(csvFilename),
      meta_json: toMetaJsonFilename(csvFilename),
    },
    csv_options: {
      delimiter: opts.delimiter === "\t" ? "\\t" : opts.delimiter,
      quote_char: opts.quoteChar,
      bom: opts.bom,
      timezone: opts.filenameTz === "utc" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone,
      zip: opts.zip,
      separate_metadata: opts.separateMetadata,
    },
    metadata: meta,
    summary,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/** Parse 1 dòng CSV theo đúng delimiter/quote đang chọn (RFC4180-style). */
function parseCsvLine(line: string, delim: string, quote: string): string[] | null {
  const r = parseCsvLineDetailed(line, delim, quote);
  return r.ok ? r.fields : null;
}

type CsvLineParse =
  | { ok: true; fields: string[]; starts: number[] }
  | { ok: false; position: number; reason: string };

/** Parse 1 dòng CSV kèm vị trí ký tự bắt đầu từng field và vị trí lỗi nếu có. */
function parseCsvLineDetailed(line: string, delim: string, quote: string): CsvLineParse {
  const out: string[] = [];
  const starts: number[] = [0];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === quote) {
        if (line[i + 1] === quote) { cur += quote; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === quote) {
      if (cur.length > 0) {
        return { ok: false, position: i, reason: `Dấu bao chuỗi ${quote} xuất hiện giữa field (phải nằm ở đầu field hoặc được nhân đôi)` };
      }
      inQuotes = true; i++; continue;
    }
    if (ch === delim) { out.push(cur); cur = ""; i++; starts.push(i); continue; }
    cur += ch; i++;
  }
  if (inQuotes) {
    return { ok: false, position: line.length, reason: `Dấu bao chuỗi ${quote} chưa được đóng đến cuối dòng` };
  }
  out.push(cur);
  return { ok: true, fields: out, starts };
}

type MetadataIssue = {
  index: number;
  position: number;
  key: string;
  value: string;
  raw: string;
  message: string;
};
type MetadataValidation = { ok: boolean; fieldCount: number; message: string; issues: MetadataIssue[] };

/** Xác thực dòng metadata: parse ngược bằng chính delimiter/quote đang chọn. */
function validateMetadataLine(line: string, csv: CsvOptions): MetadataValidation {
  const parsed = parseCsvLineDetailed(line, csv.delimiter, csv.quoteChar);
  if (!parsed.ok) {
    const near = line.slice(Math.max(0, parsed.position - 12), parsed.position + 12);
    return {
      ok: false,
      fieldCount: 0,
      message: `Không parse được tại ký tự ${parsed.position + 1}: ${parsed.reason}.`,
      issues: [
        {
          index: -1,
          position: parsed.position + 1,
          key: "",
          value: "",
          raw: near,
          message: parsed.reason,
        },
      ],
    };
  }
  const { fields, starts } = parsed;
  const cleaned = fields.map((f, i) => (i === 0 ? f.replace(/^#\s*/, "") : f));
  const issues: MetadataIssue[] = [];
  cleaned.forEach((f, i) => {
    if (/^[a-z_]+=/.test(f)) return;
    const eq = f.indexOf("=");
    const key = eq > 0 ? f.slice(0, eq) : f;
    const value = eq > 0 ? f.slice(eq + 1) : "";
    issues.push({
      index: i,
      position: (starts[i] ?? 0) + 1,
      key,
      value,
      raw: fields[i],
      message:
        eq <= 0
          ? "Thiếu dấu '=' — trường phải có dạng key=value"
          : `Key "${key}" chứa ký tự không hợp lệ (chỉ cho phép a-z và _)`,
    });
  });
  if (issues.length > 0) {
    return {
      ok: false,
      fieldCount: fields.length,
      message: `Có ${issues.length}/${fields.length} trường không đúng dạng key=value.`,
      issues,
    };
  }
  if (!/^#/.test(line.replace(new RegExp(`^${escapeRegExp(csv.quoteChar)}`), ""))) {
    return {
      ok: false,
      fieldCount: fields.length,
      message: "Dòng metadata phải bắt đầu bằng ký tự '#'.",
      issues: [
        { index: 0, position: 1, key: cleaned[0]?.split("=")[0] ?? "", value: "", raw: fields[0] ?? "", message: "Thiếu tiền tố '#' ở đầu dòng" },
      ],
    };
  }
  return { ok: true, fieldCount: fields.length, message: `Parse OK — ${fields.length} trường key=value.`, issues: [] };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Chuẩn hoá lại dòng metadata để chắc chắn parse OK với delimiter/quote đang chọn:
 * tách token (fallback khi quote hỏng), gom mảnh không có "=" vào value trước đó,
 * chuẩn hoá key về dạng [a-z_]+, rồi csvEscape và join lại bằng delimiter hiện tại.
 */
function sanitizeMetadataLine(line: string, csv: CsvOptions): string {
  const parsed = parseCsvLine(line, csv.delimiter, csv.quoteChar);
  const rawTokens =
    parsed ??
    line
      .split(csv.quoteChar)
      .join("")
      .split(csv.delimiter);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const token = (i === 0 ? rawTokens[i].replace(/^#\s*/, "") : rawTokens[i]).trim();
    if (!token) continue;
    const eq = token.indexOf("=");
    if (eq <= 0) {
      if (pairs.length > 0) pairs[pairs.length - 1][1] += ` ${token}`;
      continue;
    }
    const key = token
      .slice(0, eq)
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!key) {
      if (pairs.length > 0) pairs[pairs.length - 1][1] += ` ${token}`;
      continue;
    }
    pairs.push([key, token.slice(eq + 1)]);
  }
  if (pairs.length === 0) return csvEscape("# metadata=", csv.delimiter, csv.quoteChar);
  return pairs
    .map(([k, v], i) => csvEscape(`${i === 0 ? "# " : ""}${k}=${v}`, csv.delimiter, csv.quoteChar))
    .join(csv.delimiter);
}

/** Trả về dòng metadata đã sẵn sàng export: tự sửa nếu bật autoFixMetadata và dòng gốc không parse được. */
function resolveMetadataLine(
  line: string,
  csv: CsvOptions,
): { line: string; fixed: boolean; ok: boolean; message: string } {
  const v = validateMetadataLine(line, csv);
  if (v.ok) return { line, fixed: false, ok: true, message: v.message };
  if (!csv.autoFixMetadata) return { line, fixed: false, ok: false, message: v.message };
  const repaired = sanitizeMetadataLine(line, csv);
  const after = validateMetadataLine(repaired, csv);
  return { line: after.ok ? repaired : line, fixed: after.ok, ok: after.ok, message: after.message };
}

/** Badge hiển thị kết quả xác thực parse dòng metadata theo delimiter/quote đang chọn. */
function MetadataValidationBadge({ line, csv }: { line: string; csv: CsvOptions }) {
  return <MetadataValidationBadgeInner line={line} csv={csv} />;
}

// ---- Log kiểm tra metadata ----
type MetadataCheckLogEntry = {
  at: string;
  variant: string;
  mode: "strict" | "excel";
  ok: boolean;
  fieldCount: number;
  delimiter: string;
  quoteChar: string;
  message: string;
  line: string;
};

const metadataCheckLog: MetadataCheckLogEntry[] = [];
const metadataLogListeners = new Set<() => void>();

function recordMetadataCheck(e: MetadataCheckLogEntry) {
  metadataCheckLog.push(e);
  if (metadataCheckLog.length > 200) metadataCheckLog.shift();
  metadataLogListeners.forEach((fn) => fn());
}

function useMetadataCheckLog() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    metadataLogListeners.add(fn);
    return () => { metadataLogListeners.delete(fn); };
  }, []);
  return metadataCheckLog;
}

function buildMetadataCheckLogText(entries: MetadataCheckLogEntry[]): string {
  const head = [
    "# UNIWORK — Log kiểm tra metadata CSV",
    `# generated_at=${new Date().toISOString()}`,
    `# total_checks=${entries.length}`,
    "",
    "timestamp\tvariant\tmode\tresult\tfields\tdelimiter\tquote\tmessage",
  ];
  const rows = entries.map((e) =>
    [
      e.at,
      e.variant,
      e.mode,
      e.ok ? "PASS" : "FAIL",
      String(e.fieldCount),
      e.delimiter === "\t" ? "\\t" : e.delimiter,
      e.quoteChar,
      e.message.replace(/\s+/g, " "),
    ].join("\t"),
  );
  const detail = entries.map((e, i) => `\n[${i + 1}] ${e.at} · ${e.variant} · ${e.mode}\n${e.line}`);
  return [...head, ...rows, "", "# Chi tiết dòng metadata đã kiểm tra", ...detail, ""].join("\n");
}

function buildMetadataCheckLogCsv(entries: MetadataCheckLogEntry[], csv: CsvOptions): string {
  const d = csv.delimiter;
  const q = csv.quoteChar;
  const header = ["timestamp", "variant", "mode", "result", "fields", "delimiter", "quote", "message", "line"];
  const rows = entries.map((e) => [
    e.at,
    e.variant,
    e.mode,
    e.ok ? "PASS" : "FAIL",
    String(e.fieldCount),
    e.delimiter === "\t" ? "\\t" : e.delimiter,
    e.quoteChar,
    e.message.replace(/\s+/g, " "),
    e.line,
  ]);
  const lines = [header, ...rows].map((row) => row.map((cell) => csvEscape(cell, d, q)).join(d));
  return lines.join("\n");
}

function normalizeErrorSignature(message: string) {
  return message
    .replace(/\d+/g, "N")
    .replace(/"([^"]{2,})"/g, '"..."')
    .replace(/'([^']{2,})'/g, "'...'")
    .trim();
}

function MetadataCheckLogPanel({ csv, onFailDetected }: { csv: CsvOptions; onFailDetected?: () => void }) {
  const entries = useMetadataCheckLog();
  const persisted = readMetadataLogFilters();
  // eslint-disable-next-line no-empty
  const [query, setQuery] = useState(persisted.query);
  const [resultFilter, setResultFilter] = useState<"all" | "pass" | "fail">(persisted.resultFilter);
  const [delimFilter, setDelimFilter] = useState<string>(persisted.delimFilter);
  const [quoteFilter, setQuoteFilter] = useState<string>(persisted.quoteFilter);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    writeMetadataLogFilters({ query, resultFilter, delimFilter, quoteFilter });
  }, [query, resultFilter, delimFilter, quoteFilter]);

  const exportRef = useRef<HTMLDivElement>(null);
  const lastFailAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const lastFail = useMemo(() => [...entries].reverse().find((e) => !e.ok) ?? null, [entries]);
  useEffect(() => {
    if (!lastFail) return;
    if (lastFail.at === lastFailAtRef.current) return;
    lastFailAtRef.current = lastFail.at;
    onFailDetected?.();
  }, [lastFail, onFailDetected]);


  const delimiters = useMemo(
    () => Array.from(new Set(entries.map((e) => (e.delimiter === "\t" ? "\\t" : e.delimiter)))),
    [entries],
  );
  const quotes = useMemo(() => Array.from(new Set(entries.map((e) => e.quoteChar))), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (resultFilter === "pass" && !e.ok) return false;
      if (resultFilter === "fail" && e.ok) return false;
      const delimLabel = e.delimiter === "\t" ? "\\t" : e.delimiter;
      if (delimFilter !== "all" && delimLabel !== delimFilter) return false;
      if (quoteFilter !== "all" && e.quoteChar !== quoteFilter) return false;
      if (!q) return true;
      const hay = [
        e.at,
        e.message,
        e.line,
        e.variant,
        e.mode,
        delimLabel,
        e.quoteChar,
        e.ok ? "pass" : "fail",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, resultFilter, delimFilter, quoteFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const fail = filtered.filter((e) => !e.ok).length;
    const pass = total - fail;
    const failRate = total > 0 ? Math.round((fail / total) * 100) : 0;
    return { total, fail, pass, failRate };
  }, [filtered]);

  const topErrors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filtered) {
      if (e.ok) continue;
      const sig = normalizeErrorSignature(e.message);
      counts.set(sig, (counts.get(sig) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [filtered]);

  const last = filtered[filtered.length - 1] ?? entries[entries.length - 1];

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded border border-border bg-surface-2 px-2 py-2 text-[11px] text-muted-foreground"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <Filter className="h-3 w-3" />
          Log kiểm tra: <span className="text-foreground">{entries.length}</span> lượt
          {filtered.length !== entries.length && (
            <span>
              {" "}
              · lọc <span className="text-foreground">{filtered.length}</span>
            </span>
          )}
          {last ? ` · gần nhất ${last.ok ? "PASS" : "FAIL"} (${last.fieldCount} trường)` : " · chưa có"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => {
              setQuery("");
              setResultFilter("all");
              setDelimFilter("all");
              setQuoteFilter("all");
            }}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-surface-1 hover:text-foreground disabled:opacity-50"
            title="Đặt lại bộ lọc"
          >
            <RefreshCw className="h-3 w-3" />
            Reset
          </button>
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-surface-1 hover:text-foreground disabled:opacity-50"
              title="Export chỉ các log đang được lọc"
            >
              <Download className="h-3 w-3" />
              Export
              <span className="rounded bg-surface-2 px-1 text-[10px] text-foreground">{filtered.length}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] rounded border border-border bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    const text = buildMetadataCheckLogText(filtered);
                    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                    triggerBlobDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), `metadata-check-log_${stamp}.log`);
                    toast.success(`Đã tải log kiểm tra metadata (${filtered.length} lượt đã lọc)`, { duration: 2500 });
                    setExportOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground hover:bg-surface-2"
                  title="Tải log đã lọc dạng .log"
                >
                  <Download className="h-3 w-3" />
                  Tải .log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = buildMetadataCheckLogCsv(filtered, csv);
                    const bom = csv.bom ? "\uFEFF" : "";
                    const blob = new Blob([bom + text], { type: "text/csv;charset=utf-8" });
                    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                    const ext = csv.delimiter === ";" ? "scsv" : "csv";
                    triggerBlobDownload(blob, `metadata-check-log_${stamp}.${ext}`);
                    toast.success(`Đã tải log kiểm tra metadata dạng CSV (${filtered.length} lượt đã lọc)`, { duration: 2500 });
                    setExportOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground hover:bg-surface-2"
                  title="Tải log đã lọc dạng CSV"
                >
                  <Download className="h-3 w-3" />
                  Tải CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const payload = {
                      exportedAt: new Date().toISOString(),
                      totalEntries: entries.length,
                      filteredEntries: filtered.length,
                      entries: filtered.map((e) => ({
                        at: e.at,
                        ok: e.ok,
                        result: e.ok ? "PASS" : "FAIL",
                        fieldCount: e.fieldCount,
                        variant: e.variant,
                        mode: e.mode,
                        delimiter: e.delimiter,
                        quoteChar: e.quoteChar,
                        message: e.message,
                        line: e.line,
                      })),
                    };
                    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                    triggerBlobDownload(
                      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
                      `metadata-check-log_${stamp}.json`,
                    );
                    toast.success(`Đã tải log kiểm tra metadata dạng JSON (${filtered.length} lượt đã lọc)`, { duration: 2500 });
                    setExportOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground hover:bg-surface-2"
                  title="Tải log đã lọc dạng JSON"
                >
                  <Download className="h-3 w-3" />
                  Tải JSON
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const text = buildMetadataCheckLogText(filtered);
                    try {
                      await navigator.clipboard.writeText(text);
                      toast.success(`Đã sao chép ${filtered.length} lượt log đã lọc vào clipboard`, { duration: 2500 });
                    } catch {
                      toast.error("Sao chép thất bại. Trình duyệt có thể chặn quyền clipboard.", { duration: 3000 });
                    }
                    setExportOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground hover:bg-surface-2"
                  title="Sao chép log đã lọc vào clipboard"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex items-center">
          <Search className="absolute left-1.5 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo nội dung, thời gian, mode..."
            className="h-6 w-40 rounded border border-border bg-surface-1 pl-5 pr-5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-56"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1 rounded p-0.5 hover:bg-surface-2"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {(["all", "pass", "fail"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setResultFilter(k)}
            className={
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 capitalize " +
              (resultFilter === k
                ? k === "pass"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : k === "fail"
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface-1 hover:text-foreground")
            }
          >
            {k === "all" ? "Tất cả" : k === "pass" ? "PASS" : "FAIL"}
            <span className="text-muted-foreground">
              (
              {k === "all"
                ? entries.length
                : entries.filter((e) => (k === "pass" ? e.ok : !e.ok)).length}
              )
            </span>
          </button>
        ))}
        <select
          value={delimFilter}
          onChange={(e) => setDelimFilter(e.target.value)}
          className="h-6 rounded border border-border bg-surface-1 px-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Delimiter: tất cả</option>
          {delimiters.map((d) => (
            <option key={d} value={d}>
              {`"${d}"`}
            </option>
          ))}
        </select>
        <select
          value={quoteFilter}
          onChange={(e) => setQuoteFilter(e.target.value)}
          className="h-6 rounded border border-border bg-surface-1 px-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Quote: tất cả</option>
          {quotes.map((q) => (
            <option key={q} value={q}>
              {`"${q}"`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded border border-border bg-surface-1 p-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Tổng kiểm tra</span>
          <span className="text-lg font-semibold leading-tight text-foreground">{summary.total}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">FAIL</span>
          <span className="text-lg font-semibold leading-tight text-red-400">
            {summary.fail} <span className="text-[10px] font-normal">({summary.failRate}%)</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">PASS</span>
          <span className="text-lg font-semibold leading-tight text-emerald-400">{summary.pass}</span>
        </div>
      </div>

      {topErrors.length > 0 && (
        <div className="rounded border border-border bg-surface-1 p-2">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">Top lỗi phổ biến</div>
          <ul className="flex flex-col gap-1">
            {topErrors.map(([sig, count], i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="line-clamp-1 text-foreground" title={sig}>
                  {i + 1}. {sig}
                </span>
                <span className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[10px] text-red-400">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-h-40 overflow-y-auto rounded border border-border bg-surface-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-muted-foreground">Không có log phù hợp.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.slice().reverse().map((e, i) => (
              <li key={i} className="flex items-start gap-2 px-2 py-1.5">
                <span
                  className={
                    "mt-0.5 inline-flex h-4 min-w-8 items-center justify-center rounded border px-1 text-[10px] font-medium " +
                    (e.ok ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400")
                  }
                >
                  {e.ok ? "PASS" : "FAIL"}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground">
                    {e.at} · {e.variant} · {e.mode} · {e.fieldCount} trường
                  </span>
                  <span className="line-clamp-1">{e.message}</span>
                  <span className="font-mono text-[10px] text-muted-foreground line-clamp-1">{e.line}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}




type ExcelField = { index: number; start: number; quoted: boolean; value: string; note?: string };

/**
 * Parse 1 dòng theo cách Excel diễn giải CSV (lenient):
 * - Field chỉ được coi là "quoted" khi bắt đầu bằng ký tự bao chuỗi.
 * - Trong field quoted, 2 ký tự bao chuỗi liên tiếp = 1 ký tự literal.
 * - Ký tự bao chuỗi ở giữa field không quoted được giữ nguyên (không lỗi).
 * - Quote chưa đóng: Excel lấy hết phần còn lại của dòng.
 */
function parseCsvLineExcel(line: string, delim: string, quote: string): ExcelField[] {
  const out: ExcelField[] = [];
  let i = 0;
  let idx = 0;
  while (i <= line.length) {
    const start = i;
    let value = "";
    let note: string | undefined;
    let quoted = false;
    if (line[i] === quote) {
      quoted = true;
      i++;
      let closed = false;
      while (i < line.length) {
        if (line[i] === quote) {
          if (line[i + 1] === quote) { value += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        value += line[i]; i++;
      }
      if (!closed) note = "Quote chưa đóng — Excel lấy hết phần còn lại của dòng";
      // phần thừa sau dấu đóng, trước delimiter
      let tail = "";
      while (i < line.length && line[i] !== delim) { tail += line[i]; i++; }
      if (tail) { value += tail; note = note ?? `Có ký tự thừa sau dấu đóng: "${tail}"`; }
    } else {
      while (i < line.length && line[i] !== delim) { value += line[i]; i++; }
      if (value.includes(quote)) note = "Có ký tự bao chuỗi trong field không quoted (Excel giữ nguyên)";
    }
    out.push({ index: idx++, start: start + 1, quoted, value, note });
    if (i >= line.length) break;
    i++; // bỏ delimiter
    if (i === line.length) { out.push({ index: idx++, start: i + 1, quoted: false, value: "" }); break; }
  }
  return out;
}

function ExcelParseCheck({ line, csv, variant = "metadata" }: { line: string; csv: CsvOptions; variant?: string }) {
  const [result, setResult] = useState<ExcelField[] | null>(null);
  const problems = result?.filter((f) => f.note) ?? [];
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => {
          const r = parseCsvLineExcel(line, csv.delimiter, csv.quoteChar);
          setResult(r);
          const bad = r.filter((f) => f.note).length;
          const at = new Date().toISOString();
          const strict = validateMetadataLine(line, csv);
          recordMetadataCheck({ at, variant, mode: "strict", ok: strict.ok, fieldCount: strict.fieldCount, delimiter: csv.delimiter, quoteChar: csv.quoteChar, message: strict.message, line });
          recordMetadataCheck({ at, variant, mode: "excel", ok: bad === 0, fieldCount: r.length, delimiter: csv.delimiter, quoteChar: csv.quoteChar, message: bad === 0 ? `Excel parse OK — ${r.length} cột` : `${bad} cảnh báo: ${r.filter((f) => f.note).map((f) => `#${f.index + 1} ${f.note}`).join("; ")}`, line });
          if (bad === 0) toast.success(`Excel parse OK — ${r.length} cột`, { duration: 2500 });
          else toast.warning(`Excel parse: ${r.length} cột, ${bad} cảnh báo`, { duration: 4000 });
        }}
        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        title="Parse dòng metadata theo cách Excel diễn giải, dùng delimiter/quote đang chọn"
      >
        <CheckCircle2 className="h-3 w-3" />
        Kiểm tra kiểu Excel
      </button>
      {result && (
        <div className="mt-1 rounded border border-border bg-surface-2 p-1.5">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Excel đọc thành <span className="text-foreground">{result.length}</span> cột
              {problems.length > 0 ? ` · ${problems.length} cảnh báo` : " · không cảnh báo"}
            </span>
            <button type="button" onClick={() => setResult(null)} className="rounded p-0.5 hover:text-foreground">
              <XCircle className="h-3 w-3" />
            </button>
          </div>
          <ul className="max-h-40 space-y-0.5 overflow-auto font-mono text-[11px]">
            {result.map((f) => (
              <li key={f.index} className="leading-snug">
                <span className="text-muted-foreground">
                  #{f.index + 1} · vị trí {f.start} · {f.quoted ? "quoted" : "plain"}
                </span>
                {": "}
                <span className="text-foreground">{f.value || "(rỗng)"}</span>
                {f.note && <div className="text-amber-400">⚠ {f.note}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetadataValidationBadgeInner({ line, csv }: { line: string; csv: CsvOptions }) {
  const v = validateMetadataLine(line, csv);
  if (!v.ok && csv.autoFixMetadata) {
    const r = resolveMetadataLine(line, csv);
    if (r.fixed) {
      return (
        <div
          className="mt-1 inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-400"
          title={`Sẽ tự động sửa khi export — ${r.message}`}
        >
          <CheckCircle2 className="h-3 w-3" />
          Sẽ tự động sửa khi export — {r.message}
        </div>
      );
    }
  }
  return (
    <div className="mt-1 space-y-1">
      <div
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
          v.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
        }`}
        title={v.message}
      >
        {v.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {v.message}
      </div>
      {!v.ok && v.issues.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-1.5 text-[11px] text-amber-300">
          {v.issues.slice(0, 6).map((iss, k) => (
            <li key={k} className="font-mono leading-snug">
              <span className="text-muted-foreground">
                {iss.index >= 0 ? `Trường #${iss.index + 1}` : "Dòng"} · vị trí ký tự {iss.position}
              </span>
              {": "}
              {iss.message}
              {iss.key && (
                <>
                  {" — key="}
                  <span className="text-foreground">{iss.key}</span>
                  {iss.value ? ` · value=${iss.value.slice(0, 40)}` : ""}
                </>
              )}
              {iss.raw && <div className="text-muted-foreground">…{iss.raw.slice(0, 60)}…</div>}
            </li>
          ))}
          {v.issues.length > 6 && <li className="text-muted-foreground">+{v.issues.length - 6} lỗi khác…</li>}
        </ul>
      )}
    </div>
  );
}

// ---- "CSV (tất cả kết quả)" — server export columns ----
type ExportPhase = "idle" | "fetching" | "compressing" | "saving" | "done" | "error";
type ExportProgress = {
  active: boolean;
  variant: "all" | "columns";
  phase: ExportPhase;
  label: string;
  percent: number;
  rows?: number;
};
const IDLE_EXPORT_PROGRESS: ExportProgress = {
  active: false,
  variant: "all",
  phase: "idle",
  label: "",
  percent: 0,
};

const TRACE_EXPORT_COLUMN_DEFS = [
  { key: "occurred_at",     label: "Thời gian" },
  { key: "kind",            label: "Loại" },
  { key: "event_type",      label: "Loại sự kiện" },
  { key: "tenant_id",       label: "Tenant" },
  { key: "actor_id",        label: "Actor" },
  { key: "meter_key",       label: "Meter" },
  { key: "allowed",         label: "Cho phép?" },
  { key: "reason",          label: "Lý do" },
  { key: "quota_limit",     label: "Quota (limit)" },
  { key: "current_usage",   label: "Đang dùng" },
  { key: "requested_delta", label: "Δ yêu cầu" },
  { key: "aggregate_type",  label: "Aggregate type" },
  { key: "aggregate_id",    label: "Aggregate ID" },
  { key: "status",          label: "Trạng thái" },
  { key: "attempt_count",   label: "Số lần thử" },
  { key: "last_error",      label: "Lỗi gần nhất" },
  { key: "processed_at",    label: "Xử lý lúc" },
  { key: "resource_type",   label: "Resource type" },
  { key: "resource_id",     label: "Resource ID" },
  { key: "payload",         label: "Payload" },
  { key: "correlation_id",  label: "Correlation ID" },
  { key: "id",              label: "ID" },
] as const;
type TraceExportKey = (typeof TRACE_EXPORT_COLUMN_DEFS)[number]["key"];
type TraceExportColumn = { key: TraceExportKey; label: string; enabled: boolean };
const DEFAULT_TRACE_EXPORT_COLUMNS: TraceExportColumn[] = TRACE_EXPORT_COLUMN_DEFS.map((c) => ({
  key: c.key, label: c.label, enabled: true,
}));
const TRACE_EXPORT_COLS_STORAGE_KEY = "uniwork.admin.trace.exportCols.v1";
function normalizeExportColumns(input: unknown): TraceExportColumn[] {
  const defByKey = new Map(TRACE_EXPORT_COLUMN_DEFS.map((d) => [d.key, d.label] as const));
  const seen = new Set<string>();
  const out: TraceExportColumn[] = [];
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== "object") continue;
      const k = (raw as { key?: unknown }).key;
      if (typeof k !== "string" || !defByKey.has(k as TraceExportKey) || seen.has(k)) continue;
      seen.add(k);
      const rawLabel = (raw as { label?: unknown }).label;
      const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim().slice(0, 120) : defByKey.get(k as TraceExportKey)!;
      const enabled = (raw as { enabled?: unknown }).enabled !== false;
      out.push({ key: k as TraceExportKey, label, enabled });
    }
  }
  for (const d of TRACE_EXPORT_COLUMN_DEFS) {
    if (!seen.has(d.key)) out.push({ key: d.key, label: d.label, enabled: true });
  }
  return out;
}

function sanitizeFilenamePart(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
function isoToStamp(iso: string | undefined, tz: FilenameTz = "utc"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = tz === "utc" ? d.getUTCFullYear() : d.getFullYear();
  const mo = tz === "utc" ? d.getUTCMonth() + 1 : d.getMonth() + 1;
  const da = tz === "utc" ? d.getUTCDate() : d.getDate();
  const h = tz === "utc" ? d.getUTCHours() : d.getHours();
  const mi = tz === "utc" ? d.getUTCMinutes() : d.getMinutes();
  return `${y}${pad(mo)}${pad(da)}-${pad(h)}${pad(mi)}${tz === "utc" ? "Z" : "L"}`;
}
function buildCsvFilename(opts: {
  correlationId: string;
  variant: "all" | "columns";
  keyword?: string;
  fromIso?: string;
  toIso?: string;
  filenameTz?: FilenameTz;
  sort?: "asc" | "desc";
  severities?: readonly Severity[];
  statuses?: readonly Status[];
  kinds?: readonly Kind[];
  template?: FilenamePart[];
}): string {
  const tz = opts.filenameTz ?? "utc";
  const encSet = (vals: readonly string[] | undefined, total: number, prefix: string) => {
    if (!vals || vals.length === 0 || vals.length === total) return null;
    return `${prefix}_${vals.map((v) => sanitizeFilenamePart(v)).join(".")}`;
  };
  const kw = opts.keyword?.trim();
  const from = isoToStamp(opts.fromIso, tz);
  const to = isoToStamp(opts.toIso, tz);
  const sev = encSet(opts.severities, ALL_SEVERITIES.length, "sev");
  const st = encSet(opts.statuses, ALL_STATUSES.length, "st");
  const kd = encSet(opts.kinds, ALL_KINDS.length, "kd");
  const values: Record<FilenamePartKey, string | null> = {
    prefix: "trace",
    correlationId: sanitizeFilenamePart(opts.correlationId) || "cid",
    variant: opts.variant === "all" ? "all-results" : "current-cols",
    keyword: kw ? `kw_${sanitizeFilenamePart(kw)}` : null,
    from: from ? `from_${from}` : null,
    to: to ? `to_${to}` : null,
    sort: opts.sort ? `sort_${opts.sort}` : null,
    severities: sev,
    statuses: st,
    kinds: kd,
    timestamp: String(Date.now()),
  };
  const template = normalizeFilenameTemplate(opts.template ?? DEFAULT_FILENAME_TEMPLATE);
  const parts: string[] = [];
  for (const p of template) {
    if (!p.enabled) continue;
    const v = values[p.key];
    if (v) parts.push(v);
  }
  if (parts.length === 0) parts.push("trace", String(Date.now()));
  return `${parts.join("-")}.csv`;
}

function csvEscape(v: unknown, delim: string = ",", quote: string = '"'): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  const needs = s.includes(quote) || s.includes(delim) || /[\r\n]/.test(s);
  if (!needs) return s;
  return `${quote}${s.split(quote).join(quote + quote)}${quote}`;
}

function timelineCellValue(item: TimelineItem, key: ColumnKey): string {
  if (key === "time") return item.at;
  if (key === "kind") return item.kind;
  const d = item.data as Record<string, unknown>;
  if (item.kind === "quota_check") {
    switch (key) {
      case "label": return String(d.meter_key ?? "");
      case "status": return d.allowed ? "PASS" : `FAIL:${String(d.reason ?? "")}`;
      case "meta": return `Δ+${d.requested_delta ?? 0} ${d.current_usage ?? 0}/${d.quota_limit ?? "∞"}`;
      case "tenant": return String(d.tenant_id ?? "");
      case "actor": return String(d.actor_id ?? "");
      default: return "";
    }
  }
  if (item.kind === "audit") {
    switch (key) {
      case "label": return String(d.event_type ?? d.action ?? "audit");
      case "status": return String(d.aggregate_type ?? "");
      case "tenant": return String(d.tenant_id ?? "");
      case "actor": return String(d.actor_user_id ?? "");
      case "target": return String(d.aggregate_id ?? d.resource_id ?? "");
      case "payload": return d.payload ? JSON.stringify(d.payload) : "";
      default: return "";
    }
  }
  // outbox
  switch (key) {
    case "label": return String(d.event_type ?? "");
    case "status": return String(d.status ?? "");
    case "meta": {
      const parts: string[] = [];
      if (typeof d.attempt_count === "number" && d.attempt_count > 0) parts.push(`attempts:${d.attempt_count}`);
      if (d.processed_at) parts.push(`processed:${d.processed_at}`);
      return parts.join(" ");
    }
    case "tenant": return String(d.tenant_id ?? "");
    case "target": return String(d.aggregate_id ?? "");
    case "payload": return String(d.last_error ?? "");
    default: return "";
  }
}

function buildTimelineCsv(items: TimelineItem[], columns: ColumnPrefs, order: ColumnKey[], opts: CsvOptions = DEFAULT_CSV_OPTIONS): string {
  const byKey = new Map(COLUMN_DEFS.map((c) => [c.key, c] as const));
  const active = order.map((k) => byKey.get(k)).filter((c): c is (typeof COLUMN_DEFS)[number] => !!c && columns[c.key]);
  if (active.length === 0) return "";
  const d = opts.delimiter;
  const q = opts.quoteChar;
  const header = active.map((c) => csvEscape(c.label, d, q)).join(d);
  const rows = items.map((it) => active.map((c) => csvEscape(timelineCellValue(it, c.key), d, q)).join(d));
  return [header, ...rows].join("\r\n");
}

const REFRESH_OPTIONS = [0, 5, 15, 30, 60, 120] as const;
type RefreshSec = (typeof REFRESH_OPTIONS)[number];
const REFRESH_STORAGE_KEY = "uniwork.admin.trace.autorefresh.v1";
const PRESETS_STORAGE_KEY = "uniwork.admin.trace.presets.v1";

type FilterPreset = {
  id: string;
  name: string;
  kinds?: string;
  from?: string;
  to?: string;
  sort?: "asc" | "desc";
  sev?: string;
  st?: string;
  kw?: string;
  tz?: FilenameTz;
};

// datetime-local value (YYYY-MM-DDTHH:mm) -> ISO string in UTC
function localToIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
function toToLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const searchSchema = z.object({
  cid: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  kinds: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const set = new Set(
        v.split(",").map((s) => s.trim()).filter((s): s is Kind => (ALL_KINDS as readonly string[]).includes(s)),
      );
      return set.size === 0 || set.size === ALL_KINDS.length ? undefined : (Array.from(set) as Kind[]);
    }),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  sort: z.enum(["asc", "desc"]).default("asc"),
  sev: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const set = new Set(
        v.split(",").map((s) => s.trim()).filter((s): s is Severity => (ALL_SEVERITIES as readonly string[]).includes(s)),
      );
      return set.size === 0 || set.size === ALL_SEVERITIES.length ? undefined : (Array.from(set) as Severity[]);
    }),
  st: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const set = new Set(
        v.split(",").map((s) => s.trim()).filter((s): s is Status => (ALL_STATUSES as readonly string[]).includes(s)),
      );
      return set.size === 0 || set.size === ALL_STATUSES.length ? undefined : (Array.from(set) as Status[]);
    }),
});

export const Route = createFileRoute("/_authenticated/admin/trace")({
  head: () => ({
    meta: [
      { title: "Trace theo correlation_id — UNIWORK" },
      { name: "description", content: "Truy vết request end-to-end qua quota_check_events, audit_events, outbox_events." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AdminTracePage,
});

type TraceResult = Awaited<ReturnType<typeof traceByCorrelationId>>;
type TimelineItem = TraceResult["timeline"][number];

function AdminTracePage() {
  const { cid, page, limit, kinds, from, to, sort, sev, st } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [input, setInput] = useState<string>(cid ?? "");
  const [fromInput, setFromInput] = useState<string>(from ?? "");
  const [toInput, setToInput] = useState<string>(to ?? "");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [keyword, setKeyword] = useState<string>("");
  const [csvOpts, setCsvOpts] = useState<CsvOptions>(() => {
    if (typeof window === "undefined") return DEFAULT_CSV_OPTIONS;
    try {
      const raw = window.localStorage.getItem(CSV_OPTIONS_STORAGE_KEY);
      if (!raw) return DEFAULT_CSV_OPTIONS;
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_CSV_OPTIONS, ...parsed } as CsvOptions;
      merged.filenameTemplate = normalizeFilenameTemplate((parsed as { filenameTemplate?: unknown })?.filenameTemplate);
      return merged;
    } catch {
      return DEFAULT_CSV_OPTIONS;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(CSV_OPTIONS_STORAGE_KEY, JSON.stringify(csvOpts)); } catch { /* noop */ }
  }, [csvOpts]);
  const [exportProgress, setExportProgress] = useState<ExportProgress>(IDLE_EXPORT_PROGRESS);
  const [lastExportStats, setLastExportStats] = useState<LastExportStats | null>(null);
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as FilterPreset[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch { /* noop */ }
  }, [presets]);
  const currentPage = page ?? 1;
  const currentLimit = limit ?? 500;
  const activeKinds: Kind[] = kinds ?? [...ALL_KINDS];
  const activeSeverities: Severity[] = sev ?? [...ALL_SEVERITIES];
  const activeStatuses: Status[] = st ?? [...ALL_STATUSES];
  const currentSort = sort ?? "asc";
  const fromIso = localToIso(from);
  const toIso = localToIso(to);

  type SearchState = z.infer<typeof searchSchema>;

  const traceMut = useMutation({
    mutationFn: (args: { correlationId: string; page: number; limit: number; kinds: Kind[]; fromTs?: string; toTs?: string; sort: "asc" | "desc" }) =>
      traceByCorrelationId({
        data: {
          correlationId: args.correlationId,
          page: args.page,
          limit: args.limit,
          kinds: args.kinds.length === ALL_KINDS.length ? undefined : (args.kinds as [Kind, ...Kind[]]),
          fromTs: args.fromTs,
          toTs: args.toTs,
          sort: args.sort,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.totals.total === 0) toast.info("Không tìm thấy event nào với correlation_id này.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Không truy vết được"),
  });

  const exportMut = useMutation({
    mutationFn: (args: { correlationId: string; keyword?: string; csv: CsvOptions; columns?: Array<{ key: TraceExportKey; label: string }> }) =>
      exportTraceCsv({
        data: {
          correlationId: args.correlationId,
          maxRows: 50_000,
          kinds:
            activeKinds.length === ALL_KINDS.length
              ? undefined
              : (activeKinds as [Kind, ...Kind[]]),
          fromTs: fromIso,
          toTs: toIso,
          sort: currentSort,
          keyword: args.keyword?.trim() || undefined,
          severities:
            activeSeverities.length === ALL_SEVERITIES.length
              ? undefined
              : (activeSeverities as [Severity, ...Severity[]]),
          statuses:
            activeStatuses.length === ALL_STATUSES.length
              ? undefined
              : (activeStatuses as [Status, ...Status[]]),
          delimiter: args.csv.delimiter,
          quoteChar: args.csv.quoteChar,
          columns: args.columns && args.columns.length > 0 ? args.columns : undefined,
        },
      }),
    onSuccess: (data, vars) => {
      const csvFilename = buildCsvFilename({
        correlationId: vars.correlationId,
        variant: "all",
        keyword: vars.keyword,
        fromIso,
        toIso,
        filenameTz: vars.csv.filenameTz,
        sort: currentSort,
        severities: activeSeverities,
        statuses: activeStatuses,
        kinds: activeKinds,
        template: vars.csv.filenameTemplate,
      });
      const metaLine = buildCsvMetadataLine(
        {
          correlationId: vars.correlationId,
          variant: "all",
          keyword: vars.keyword,
          fromIso,
          toIso,
          sort: currentSort,
          severities: activeSeverities,
          statuses: activeStatuses,
          kinds: activeKinds,
          rowCount: data.rowCount,
        },
        vars.csv,
      );
      const rawSize = (data.csv?.length ?? 0) + (vars.csv.includeMetadata && metaLine ? metaLine.length + 2 : 0);
      const { opts: effOpts, auto: autoZipped } = maybeAutoZipOpts(vars.csv, rawSize);
      if (autoZipped) {
        toast.info(`Tự động bật ZIP: CSV ~${formatBytes(rawSize)} vượt ${formatBytes(EXPORT_SIZE_WARN_BYTES)}.`);
      }
      const footerLine = buildCsvFooterLine(
        {
          variant: "all",
          totalRows: data.totalRows,
          exportedRows: data.rowCount,
          truncated: data.truncated,
          severityCounts: data.severityCounts ?? { info: 0, warn: 0, error: 0 },
          durationMs: data.processingMs ?? 0,
        },
        vars.csv,
      );
      setLastExportStats({
        variant: "all",
        rows: data.rowCount,
        processingMs: Math.max(0, Math.round(data.processingMs ?? 0)),
        at: Date.now(),
      });
      setExportProgress({
        active: true,
        variant: "all",
        phase: effOpts.zip ? "compressing" : "saving",
        label: effOpts.zip ? (autoZipped ? "Tự động nén .zip…" : "Đang nén .zip…") : "Đang tạo file…",
        percent: 75,
        rows: data.rowCount,
      });
      void downloadCsvOrZipWithFooter(data.csv, csvFilename, effOpts, metaLine, footerLine)
        .then(() => {
          setExportProgress({
            active: true,
            variant: "all",
            phase: "done",
            label: `Đã tải xuống ${data.rowCount.toLocaleString("vi-VN")} dòng`,
            percent: 100,
            rows: data.rowCount,
          });
          window.setTimeout(() => setExportProgress(IDLE_EXPORT_PROGRESS), 1500);
        })
        .catch((e: unknown) => {
          const msg = (e as Error)?.message ?? "unknown";
          setExportProgress({ active: true, variant: "all", phase: "error", label: `Lỗi tạo file: ${msg}`, percent: 100 });
          window.setTimeout(() => setExportProgress(IDLE_EXPORT_PROGRESS), 3000);
          toast.error(`Không tạo được file: ${msg}`);
        });
      if (data.truncated) {
        toast.warning(`Đã export ${data.rowCount.toLocaleString("vi-VN")} / ${data.totalRows.toLocaleString("vi-VN")} dòng (đã cắt).`);
      } else {
        toast.success(`Đã export ${data.rowCount.toLocaleString("vi-VN")} dòng.`);
      }
    },
    onMutate: (vars) => {
      setExportProgress({
        active: true,
        variant: "all",
        phase: "fetching",
        label: "Đang truy vấn dữ liệu từ máy chủ…",
        percent: 35,
      });
    },
    onError: (e: Error) => {
      setExportProgress({ active: true, variant: "all", phase: "error", label: e.message ?? "Không export được", percent: 100 });
      window.setTimeout(() => setExportProgress(IDLE_EXPORT_PROGRESS), 3000);
      toast.error(e.message ?? "Không export được");
    },
  });

  // Auto-run when arriving with ?cid= (or page/limit/sort change)
  useEffect(() => {
    if (cid && cid.trim()) {
      setInput(cid);
      traceMut.mutate({ correlationId: cid.trim(), page: currentPage, limit: currentLimit, kinds: activeKinds, fromTs: fromIso, toTs: toIso, sort: currentSort });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, currentPage, currentLimit, activeKinds.join(","), fromIso, toIso, currentSort]);

  const submit = () => {
    const v = input.trim();
    if (!v) {
      toast.error("Nhập correlation_id trước");
      return;
    }
    navigate({ search: (prev: SearchState) => ({ ...prev, cid: v, page: 1 }) });
  };

  const applyRange = () => {
    const f = fromInput.trim() || undefined;
    const t = toInput.trim() || undefined;
    if (f && t && localToIso(f)! > localToIso(t)!) {
      toast.error("Khoảng thời gian không hợp lệ: 'Từ' phải trước 'Đến'");
      return;
    }
    navigate({ search: (prev: SearchState) => ({ ...prev, from: f, to: t, page: 1 }) });
  };
  const clearRange = () => {
    setFromInput("");
    setToInput("");
    navigate({ search: (prev: SearchState) => ({ ...prev, from: undefined, to: undefined, page: 1 }) });
  };

  const setQuickRange = (minutes: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    const toStr = toToLocalDatetime(to);
    const fromStr = toToLocalDatetime(from);
    setFromInput(fromStr);
    setToInput(toStr);
    navigate({ search: (prev: SearchState) => ({ ...prev, from: fromStr, to: toStr, page: 1 }) });
  };

  const quickRangeOptions = [
    { label: "15 phút", minutes: 15 },
    { label: "1 giờ", minutes: 60 },
    { label: "24 giờ", minutes: 24 * 60 },
    { label: "7 ngày", minutes: 7 * 24 * 60 },
  ] as const;

  const goToPage = (nextPage: number) => {
    navigate({ search: (prev: SearchState) => ({ ...prev, page: nextPage }) });
  };
  const changeLimit = (nextLimit: number) => {
    navigate({ search: (prev: SearchState) => ({ ...prev, limit: nextLimit, page: 1 }) });
  };
  const toggleKind = (k: Kind) => {
    const set = new Set(activeKinds);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    if (set.size === 0) {
      toast.error("Phải chọn ít nhất một loại event");
      return;
    }
    const next: Kind[] = ALL_KINDS.filter((x) => set.has(x));
    const encoded = next.length === ALL_KINDS.length ? undefined : next;
    navigate({ search: (prev: SearchState) => ({ ...prev, kinds: encoded, page: 1 }) });
  };
  const resetKinds = () =>
    navigate({ search: (prev: SearchState) => ({ ...prev, kinds: undefined, page: 1 }) });

  const toggleSeverity = (s: Severity) => {
    const set = new Set(activeSeverities);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    if (set.size === 0) {
      toast.error("Phải chọn ít nhất một mức severity");
      return;
    }
    const next: Severity[] = ALL_SEVERITIES.filter((x) => set.has(x));
    const encoded = next.length === ALL_SEVERITIES.length ? undefined : next;
    navigate({ search: (prev: SearchState) => ({ ...prev, sev: encoded }) });
  };
  const resetSeverities = () =>
    navigate({ search: (prev: SearchState) => ({ ...prev, sev: undefined }) });

  const toggleStatus = (s: Status) => {
    const set = new Set(activeStatuses);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    if (set.size === 0) {
      toast.error("Phải chọn ít nhất một trạng thái");
      return;
    }
    const next: Status[] = ALL_STATUSES.filter((x) => set.has(x));
    const encoded = next.length === ALL_STATUSES.length ? undefined : next;
    navigate({ search: (prev: SearchState) => ({ ...prev, st: encoded }) });
  };
  const resetStatuses = () =>
    navigate({ search: (prev: SearchState) => ({ ...prev, st: undefined }) });

  const toggleSort = () => {
    const next = currentSort === "asc" ? "desc" : "asc";
    navigate({ search: (prev: SearchState) => ({ ...prev, sort: next, page: 1 }) });
  };

  const savePreset = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nhập tên preset");
      return;
    }
    const encodedKinds = activeKinds.length === ALL_KINDS.length ? undefined : activeKinds.join(",");
    const encodedSev = activeSeverities.length === ALL_SEVERITIES.length ? undefined : activeSeverities.join(",");
    const encodedSt = activeStatuses.length === ALL_STATUSES.length ? undefined : activeStatuses.join(",");
    const preset: FilterPreset = {
      id: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now()),
      name: trimmed,
      kinds: encodedKinds,
      from,
      to,
      sort: currentSort,
      sev: encodedSev,
      st: encodedSt,
      kw: keyword.trim() || undefined,
      tz: csvOpts.filenameTz,
    };
    setPresets((prev) => {
      const withoutDup = prev.filter((p) => p.name !== trimmed);
      return [preset, ...withoutDup].slice(0, 20);
    });
    toast.success(`Đã lưu preset "${trimmed}"`);
  };
  const applyPreset = (p: FilterPreset) => {
    setFromInput(p.from ?? "");
    setToInput(p.to ?? "");
    setKeyword(p.kw ?? "");
    if (p.tz) setCsvOpts((prev) => ({ ...prev, filenameTz: p.tz! }));
    navigate({
      search: (prev: SearchState) => ({
        ...prev,
        kinds: p.kinds ? searchSchema.shape.kinds.parse(p.kinds) : undefined,
        from: p.from,
        to: p.to,
        sort: p.sort ?? "asc",
        sev: p.sev ? searchSchema.shape.sev.parse(p.sev) : undefined,
        st: p.st ? searchSchema.shape.st.parse(p.st) : undefined,
        page: 1,
      }),
    });
    toast.success(`Đã áp dụng preset "${p.name}"`);
  };
  const deletePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const [autoRefreshSec, setAutoRefreshSec] = useState<RefreshSec>(() => {
    if (typeof window === "undefined") return 0;
    const raw = Number(window.localStorage.getItem(REFRESH_STORAGE_KEY));
    return (REFRESH_OPTIONS as readonly number[]).includes(raw) ? (raw as RefreshSec) : 0;
  });
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  useEffect(() => {
    try {
      window.localStorage.setItem(REFRESH_STORAGE_KEY, String(autoRefreshSec));
    } catch { /* noop */ }
  }, [autoRefreshSec]);
  useEffect(() => {
    if (traceMut.isSuccess) setLastRefreshedAt(Date.now());
  }, [traceMut.isSuccess, traceMut.data]);

  const refreshNow = () => {
    const v = (cid ?? input).trim();
    if (!v) return;
    traceMut.mutate({ correlationId: v, page: currentPage, limit: currentLimit, kinds: activeKinds, fromTs: fromIso, toTs: toIso, sort: currentSort });
  };

  useEffect(() => {
    if (!cid || autoRefreshSec === 0) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (traceMut.isPending) return;
      traceMut.mutate({ correlationId: cid.trim(), page: currentPage, limit: currentLimit, kinds: activeKinds, fromTs: fromIso, toTs: toIso, sort: currentSort });
    };
    const id = window.setInterval(tick, autoRefreshSec * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, autoRefreshSec, currentPage, currentLimit, activeKinds.join(","), fromIso, toIso, currentSort]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs">
        <Link
          to="/_authenticated/admin/quota"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Quota Observability
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Trace theo correlation_id</h1>
            <p className="text-xs text-muted-foreground">
              Truy vết end-to-end: quota_check_events, audit_events, outbox_events cùng correlation_id, xếp theo thời gian.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Ví dụ: 018f9c3a-8b2e-7a3f-b5e0-1c9f8e6b4a2d"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-primary/60"
            maxLength={200}
          />
          <button
            onClick={submit}
            disabled={traceMut.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Search className={`h-3.5 w-3.5 ${traceMut.isPending ? "animate-pulse" : ""}`} />
            {traceMut.isPending ? "Đang truy vết…" : "Truy vết"}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Từ</span>
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Đến</span>
            <input
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <button
            onClick={applyRange}
            disabled={traceMut.isPending}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground hover:border-primary/60 disabled:opacity-50"
          >
            Áp dụng
          </button>
          {(from || to) && (
            <button
              onClick={clearRange}
              disabled={traceMut.isPending}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Xóa khoảng
            </button>
          )}
          {(from || to) && (
            <span className="text-[11px] text-muted-foreground">
              Đang lọc: {from ?? "…"} → {to ?? "…"}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Chọn nhanh:</span>
          {quickRangeOptions.map((opt) => (
            <button
              key={opt.minutes}
              onClick={() => setQuickRange(opt.minutes)}
              disabled={traceMut.isPending}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 text-border">|</span>
          <PresetsMenu
            presets={presets}
            onSave={savePreset}
            onApply={applyPreset}
            onDelete={deletePreset}
          />
        </div>
      </section>

      {result ? (
        <TraceResultView
          result={result}
          onPage={goToPage}
          onLimit={changeLimit}
          pending={traceMut.isPending}
          onExport={(kw, csv, cols) => exportMut.mutate({ correlationId: result.correlationId, keyword: kw, csv, columns: cols })}
          exporting={exportMut.isPending}
          keyword={keyword}
          onKeywordChange={setKeyword}
          activeKinds={activeKinds}
          onToggleKind={toggleKind}
          onResetKinds={resetKinds}
          activeSeverities={activeSeverities}
          onToggleSeverity={toggleSeverity}
          onResetSeverities={resetSeverities}
          activeStatuses={activeStatuses}
          onToggleStatus={toggleStatus}
          onResetStatuses={resetStatuses}
          sort={currentSort}
          onToggleSort={toggleSort}
          autoRefreshSec={autoRefreshSec}
          onChangeAutoRefresh={setAutoRefreshSec}
          onRefreshNow={refreshNow}
          lastRefreshedAt={lastRefreshedAt}
          fromIso={fromIso}
          toIso={toIso}
          csvOpts={csvOpts}
          onChangeCsvOpts={setCsvOpts}
          exportProgress={exportProgress}
          setExportProgress={setExportProgress}
          lastExportStats={lastExportStats}
          setLastExportStats={setLastExportStats}
        />
      ) : traceMut.isPending ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Đang truy vết…
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center text-xs text-muted-foreground">
          Nhập correlation_id và bấm Truy vết để xem timeline.
        </div>
      )}
    </div>
  );
}

function EventDetailPanel({ item, onClose }: { item: TimelineItem | null; onClose: () => void }) {
  if (!item) return null;
  const t = new Date(item.at);
  const timeStr = `${t.toLocaleDateString("vi-VN")} ${t.toLocaleTimeString("vi-VN", { hour12: false })}`;
  const json = JSON.stringify(item.data, null, 2);
  const copyJson = () => { void navigator.clipboard?.writeText(json); };
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} aria-label="Đóng panel" />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-surface-1 shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <KindBadge kind={item.kind} />
              <span className="tabular-nums text-xs text-muted-foreground">{timeStr}</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">Chi tiết event</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyJson}
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2"
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2"
              aria-label="Đóng"
            >
              Đóng
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {json}
          </pre>
        </div>
      </aside>
    </div>
  );
}

const EXPORT_SIZE_WARN_BYTES = 5 * 1024 * 1024;
const AVG_BYTES_PER_CELL = 32;
const ZIP_COMPRESSION_RATIO = 0.25;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function estimateCsvBytes(rows: number, cols: number, includeMetadata: boolean): number {
  if (rows <= 0 || cols <= 0) return 0;
  const header = cols * 16 + 2;
  const perRow = cols * AVG_BYTES_PER_CELL + 2;
  const meta = includeMetadata ? 240 : 0;
  return header + meta + rows * perRow;
}

function maybeAutoZipOpts(opts: CsvOptions, rawBytes: number): { opts: CsvOptions; auto: boolean } {
  if (!opts.zip && rawBytes >= EXPORT_SIZE_WARN_BYTES) {
    return { opts: { ...opts, zip: true }, auto: true };
  }
  return { opts, auto: false };
}

function ExportSizeHint({
  label,
  rows,
  cols,
  zip,
  includeMetadata,
  onEnableZip,
  disabled,
}: {
  label: string;
  rows: number;
  cols: number;
  zip: boolean;
  includeMetadata: boolean;
  onEnableZip: () => void;
  disabled?: boolean;
}) {
  if (disabled || rows <= 0 || cols <= 0) return null;
  const raw = estimateCsvBytes(rows, cols, includeMetadata);
  const finalBytes = zip ? Math.max(1024, Math.round(raw * ZIP_COMPRESSION_RATIO)) : raw;
  const warn = raw >= EXPORT_SIZE_WARN_BYTES;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      <span>·</span>
      <span>{rows.toLocaleString("vi-VN")} dòng × {cols} cột</span>
      <span>·</span>
      <span>
        ước lượng{" "}
        <span className={warn ? "font-semibold text-amber-500" : "text-foreground"}>
          ~{formatBytes(raw)}
        </span>
        {zip && (
          <>
            {" "}→ ZIP ~<span className="text-foreground">{formatBytes(finalBytes)}</span>
          </>
        )}
      </span>
      {warn && !zip && (
        <>
          <span className="text-amber-500">
            · vượt {formatBytes(EXPORT_SIZE_WARN_BYTES)} — sẽ tự động nén ZIP
          </span>
          <button
            type="button"
            onClick={onEnableZip}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            title="Bật ZIP mặc định cho các lần export sau"
          >
            Bật mặc định
          </button>
        </>
      )}
      {warn && zip && (
        <span className="text-emerald-600">· ZIP đang bật</span>
      )}
    </div>
  );
}

function ExportProgressBar({ progress }: { progress: ExportProgress }) {
  if (!progress.active) return null;
  const variantLabel = progress.variant === "all" ? "CSV · tất cả kết quả" : "CSV · cột hiện tại";
  const isError = progress.phase === "error";
  const isDone = progress.phase === "done";
  const barTone = isError
    ? "bg-destructive"
    : isDone
    ? "bg-emerald-500"
    : "bg-primary";
  const indeterminate = !isDone && !isError && progress.percent < 100;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-1.5 border-b border-border bg-surface-2/40 px-4 py-2"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <div className="flex items-center gap-2 text-foreground">
          <Download className={`h-3 w-3 ${indeterminate ? "animate-pulse" : ""}`} />
          <span className="font-medium">{variantLabel}</span>
          <span className="text-muted-foreground">·</span>
          <span className={isError ? "text-destructive" : "text-muted-foreground"}>{progress.label}</span>
        </div>
        <span className="text-muted-foreground">
          {isError ? "Lỗi" : isDone ? "Hoàn tất" : `${Math.round(progress.percent)}%`}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full ${barTone} transition-[width] duration-300 ease-out`}
          style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
        />
      </div>
    </div>
  );
}

function TraceResultView({
  result,
  onPage,
  onLimit,
  pending,
  onExport,
  exporting,
  keyword,
  onKeywordChange,
  activeKinds,
  onToggleKind,
  onResetKinds,
  activeSeverities,
  onToggleSeverity,
  onResetSeverities,
  activeStatuses,
  onToggleStatus,
  onResetStatuses,
  sort,
  onToggleSort,
  autoRefreshSec,
  onChangeAutoRefresh,
  onRefreshNow,
  lastRefreshedAt,
  fromIso,
  toIso,
  csvOpts,
  onChangeCsvOpts,
  exportProgress,
  setExportProgress,
  lastExportStats,
  setLastExportStats,
}: {
  result: TraceResult;
  onPage: (p: number) => void;
  onLimit: (n: number) => void;
  pending: boolean;
  onExport: (keyword: string | undefined, csv: CsvOptions, columns?: Array<{ key: TraceExportKey; label: string }>) => void;
  exporting: boolean;
  keyword: string;
  onKeywordChange: (v: string) => void;
  activeKinds: Kind[];
  onToggleKind: (k: Kind) => void;
  onResetKinds: () => void;
  activeSeverities: Severity[];
  onToggleSeverity: (s: Severity) => void;
  onResetSeverities: () => void;
  activeStatuses: Status[];
  onToggleStatus: (s: Status) => void;
  onResetStatuses: () => void;
  sort: "asc" | "desc";
  onToggleSort: () => void;
  autoRefreshSec: RefreshSec;
  onChangeAutoRefresh: (v: RefreshSec) => void;
  onRefreshNow: () => void;
  lastRefreshedAt: number | null;
  fromIso?: string;
  toIso?: string;
  csvOpts: CsvOptions;
  onChangeCsvOpts: (v: CsvOptions) => void;
  exportProgress: ExportProgress;
  setExportProgress: (v: ExportProgress) => void;
  lastExportStats: LastExportStats | null;
  setLastExportStats: (v: LastExportStats) => void;
}) {
  const { correlationId, counts, totals, pagination, timeline } = result;
  const setKeyword = onKeywordChange;
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);
  const [columns, setColumns] = useState<ColumnPrefs>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_COLUMNS, ...parsed };
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch {
      /* noop */
    }
  }, [columns]);
  const toggleColumn = (k: ColumnKey) =>
    setColumns((prev) => ({ ...prev, [k]: !prev[k] }));
  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  };
  const activeColumnCount = Object.values(columns).filter(Boolean).length;
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMN_ORDER;
    try {
      const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      return normalizeColumnOrder(raw ? JSON.parse(raw) : null);
    } catch {
      return DEFAULT_COLUMN_ORDER;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      /* noop */
    }
  }, [columnOrder]);
  const moveColumn = (k: ColumnKey, dir: -1 | 1) =>
    setColumnOrder((prev) => {
      const i = prev.indexOf(k);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const [columnPresets, setColumnPresets] = useState<ColumnPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(COLUMN_PRESETS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p): p is ColumnPreset => !!p && typeof p.id === "string" && typeof p.name === "string")
        .map((p) => ({
          id: p.id,
          name: p.name,
          columns: { ...DEFAULT_COLUMNS, ...(p.columns ?? {}) },
          order: normalizeColumnOrder(p.order),
        }));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_PRESETS_STORAGE_KEY, JSON.stringify(columnPresets));
    } catch {
      /* noop */
    }
  }, [columnPresets]);
  const saveColumnPreset = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setColumnPresets((prev) => {
      const existing = prev.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      const preset: ColumnPreset = {
        id: existing?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p_${Date.now()}`),
        name: trimmed,
        columns: { ...columns },
        order: [...columnOrder],
      };
      const next = existing ? prev.map((p) => (p.id === existing.id ? preset : p)) : [...prev, preset];
      toast.success(existing ? `Đã cập nhật preset "${trimmed}"` : `Đã lưu preset "${trimmed}"`);
      return next;
    });
  };
  const applyColumnPreset = (id: string) => {
    const p = columnPresets.find((x) => x.id === id);
    if (!p) return;
    setColumns({ ...DEFAULT_COLUMNS, ...p.columns });
    setColumnOrder(normalizeColumnOrder(p.order));
    toast.success(`Đã áp dụng preset "${p.name}"`);
  };
  const deleteColumnPreset = (id: string) => {
    setColumnPresets((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) toast.success(`Đã xóa preset "${p.name}"`);
      return prev.filter((x) => x.id !== id);
    });
  };
  const [exportCols, setExportCols] = useState<TraceExportColumn[]>(() => {
    if (typeof window === "undefined") return DEFAULT_TRACE_EXPORT_COLUMNS;
    try {
      const raw = window.localStorage.getItem(TRACE_EXPORT_COLS_STORAGE_KEY);
      return raw ? normalizeExportColumns(JSON.parse(raw)) : DEFAULT_TRACE_EXPORT_COLUMNS;
    } catch {
      return DEFAULT_TRACE_EXPORT_COLUMNS;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(TRACE_EXPORT_COLS_STORAGE_KEY, JSON.stringify(exportCols)); } catch { /* noop */ }
  }, [exportCols]);
  const activeExportCols = useMemo(
    () => exportCols.filter((c) => c.enabled).map((c) => ({ key: c.key, label: c.label })),
    [exportCols],
  );
  const toggleExportCol = (k: TraceExportKey) =>
    setExportCols((prev) => prev.map((c) => (c.key === k ? { ...c, enabled: !c.enabled } : c)));
  const relabelExportCol = (k: TraceExportKey, label: string) =>
    setExportCols((prev) => prev.map((c) => (c.key === k ? { ...c, label } : c)));
  const moveExportCol = (i: number, dir: -1 | 1) =>
    setExportCols((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const resetExportCols = () => setExportCols(DEFAULT_TRACE_EXPORT_COLUMNS);
  const toggleAllExportCols = (on: boolean) =>
    setExportCols((prev) => prev.map((c) => ({ ...c, enabled: on })));
  const kw = keyword.trim().toLowerCase();
  const sevFiltered = activeSeverities.length < ALL_SEVERITIES.length;
  const activeSevSet = useMemo(() => new Set(activeSeverities), [activeSeverities]);
  const stFiltered = activeStatuses.length < ALL_STATUSES.length;
  const activeStSet = useMemo(() => new Set(activeStatuses), [activeStatuses]);
  const filteredTimeline = useMemo(() => {
    return timeline.filter((item) => {
      if (sevFiltered && !activeSevSet.has(severityOfItem(item))) return false;
      if (stFiltered && !activeStSet.has(statusOfItem(item))) return false;
      if (!kw) return true;
      try {
        return JSON.stringify(item).toLowerCase().includes(kw);
      } catch {
        return false;
      }
    });
  }, [timeline, kw, sevFiltered, activeSevSet, stFiltered, activeStSet]);
  const copyCid = () => {
    navigator.clipboard.writeText(correlationId).then(
      () => toast.success("Đã copy correlation_id"),
      () => toast.error("Copy thất bại"),
    );
  };
  const { page, pageCount, pageSize, offset } = pagination;
  const rangeStart = timeline.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + timeline.length;
  const filtered = activeKinds.length < ALL_KINDS.length;
  const KIND_META: Record<Kind, { label: string; className: string }> = {
    quota: { label: "Quota", className: "text-emerald-400 border-emerald-500/40" },
    audit: { label: "Audit", className: "text-sky-400 border-sky-500/40" },
    outbox: { label: "Outbox", className: "text-amber-400 border-amber-500/40" },
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard label="Tổng events" value={totals.total} icon={Activity} tint="text-foreground" hint={`hiện ${counts.total}`} />
        <CountCard label="Quota checks" value={totals.quota} icon={CheckCircle2} tint="text-emerald-400" hint={`hiện ${counts.quota}`} />
        <CountCard label="Audit" value={totals.audit} icon={ShieldCheck} tint="text-sky-400" hint={`hiện ${counts.audit}`} />
        <CountCard label="Outbox" value={totals.outbox} icon={Radio} tint="text-amber-400" hint={`hiện ${counts.outbox}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Lọc loại event:</span>
        {ALL_KINDS.map((k) => {
          const active = activeKinds.includes(k);
          return (
            <button
              key={k}
              onClick={() => onToggleKind(k)}
              disabled={pending}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
                active
                  ? `bg-surface-2 ${KIND_META[k].className}`
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              {KIND_META[k].label}
            </button>
          );
        })}
        {filtered && (
          <button
            onClick={onResetKinds}
            disabled={pending}
            className="ml-1 rounded-full border border-border bg-surface px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Tất cả
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Lọc severity:</span>
        {ALL_SEVERITIES.map((s) => {
          const active = activeSevSet.has(s);
          return (
            <button
              key={s}
              onClick={() => onToggleSeverity(s)}
              disabled={pending}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
                active
                  ? `bg-surface-2 ${SEVERITY_META[s].className}`
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              {SEVERITY_META[s].label}
            </button>
          );
        })}
        {sevFiltered && (
          <>
            <button
              onClick={onResetSeverities}
              disabled={pending}
              className="ml-1 rounded-full border border-border bg-surface px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Tất cả
            </button>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Khớp {filteredTimeline.length.toLocaleString("vi-VN")} / {timeline.length.toLocaleString("vi-VN")}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Lọc trạng thái:</span>
        {ALL_STATUSES.map((s) => {
          const active = activeStSet.has(s);
          return (
            <button
              key={s}
              onClick={() => onToggleStatus(s)}
              disabled={pending}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
                active
                  ? `bg-surface-2 ${STATUS_META[s].className}`
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              {STATUS_META[s].label}
            </button>
          );
        })}
        {stFiltered && (
          <button
            onClick={onResetStatuses}
            disabled={pending}
            className="ml-1 rounded-full border border-border bg-surface px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Tất cả
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">correlation_id</span>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-foreground">{correlationId}</code>
            <button
              onClick={copyCid}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleSort}
              disabled={pending || totals.total === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={sort === "asc" ? "Đang xếp tăng dần (cũ → mới)" : "Đang xếp giảm dần (mới → cũ)"}
            >
              {sort === "asc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {sort === "asc" ? "Cũ → mới" : "Mới → cũ"}
            </button>
            <button
              onClick={() => onExport(keyword, csvOpts, activeExportCols)}
              disabled={exporting || exportProgress.active || totals.total === 0 || activeExportCols.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={
                activeExportCols.length === 0
                  ? "Chưa chọn cột nào để export"
                  : keyword.trim()
                  ? `Export ${activeExportCols.length} cột, kèm keyword`
                  : `Export ${activeExportCols.length} cột`
              }
            >
              <Download className={`h-3 w-3 ${exporting || exportProgress.active ? "animate-pulse" : ""}`} />
              {exporting || (exportProgress.active && exportProgress.variant === "all")
                ? exportProgress.label || "Đang export…"
                : `CSV (tất cả kết quả) · ${activeExportCols.length}/${exportCols.length} cột`}
            </button>
            <TraceExportColumnsMenu
              cols={exportCols}
              onToggle={toggleExportCol}
              onRelabel={relabelExportCol}
              onMove={moveExportCol}
              onReset={resetExportCols}
              onToggleAll={toggleAllExportCols}
            />
            <button
              onClick={() => {
                const startedAt = performance.now();
                const csv = buildTimelineCsv(filteredTimeline, columns, columnOrder, csvOpts);
                if (!csv) { toast.error("Chưa bật cột nào để export"); return; }
                const csvFilename = buildCsvFilename({
                  correlationId,
                  variant: "columns",
                  keyword,
                  fromIso,
                  toIso,
                  filenameTz: csvOpts.filenameTz,
                  sort,
                  severities: activeSeverities,
                  statuses: activeStatuses,
                  kinds: activeKinds,
                  template: csvOpts.filenameTemplate,
                });
                const metaLine = buildCsvMetadataLine(
                  {
                    correlationId,
                    variant: "columns",
                    keyword,
                    fromIso,
                    toIso,
                    sort,
                    severities: activeSeverities,
                    statuses: activeStatuses,
                    kinds: activeKinds,
                    rowCount: filteredTimeline.length,
                  },
                  csvOpts,
                );
                const rows = filteredTimeline.length;
                const rawSize = csv.length + (csvOpts.includeMetadata && metaLine ? metaLine.length + 2 : 0);
                const { opts: effOpts, auto: autoZipped } = maybeAutoZipOpts(csvOpts, rawSize);
                if (autoZipped) {
                  toast.info(`Tự động bật ZIP: CSV ~${formatBytes(rawSize)} vượt ${formatBytes(EXPORT_SIZE_WARN_BYTES)}.`);
                }
                const severityCounts = { info: 0, warn: 0, error: 0 } as { info: number; warn: number; error: number };
                for (const it of filteredTimeline) {
                  severityCounts[severityOfItem(it)]++;
                }
                const footerLine = buildCsvFooterLine(
                  {
                    variant: "columns",
                    totalRows: rows,
                    severityCounts,
                    durationMs: performance.now() - startedAt,
                  },
                  csvOpts,
                );
                setLastExportStats({
                  variant: "columns",
                  rows,
                  processingMs: Math.max(0, Math.round(performance.now() - startedAt)),
                  at: Date.now(),
                });
                setExportProgress({
                  active: true,
                  variant: "columns",
                  phase: effOpts.zip ? "compressing" : "saving",
                  label: effOpts.zip ? (autoZipped ? "Tự động nén .zip…" : "Đang nén .zip…") : "Đang tạo file…",
                  percent: 70,
                  rows,
                });
                void downloadCsvOrZipWithFooter(csv, csvFilename, effOpts, metaLine, footerLine)
                  .then(() => {
                    setExportProgress({
                      active: true, variant: "columns", phase: "done",
                      label: `Đã tải xuống ${rows.toLocaleString("vi-VN")} dòng`,
                      percent: 100, rows,
                    });
                    window.setTimeout(() => setExportProgress(IDLE_EXPORT_PROGRESS), 1500);
                    toast.success(`Đã export ${rows.toLocaleString("vi-VN")} dòng theo cột hiện tại.`);
                  })
                  .catch((e: unknown) => {
                    const msg = (e as Error)?.message ?? "unknown";
                    setExportProgress({ active: true, variant: "columns", phase: "error", label: `Lỗi tạo file: ${msg}`, percent: 100 });
                    window.setTimeout(() => setExportProgress(IDLE_EXPORT_PROGRESS), 3000);
                    toast.error(`Không tạo được file: ${msg}`);
                  });
              }}
              disabled={filteredTimeline.length === 0 || activeColumnCount === 0 || exportProgress.active}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Export CSV chỉ gồm các cột đang bật trong timeline (đúng thứ tự và tiêu đề)"
            >
              <Download className="h-3 w-3" />
              CSV (cột hiện tại)
            </button>
            <CsvOptionsMenu
              value={csvOpts}
              onChange={onChangeCsvOpts}
              preview={{
                correlationId,
                keyword,
                fromIso,
                toIso,
                sort,
                severities: activeSeverities,
                statuses: activeStatuses,
                kinds: activeKinds,
                rowsAll: totals.total,
                rowsCols: filteredTimeline.length,
                lastExport: lastExportStats,
              }}
            />
            <AutoRefreshControl
              value={autoRefreshSec}
              onChange={onChangeAutoRefresh}
              onRefreshNow={onRefreshNow}
              pending={pending}
              lastRefreshedAt={lastRefreshedAt}
            />
            <ColumnsMenu
              columns={columns}
              order={columnOrder}
              onToggle={toggleColumn}
              onMove={moveColumn}
              onReset={resetColumns}
              activeCount={activeColumnCount}
              presets={columnPresets}
              onSavePreset={saveColumnPreset}
              onApplyPreset={applyColumnPreset}
              onDeletePreset={deleteColumnPreset}
            />
            <h2 className="text-sm font-semibold">Timeline</h2>
          </div>
        </div>
        <div className="flex flex-col gap-1 border-b border-border bg-surface-2/30 px-4 py-2">
          <ExportSizeHint
            label="CSV · tất cả kết quả"
            rows={totals.total}
            cols={activeExportCols.length}
            zip={csvOpts.zip}
            includeMetadata={csvOpts.includeMetadata}
            onEnableZip={() => onChangeCsvOpts({ ...csvOpts, zip: true })}
            disabled={totals.total === 0 || activeExportCols.length === 0}
          />
          <ExportSizeHint
            label="CSV · cột hiện tại"
            rows={filteredTimeline.length}
            cols={activeColumnCount}
            zip={csvOpts.zip}
            includeMetadata={csvOpts.includeMetadata}
            onEnableZip={() => onChangeCsvOpts({ ...csvOpts, zip: true })}
            disabled={filteredTimeline.length === 0 || activeColumnCount === 0}
          />
        </div>
        <ExportProgressBar progress={exportProgress} />
        <PaginationBar
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={totals.total}
          pending={pending}
          onPage={onPage}
          onLimit={onLimit}
        />
        <FrequencyChart items={filteredTimeline} />
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/20 px-4 py-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm keyword trong nội dung event (meter, actor, aggregate_id, payload…)"
              className="w-full rounded-md border border-border bg-surface px-7 py-1.5 text-xs outline-none focus:border-primary/60"
              maxLength={200}
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                aria-label="Xóa từ khóa"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {kw && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Khớp {filteredTimeline.length.toLocaleString("vi-VN")} / {timeline.length.toLocaleString("vi-VN")}
            </span>
          )}
        </div>
        {filteredTimeline.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {kw ? "Không có event khớp từ khóa." : "Không có event nào."}
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {filteredTimeline.map((item, idx) => (
              <TimelineRow
                key={`${item.kind}-${idx}`}
                item={item}
                columns={columns}
                onSelect={() => setSelected(item)}
                selected={selected === item}
              />
            ))}
          </ol>
        )}
        {timeline.length > 0 && (
          <PaginationBar
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={totals.total}
            pending={pending}
            onPage={onPage}
            onLimit={onLimit}
          />
        )}
      </section>
      <EventDetailPanel item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function FrequencyChart({ items }: { items: TimelineItem[] }) {
  const { data, bucketLabel } = useMemo(() => {
    if (items.length === 0) return { data: [] as Array<{ t: string; quota: number; audit: number; outbox: number }>, bucketLabel: "phút" };
    const times = items.map((i) => new Date(i.at).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const spanMs = Math.max(max - min, 1);
    // Choose bucket: <=2h -> minute, <=2d -> hour, else day
    const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
    const bucketMs = spanMs <= 2 * HOUR ? MIN : spanMs <= 2 * DAY ? HOUR : DAY;
    const label = bucketMs === MIN ? "phút" : bucketMs === HOUR ? "giờ" : "ngày";
    const map = new Map<number, { quota: number; audit: number; outbox: number }>();
    for (const it of items) {
      const ts = new Date(it.at).getTime();
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      const cur = map.get(bucket) ?? { quota: 0, audit: 0, outbox: 0 };
      if (it.kind === "quota_check") cur.quota += 1;
      else if (it.kind === "audit") cur.audit += 1;
      else cur.outbox += 1;
      map.set(bucket, cur);
    }
    // Fill gaps
    const firstBucket = Math.floor(min / bucketMs) * bucketMs;
    const lastBucket = Math.floor(max / bucketMs) * bucketMs;
    const rows: Array<{ t: string; ts: number; quota: number; audit: number; outbox: number }> = [];
    const maxBuckets = 200;
    const step = Math.max(bucketMs, Math.ceil((lastBucket - firstBucket) / maxBuckets / bucketMs) * bucketMs);
    for (let b = firstBucket; b <= lastBucket; b += step) {
      const agg = { quota: 0, audit: 0, outbox: 0 };
      for (let sb = b; sb < b + step; sb += bucketMs) {
        const v = map.get(sb);
        if (v) { agg.quota += v.quota; agg.audit += v.audit; agg.outbox += v.outbox; }
      }
      const d = new Date(b);
      const t = bucketMs === DAY
        ? d.toLocaleDateString("vi-VN")
        : d.toLocaleTimeString("vi-VN", { hour12: false, hour: "2-digit", minute: "2-digit" });
      rows.push({ t, ts: b, ...agg });
    }
    return { data: rows, bucketLabel: label };
  }, [items]);

  if (data.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface-2/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Tần suất events theo {bucketLabel} · {data.length} cột</span>
        <span className="tabular-nums">{items.length.toLocaleString("vi-VN")} events</span>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={32} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
            <Bar dataKey="quota" name="Quota" stackId="a" fill="hsl(142 71% 45%)" />
            <Bar dataKey="audit" name="Audit" stackId="a" fill="hsl(199 89% 55%)" />
            <Bar dataKey="outbox" name="Outbox" stackId="a" fill="hsl(38 92% 55%)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaginationBar({
  page,
  pageCount,
  pageSize,
  rangeStart,
  rangeEnd,
  total,
  pending,
  onPage,
  onLimit,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  pending: boolean;
  onPage: (p: number) => void;
  onLimit: (n: number) => void;
}) {
  const canPrev = page > 1 && !pending;
  const canNext = page < pageCount && !pending;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-4 py-2 text-[11px] text-muted-foreground">
      <div className="tabular-nums">
        {rangeStart}–{rangeEnd} / {total.toLocaleString("vi-VN")}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1">
          <span>Mỗi trang</span>
          <select
            value={pageSize}
            onChange={(e) => onLimit(Number(e.target.value))}
            disabled={pending}
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-foreground outline-none focus:border-primary/60 disabled:opacity-50"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)}
            disabled={!canPrev}
            className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-1 hover:text-foreground disabled:opacity-40"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="tabular-nums text-foreground">
            {page} / {pageCount}
          </span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={!canNext}
            className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-1 hover:text-foreground disabled:opacity-40"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ item, columns, onSelect, selected }: { item: TimelineItem; columns: ColumnPrefs; onSelect: () => void; selected: boolean }) {
  const t = new Date(item.at);
  const time = t.toLocaleTimeString("vi-VN", { hour12: false });
  const date = t.toLocaleDateString("vi-VN");
  const showTimeCol = columns.time || columns.kind;
  return (
    <li
      className={`flex cursor-pointer flex-col gap-2 p-4 text-xs transition-colors hover:bg-surface-2 sm:flex-row sm:items-start sm:gap-4 ${selected ? "bg-surface-2" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      {showTimeCol && (
        <div className="flex w-40 shrink-0 flex-col gap-0.5 text-muted-foreground">
          {columns.time && <span className="tabular-nums text-foreground">{time}</span>}
          {columns.time && <span>{date}</span>}
          {columns.kind && <KindBadge kind={item.kind} />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {item.kind === "quota_check" ? (
          <QuotaEventRow data={item.data as unknown as QuotaEvent} columns={columns} />
        ) : item.kind === "audit" ? (
          <AuditEventRow data={item.data as unknown as AuditEvent} columns={columns} />
        ) : (
          <OutboxEventRow data={item.data as unknown as OutboxEvent} columns={columns} />
        )}
      </div>
    </li>
  );
}

type QuotaEvent = {
  id: string;
  tenant_id: string;
  meter_key: string;
  quota_limit: number | null;
  current_usage: number;
  requested_delta: number;
  allowed: boolean;
  reason: string;
  actor_id: string | null;
};

function QuotaEventRow({ data, columns }: { data: QuotaEvent; columns: ColumnPrefs }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {columns.label && <span className="font-mono text-foreground">{data.meter_key}</span>}
        {columns.status && (data.allowed ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> PASS
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
            <XCircle className="h-3 w-3" /> {data.reason}
          </span>
        ))}
        {columns.meta && (
          <span className="tabular-nums text-muted-foreground">
            Δ +{data.requested_delta} · {data.current_usage}/{data.quota_limit ?? "∞"}
          </span>
        )}
      </div>
      {(columns.tenant || columns.actor) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          {columns.tenant && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
          {columns.actor && data.actor_id && <span>actor: {data.actor_id.slice(0, 8)}…</span>}
        </div>
      )}
    </div>
  );
}

type AuditEvent = {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  event_type: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: unknown;
};

function AuditEventRow({ data, columns }: { data: AuditEvent; columns: ColumnPrefs }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {columns.label && (
          <span className="font-mono text-foreground">
            {data.event_type ?? data.action ?? "audit"}
          </span>
        )}
        {columns.status && data.aggregate_type && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
            {data.aggregate_type}
          </span>
        )}
      </div>
      {(columns.tenant || columns.actor || columns.target) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          {columns.tenant && data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
          {columns.actor && data.actor_user_id && <span>actor: {data.actor_user_id.slice(0, 8)}…</span>}
          {columns.target && data.aggregate_id && <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>}
          {columns.target && data.resource_type && <span>res: {data.resource_type}</span>}
        </div>
      )}
      {columns.payload && data.payload && Object.keys(data.payload as object).length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(data.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

type OutboxEvent = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  processed_at: string | null;
};

function OutboxEventRow({ data, columns }: { data: OutboxEvent; columns: ColumnPrefs }) {
  const statusTint =
    data.status === "succeeded" || data.status === "processed" || data.processed_at
      ? "bg-emerald-500/10 text-emerald-400"
      : data.status === "failed"
      ? "bg-rose-500/10 text-rose-400"
      : data.status === "running"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-surface-2 text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {columns.label && <span className="font-mono text-foreground">{data.event_type}</span>}
        {columns.status && (
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${statusTint}`}>{data.status}</span>
        )}
        {columns.status && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
            {data.aggregate_type}
          </span>
        )}
        {columns.meta && data.attempt_count > 0 && (
          <span className="text-muted-foreground">attempts: {data.attempt_count}</span>
        )}
      </div>
      {(columns.tenant || columns.target || columns.meta) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          {columns.tenant && data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
          {columns.target && <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>}
          {columns.meta && data.processed_at && (
            <span>processed: {new Date(data.processed_at).toLocaleTimeString("vi-VN", { hour12: false })}</span>
          )}
        </div>
      )}
      {columns.payload && data.last_error && (
        <p className="mt-0.5 rounded bg-rose-500/5 p-1.5 text-[11px] text-rose-400">
          {data.last_error}
        </p>
      )}
    </div>
  );
}

type CsvPreviewContext = {
  correlationId: string;
  keyword?: string;
  fromIso?: string;
  toIso?: string;
  sort?: "asc" | "desc";
  severities?: readonly Severity[];
  statuses?: readonly Status[];
  kinds?: readonly Kind[];
  rowsAll?: number;
  rowsCols?: number;
  lastExport?: LastExportStats | null;
};
function CsvOptionsMenu({
  value,
  onChange,
  preview,
}: {
  value: CsvOptions;
  onChange: (v: CsvOptions) => void;
  preview?: CsvPreviewContext;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-csv-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const delimLabel = value.delimiter === "," ? "," : value.delimiter === ";" ? ";" : "Tab";
  return (
    <div className="relative" data-csv-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        title="Tùy chọn định dạng CSV (delimiter, quote, BOM)"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        CSV: {delimLabel} · {value.quoteChar === '"' ? "\"" : "'"} · {value.bom ? "BOM" : "no BOM"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Tùy chọn CSV</span>
            <button
              onClick={() => onChange(DEFAULT_CSV_OPTIONS)}
              className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-muted-foreground hover:text-foreground"
            >
              Đặt lại
            </button>
          </div>
          <div className="mb-3">
            <div className="mb-1 text-muted-foreground">Delimiter</div>
            <div className="flex gap-1">
              {([[",", "Phẩy ,"], [";", "Chấm phẩy ;"], ["\t", "Tab"]] as const).map(([d, label]) => (
                <button
                  key={d}
                  onClick={() => onChange({ ...value, delimiter: d })}
                  aria-pressed={value.delimiter === d}
                  className={`flex-1 rounded-md border px-2 py-1 ${value.delimiter === d ? "border-primary bg-surface-2 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <div className="mb-1 text-muted-foreground">Ký tự bao chuỗi</div>
            <div className="flex gap-1">
              {([['"', "\" (double)"], ["'", "' (single)"]] as const).map(([q, label]) => (
                <button
                  key={q}
                  onClick={() => onChange({ ...value, quoteChar: q })}
                  aria-pressed={value.quoteChar === q}
                  className={`flex-1 rounded-md border px-2 py-1 ${value.quoteChar === q ? "border-primary bg-surface-2 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={value.bom}
              onChange={(e) => onChange({ ...value, bom: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span className="text-foreground">Thêm BOM (UTF-8) để tương thích Excel</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={value.zip}
              onChange={(e) => onChange({ ...value, zip: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span className="text-foreground">Nén file thành .zip (khuyến nghị khi &gt;10k dòng)</span>
          </label>
          <label className={`mt-1 flex items-center gap-2 pl-6 ${value.zip ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={value.separateMetadata}
              disabled={!value.zip}
              onChange={(e) => onChange({ ...value, separateMetadata: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span className={value.zip ? "text-foreground" : "text-muted-foreground"}>
              Tách metadata &amp; footer ra file <code>.meta.txt</code> trong ZIP
            </span>
          </label>
          <p className="pl-6 text-[11px] text-muted-foreground">
            Khi bật, CSV giữ nguyên dữ liệu; metadata và footer được lưu ở file riêng cùng ZIP để dễ đối chiếu. Chỉ áp dụng khi bật ZIP.
          </p>
          <label className={`mt-1 flex items-center gap-2 pl-6 ${value.zip ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={value.metaJson}
              disabled={!value.zip}
              onChange={(e) => onChange({ ...value, metaJson: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            <span className={value.zip ? "text-foreground" : "text-muted-foreground"}>
              Kèm file <code>.meta.json</code> trong ZIP (máy đọc được)
            </span>
          </label>
          <p className="pl-6 text-[11px] text-muted-foreground">
            Xuất thêm <code>&lt;stem&gt;.meta.json</code> gồm metadata (keyword, from/to, sort, filter, timezone, rows) và summary (total_rows, severity, processing_ms) dạng JSON để đối chiếu hoặc import lại.
          </p>
          <div className="mt-3">
            <div className="mb-1 text-muted-foreground">Timezone trong tên file (from/to)</div>
            <div className="flex gap-1">
              {([["utc", `UTC (Z)`], ["local", `Local (${Intl.DateTimeFormat().resolvedOptions().timeZone})`]] as const).map(([tz, label]) => (
                <button
                  key={tz}
                  onClick={() => onChange({ ...value, filenameTz: tz })}
                  aria-pressed={value.filenameTz === tz}
                  className={`flex-1 rounded-md border px-2 py-1 ${value.filenameTz === tz ? "border-primary bg-surface-2 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Hậu tố Z = UTC, L = local time.</p>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.includeMetadata}
                onChange={(e) => onChange({ ...value, includeMetadata: e.target.checked })}
              />
              <span>Thêm dòng metadata đầu file</span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ghi 1 dòng comment (bắt đầu bằng <code># </code>) ghi rõ keyword, from/to, sort, severities, statuses, kinds, timezone và thời gian tạo file.
            </p>
            <label className={`mt-2 flex items-center gap-2 ${value.includeMetadata ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={value.autoFixMetadata}
                disabled={!value.includeMetadata}
                onChange={(e) => onChange({ ...value, autoFixMetadata: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className={value.includeMetadata ? "text-foreground" : "text-muted-foreground"}>
                Tự động sửa metadata để parse OK trước khi export
              </span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Khi dòng metadata không parse được bằng delimiter/quote đang chọn, hệ thống sẽ chuẩn hoá lại key=value và bao chuỗi đúng chuẩn trước khi ghi file.
            </p>
          </div>
          <div className="mt-3 space-y-1.5 border-t border-border pt-2">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Mẫu tên file</span>
              <button
                onClick={() => onChange({ ...value, filenameTemplate: DEFAULT_FILENAME_TEMPLATE.map((p) => ({ ...p })) })}
                className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-muted-foreground hover:text-foreground"
              >
                Đặt lại
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Kéo thứ tự bằng nút ▲▼, tick để bật/tắt từng trường. Các trường không có dữ liệu sẽ tự bỏ qua.
            </p>
            <ul className="space-y-1">
              {value.filenameTemplate.map((part, idx) => (
                <li key={part.key} className="flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-1">
                  <input
                    type="checkbox"
                    checked={part.enabled}
                    onChange={(e) => {
                      const next = value.filenameTemplate.map((p) => ({ ...p }));
                      next[idx].enabled = e.target.checked;
                      onChange({ ...value, filenameTemplate: next });
                    }}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    aria-label={`Bật/tắt ${FILENAME_PART_LABELS[part.key]}`}
                  />
                  <span className={`flex-1 text-[11px] ${part.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {idx + 1}. {FILENAME_PART_LABELS[part.key]}
                  </span>
                  <button
                    disabled={idx === 0}
                    onClick={() => {
                      if (idx === 0) return;
                      const next = value.filenameTemplate.map((p) => ({ ...p }));
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      onChange({ ...value, filenameTemplate: next });
                    }}
                    className="rounded px-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Di chuyển lên"
                  >
                    ▲
                  </button>
                  <button
                    disabled={idx === value.filenameTemplate.length - 1}
                    onClick={() => {
                      if (idx === value.filenameTemplate.length - 1) return;
                      const next = value.filenameTemplate.map((p) => ({ ...p }));
                      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                      onChange({ ...value, filenameTemplate: next });
                    }}
                    className="rounded px-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Di chuyển xuống"
                  >
                    ▼
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {preview && (() => {
            const nameAll = buildCsvFilename({
              correlationId: preview.correlationId,
              variant: "all",
              keyword: preview.keyword,
              fromIso: preview.fromIso,
              toIso: preview.toIso,
              filenameTz: value.filenameTz,
              sort: preview.sort,
              severities: preview.severities,
              statuses: preview.statuses,
              kinds: preview.kinds,
              template: value.filenameTemplate,
            });
            const nameCols = buildCsvFilename({
              correlationId: preview.correlationId,
              variant: "columns",
              keyword: preview.keyword,
              fromIso: preview.fromIso,
              toIso: preview.toIso,
              filenameTz: value.filenameTz,
              sort: preview.sort,
              severities: preview.severities,
              statuses: preview.statuses,
              kinds: preview.kinds,
              template: value.filenameTemplate,
            });
            const display = (n: string) => (value.zip ? toZipFilename(n) : n);
            const metaAll = value.includeMetadata
              ? buildCsvMetadataLine(
                  {
                    correlationId: preview.correlationId,
                    variant: "all",
                    keyword: preview.keyword,
                    fromIso: preview.fromIso,
                    toIso: preview.toIso,
                    sort: preview.sort,
                    severities: preview.severities,
                    statuses: preview.statuses,
                    kinds: preview.kinds,
                    rowCount: preview.rowsAll,
                  },
                  value,
                )
              : null;
            const metaCols = value.includeMetadata
              ? buildCsvMetadataLine(
                  {
                    correlationId: preview.correlationId,
                    variant: "columns",
                    keyword: preview.keyword,
                    fromIso: preview.fromIso,
                    toIso: preview.toIso,
                    sort: preview.sort,
                    severities: preview.severities,
                    statuses: preview.statuses,
                    kinds: preview.kinds,
                    rowCount: preview.rowsCols,
                  },
                  value,
                )
              : null;
            return (
              <div className="mt-3 space-y-1.5 border-t border-border pt-2">
                <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Tổng số rows (tất cả kết quả)</span>
                    <span className="font-mono text-foreground">{(preview.rowsAll ?? 0).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Rows theo cột hiện tại</span>
                    <span className="font-mono text-foreground">{(preview.rowsCols ?? 0).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>processing_ms (lần export gần nhất)</span>
                    <span className="font-mono text-foreground">
                      {preview.lastExport
                        ? `${preview.lastExport.processingMs.toLocaleString("vi-VN")} ms`
                        : "—"}
                    </span>
                  </div>
                  {preview.lastExport && (
                    <div className="mt-0.5 text-[10px]">
                      Lần trước: {preview.lastExport.variant === "all" ? "all-results" : "current-cols"} ·{" "}
                      {preview.lastExport.rows.toLocaleString("vi-VN")} dòng
                    </div>
                  )}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Xem trước tên file
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">CSV (tất cả kết quả)</div>
                  <code
                    className="mt-0.5 block break-all rounded bg-surface-2 px-1.5 py-1 font-mono text-[11px] text-foreground"
                    title={display(nameAll)}
                  >
                    {display(nameAll)}
                  </code>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">CSV (cột hiện tại)</div>
                  <code
                    className="mt-0.5 block break-all rounded bg-surface-2 px-1.5 py-1 font-mono text-[11px] text-foreground"
                    title={display(nameCols)}
                  >
                    {display(nameCols)}
                  </code>
                </div>
                {value.includeMetadata && (metaAll || metaCols) && (
                  <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span>Xem trước dòng metadata</span>
                      <button
                        type="button"
                        onClick={() => {
                          const text = [metaAll, metaCols].filter(Boolean).join("\n");
                          if (!text) return;
                          void navigator.clipboard?.writeText(text).then(() => {
                            toast.success("Đã sao chép toàn bộ dòng metadata", { duration: 2000 });
                          }).catch(() => {
                            toast.error("Không thể sao chép metadata");
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-[11px] normal-case tracking-normal text-foreground hover:bg-surface-3"
                        title="Sao chép toàn bộ dòng metadata đã chuẩn hóa"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    {metaAll && (
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Metadata (tất cả kết quả)</span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(metaAll).then(() => {
                                toast.success("Đã sao chép metadata (tất cả kết quả)", { duration: 2000 });
                              }).catch(() => {
                                toast.error("Không thể sao chép metadata");
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded p-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                            title="Sao chép dòng này"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <code
                          className="mt-0.5 block max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 px-1.5 py-1 font-mono text-[11px] text-foreground"
                          title={metaAll}
                        >
                          {metaAll}
                        </code>
                        <MetadataValidationBadge line={metaAll} csv={value} />
                        <ExcelParseCheck line={metaAll} csv={value} variant="all-results" />
                      </div>
                    )}
                    {metaCols && (
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Metadata (cột hiện tại)</span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(metaCols).then(() => {
                                toast.success("Đã sao chép metadata (cột hiện tại)", { duration: 2000 });
                              }).catch(() => {
                                toast.error("Không thể sao chép metadata");
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded p-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                            title="Sao chép dòng này"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <code
                          className="mt-0.5 block max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 px-1.5 py-1 font-mono text-[11px] text-foreground"
                          title={metaCols}
                        >
                          {metaCols}
                        </code>
                        <MetadataValidationBadge line={metaCols} csv={value} />
                        <ExcelParseCheck line={metaCols} csv={value} variant="current-cols" />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Dòng này sẽ được ghi ở đầu CSV (hoặc trong <code>.meta.txt</code> nếu bật tách metadata trong ZIP). <code>rows</code> được thêm khi export.
                    </p>
                    <MetadataCheckLogPanel csv={value} onFailDetected={() => setOpen(true)} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function TraceExportColumnsMenu({
  cols,
  onToggle,
  onRelabel,
  onMove,
  onReset,
  onToggleAll,
}: {
  cols: TraceExportColumn[];
  onToggle: (k: TraceExportKey) => void;
  onRelabel: (k: TraceExportKey, label: string) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onReset: () => void;
  onToggleAll: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-export-cols-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const activeCount = cols.filter((c) => c.enabled).length;
  return (
    <div className="relative" data-export-cols-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        title="Chọn/đổi thứ tự/đổi tiêu đề các cột khi bấm 'CSV (tất cả kết quả)'"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Columns3 className="h-3 w-3" />
        Cột export ({activeCount}/{cols.length})
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[420px] rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Cột cho "CSV (tất cả kết quả)"</span>
            <div className="flex items-center gap-1 normal-case tracking-normal">
              <button
                onClick={() => onToggleAll(true)}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
              >
                Tất cả
              </button>
              <button
                onClick={() => onToggleAll(false)}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
              >
                Bỏ chọn
              </button>
              <button
                onClick={onReset}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
              >
                Đặt lại
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-md border border-border">
            <ul className="divide-y divide-border">
              {cols.map((c, i) => (
                <li key={c.key} className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={() => onToggle(c.key)}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    aria-label={`Chọn cột ${c.key}`}
                  />
                  <code className="w-36 shrink-0 truncate font-mono text-[11px] text-muted-foreground" title={c.key}>
                    {c.key}
                  </code>
                  <input
                    value={c.label}
                    onChange={(e) => onRelabel(c.key, e.target.value)}
                    placeholder="Tiêu đề cột"
                    className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      className="rounded border border-border px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Lên"
                      title="Lên"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => onMove(i, 1)}
                      disabled={i === cols.length - 1}
                      className="rounded border border-border px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Xuống"
                      title="Xuống"
                    >
                      ▼
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Cấu hình được lưu tự động trên trình duyệt này.
          </p>
        </div>
      )}
    </div>
  );
}

function ColumnsMenu({
  columns,
  order,
  onToggle,
  onMove,
  onReset,
  activeCount,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: {
  columns: ColumnPrefs;
  order: ColumnKey[];
  onToggle: (k: ColumnKey) => void;
  onMove: (k: ColumnKey, dir: -1 | 1) => void;
  onReset: () => void;
  activeCount: number;
  presets: ColumnPreset[];
  onSavePreset: (name: string) => void;
  onApplyPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-columns-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const [newName, setNewName] = useState("");
  const byKey = useMemo(() => new Map(COLUMN_DEFS.map((c) => [c.key, c] as const)), []);
  return (
    <div className="relative" data-columns-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        title="Bật/tắt, sắp xếp cột và quản lý preset"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Columns3 className="h-3 w-3" />
        Cột ({activeCount}/{COLUMN_DEFS.length})
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Cột hiển thị & thứ tự</span>
            <button
              onClick={onReset}
              className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-muted-foreground hover:text-foreground"
            >
              Đặt lại
            </button>
          </div>
          <ul className="flex flex-col">
            {order.map((key, idx) => {
              const c = byKey.get(key);
              if (!c) return null;
              return (
                <li key={key} className="flex items-center gap-1 rounded hover:bg-surface-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={columns[key]}
                      onChange={() => onToggle(key)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    <span>{c.label}</span>
                  </label>
                  <button
                    onClick={() => onMove(key, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Lên"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onMove(key, 1)}
                    disabled={idx === order.length - 1}
                    className="mr-1 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Xuống"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Preset</span>
              <span className="normal-case tracking-normal">{presets.length} đã lưu</span>
            </div>
            {presets.length > 0 && (
              <ul className="mb-2 flex max-h-40 flex-col overflow-auto">
                {presets.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-2">
                    <button
                      onClick={() => onApplyPreset(p.id)}
                      className="flex flex-1 items-center gap-2 truncate rounded px-1.5 py-1 text-left text-xs text-foreground"
                      title={`Áp dụng preset "${p.name}"`}
                    >
                      <Bookmark className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {Object.values(p.columns).filter(Boolean).length}/{COLUMN_DEFS.length}
                      </span>
                    </button>
                    <button
                      onClick={() => onDeletePreset(p.id)}
                      className="rounded p-1 text-muted-foreground hover:text-red-400"
                      title="Xóa preset"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                onSavePreset(newName);
                setNewName("");
              }}
              className="flex items-center gap-1"
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên preset (vd: Chỉ Quota)"
                className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
                maxLength={64}
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Lưu cấu hình cột hiện tại thành preset"
              >
                <Save className="h-3 w-3" />
                Lưu
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoRefreshControl({
  value,
  onChange,
// (kept above)
  onRefreshNow,
  pending,
  lastRefreshedAt,
}: {
  value: RefreshSec;
  onChange: (v: RefreshSec) => void;
  onRefreshNow: () => void;
  pending: boolean;
  lastRefreshedAt: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const secsAgo = lastRefreshedAt ? Math.max(0, Math.floor((now - lastRefreshedAt) / 1000)) : null;
  const label = (v: RefreshSec) => (v === 0 ? "Tắt" : v < 60 ? `${v}s` : `${v / 60}m`);
  const active = value > 0;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${active ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-surface-2 text-muted-foreground"}`}
      title={active ? `Tự động làm mới mỗi ${label(value)}` : "Tự động làm mới đang tắt"}
    >
      <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">Tự động</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as RefreshSec)}
        className="rounded bg-transparent px-0.5 py-0 text-xs outline-none focus:ring-0"
        aria-label="Chu kỳ tự động làm mới timeline"
      >
        {REFRESH_OPTIONS.map((v) => (
          <option key={v} value={v} className="bg-surface text-foreground">
            {label(v)}
          </option>
        ))}
      </select>
      <button
        onClick={onRefreshNow}
        disabled={pending}
        className="ml-0.5 rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
        title="Làm mới ngay"
        aria-label="Làm mới ngay"
      >
        ↻
      </button>
      {secsAgo !== null && (
        <span className="hidden md:inline text-[10px] tabular-nums text-muted-foreground">
          · {secsAgo < 60 ? `${secsAgo}s trước` : `${Math.floor(secsAgo / 60)}m trước`}
        </span>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: TimelineItem["kind"] }) {
  const map: Record<TimelineItem["kind"], { label: string; className: string }> = {
    quota_check: { label: "quota", className: "bg-emerald-500/10 text-emerald-400" },
    audit: { label: "audit", className: "bg-sky-500/10 text-sky-400" },
    outbox: { label: "outbox", className: "bg-amber-500/10 text-amber-400" },
  };
  const m = map[kind];
  return (
    <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 font-mono text-[10px] ${m.className}`}>
      {m.label}
    </span>
  );
}

function CountCard({
  label,
  value,
  icon: Icon,
  tint,
  hint,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tint: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tint}`}>{value.toLocaleString("vi-VN")}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
function PresetsMenu({
  presets,
  onSave,
  onApply,
  onDelete,
}: {
  presets: FilterPreset[];
  onSave: (name: string) => void;
  onApply: (p: FilterPreset) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-presets-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const handleSave = () => {
    onSave(name);
    setName("");
  };
  return (
    <div className="relative" data-presets-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/60 hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Lưu và tải nhanh preset bộ lọc"
      >
        <Bookmark className="h-3 w-3" />
        Preset ({presets.length})
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Lưu bộ lọc hiện tại
          </div>
          <div className="flex items-center gap-1 px-1 pb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Tên preset…"
              maxLength={60}
              className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary/60"
            />
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Lưu
            </button>
          </div>
          <div className="mb-1 border-t border-border px-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Đã lưu
          </div>
          {presets.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              Chưa có preset. Đặt bộ lọc mong muốn rồi bấm Lưu.
            </div>
          ) : (
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {presets.map((p) => {
                const bits: string[] = [];
                if (p.kinds) bits.push(p.kinds);
                if (p.sev) bits.push(`sev:${p.sev}`);
                if (p.st) bits.push(`st:${p.st}`);
                if (p.from || p.to) bits.push(`${p.from ?? "…"}→${p.to ?? "…"}`);
                if (p.sort) bits.push(p.sort);
                if (p.kw) bits.push(`"${p.kw}"`);
                return (
                  <li key={p.id} className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-surface-2">
                    <button
                      onClick={() => { onApply(p); setOpen(false); }}
                      className="flex flex-1 flex-col items-start text-left"
                    >
                      <span className="text-xs font-medium text-foreground">{p.name}</span>
                      {bits.length > 0 && (
                        <span className="text-[10px] text-muted-foreground line-clamp-1">{bits.join(" · ")}</span>
                      )}
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      aria-label={`Xóa preset ${p.name}`}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
