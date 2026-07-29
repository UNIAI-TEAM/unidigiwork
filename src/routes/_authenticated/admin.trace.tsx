import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Activity, ShieldCheck, Radio, CheckCircle2, XCircle, ArrowLeft, Copy, ChevronLeft, ChevronRight, Download, X, ArrowUp, ArrowDown, Columns3, RefreshCw, Bookmark, Trash2, Save } from "lucide-react";
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
type CsvOptions = { delimiter: "," | ";" | "\t"; quoteChar: '"' | "'"; bom: boolean; filenameTz: FilenameTz; zip: boolean };
const DEFAULT_CSV_OPTIONS: CsvOptions = { delimiter: ",", quoteChar: '"', bom: true, filenameTz: "utc", zip: false };

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
async function downloadCsvOrZip(csvText: string, csvFilename: string, opts: CsvOptions): Promise<void> {
  const body = (opts.bom ? "\ufeff" : "") + csvText;
  if (opts.zip) {
    const { zipSync, strToU8 } = await import("fflate");
    const zipped = zipSync({ [csvFilename]: strToU8(body) }, { level: 6 });
    triggerBlobDownload(new Blob([zipped as BlobPart], { type: "application/zip" }), csvFilename.replace(/\.csv$/i, "") + ".zip");
  } else {
    triggerBlobDownload(new Blob([body], { type: "text/csv;charset=utf-8;" }), csvFilename);
  }
}

// ---- "CSV (tất cả kết quả)" — server export columns ----
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
}): string {
  const parts: string[] = ["trace", sanitizeFilenamePart(opts.correlationId) || "cid", opts.variant];
  const kw = opts.keyword?.trim();
  if (kw) parts.push(`kw_${sanitizeFilenamePart(kw)}`);
  const tz = opts.filenameTz ?? "utc";
  const from = isoToStamp(opts.fromIso, tz);
  const to = isoToStamp(opts.toIso, tz);
  if (from) parts.push(`from_${from}`);
  if (to) parts.push(`to_${to}`);
  if (opts.sort) parts.push(`sort_${opts.sort}`);
  const encSet = (vals: readonly string[] | undefined, total: number, prefix: string) => {
    if (!vals || vals.length === 0 || vals.length === total) return null;
    return `${prefix}_${vals.map((v) => sanitizeFilenamePart(v)).join(".")}`;
  };
  const sev = encSet(opts.severities, ALL_SEVERITIES.length, "sev");
  const st = encSet(opts.statuses, ALL_STATUSES.length, "st");
  const kd = encSet(opts.kinds, ALL_KINDS.length, "kd");
  if (sev) parts.push(sev);
  if (st) parts.push(st);
  if (kd) parts.push(kd);
  parts.push(String(Date.now()));
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

  type SearchState = { cid?: string; page?: number; limit?: number; kinds?: string; from?: string; to?: string; sort?: "asc" | "desc"; sev?: string; st?: string };

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
      });
      void downloadCsvOrZip(data.csv, csvFilename, vars.csv).catch((e: unknown) => {
        toast.error(`Không tạo được file: ${(e as Error)?.message ?? "unknown"}`);
      });
      if (data.truncated) {
        toast.warning(`Đã export ${data.rowCount.toLocaleString("vi-VN")} / ${data.totalRows.toLocaleString("vi-VN")} dòng (đã cắt).`);
      } else {
        toast.success(`Đã export ${data.rowCount.toLocaleString("vi-VN")} dòng.`);
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "Không export được"),
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
    const encoded = next.length === ALL_KINDS.length ? undefined : next.join(",");
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
    const encoded = next.length === ALL_SEVERITIES.length ? undefined : next.join(",");
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
    const encoded = next.length === ALL_STATUSES.length ? undefined : next.join(",");
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
    navigate({
      search: (prev: SearchState) => ({
        ...prev,
        kinds: p.kinds,
        from: p.from,
        to: p.to,
        sort: p.sort ?? "asc",
        sev: p.sev,
        st: p.st,
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
  const [csvOpts, setCsvOpts] = useState<CsvOptions>(() => {
    if (typeof window === "undefined") return DEFAULT_CSV_OPTIONS;
    try {
      const raw = window.localStorage.getItem(CSV_OPTIONS_STORAGE_KEY);
      if (!raw) return DEFAULT_CSV_OPTIONS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CSV_OPTIONS, ...parsed } as CsvOptions;
    } catch {
      return DEFAULT_CSV_OPTIONS;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(CSV_OPTIONS_STORAGE_KEY, JSON.stringify(csvOpts)); } catch { /* noop */ }
  }, [csvOpts]);
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
              disabled={exporting || totals.total === 0 || activeExportCols.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={
                activeExportCols.length === 0
                  ? "Chưa chọn cột nào để export"
                  : keyword.trim()
                  ? `Export ${activeExportCols.length} cột, kèm keyword`
                  : `Export ${activeExportCols.length} cột`
              }
            >
              <Download className={`h-3 w-3 ${exporting ? "animate-pulse" : ""}`} />
              {exporting ? "Đang export…" : `CSV (tất cả kết quả) · ${activeExportCols.length}/${exportCols.length} cột`}
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
                });
                void downloadCsvOrZip(csv, csvFilename, csvOpts)
                  .then(() => toast.success(`Đã export ${filteredTimeline.length.toLocaleString("vi-VN")} dòng theo cột hiện tại.`))
                  .catch((e: unknown) => toast.error(`Không tạo được file: ${(e as Error)?.message ?? "unknown"}`));
              }}
              disabled={filteredTimeline.length === 0 || activeColumnCount === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Export CSV chỉ gồm các cột đang bật trong timeline (đúng thứ tự và tiêu đề)"
            >
              <Download className="h-3 w-3" />
              CSV (cột hiện tại)
            </button>
            <CsvOptionsMenu value={csvOpts} onChange={setCsvOpts} />
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

function CsvOptionsMenu({ value, onChange }: { value: CsvOptions; onChange: (v: CsvOptions) => void }) {
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
