import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Activity, ShieldCheck, Radio, CheckCircle2, XCircle, ArrowLeft, Copy, ChevronLeft, ChevronRight, Download, X, ArrowUp, ArrowDown, Columns3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { traceByCorrelationId, exportTraceCsv } from "@/lib/api/admin.functions";

const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;
const ALL_KINDS = ["quota", "audit", "outbox"] as const;
type Kind = (typeof ALL_KINDS)[number];

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

// datetime-local value (YYYY-MM-DDTHH:mm) -> ISO string in UTC
function localToIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
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
  const { cid, page, limit, kinds, from, to, sort } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [input, setInput] = useState<string>(cid ?? "");
  const [fromInput, setFromInput] = useState<string>(from ?? "");
  const [toInput, setToInput] = useState<string>(to ?? "");
  const [result, setResult] = useState<TraceResult | null>(null);
  const currentPage = page ?? 1;
  const currentLimit = limit ?? 500;
  const activeKinds: Kind[] = kinds ?? [...ALL_KINDS];
  const currentSort = sort ?? "asc";
  const fromIso = localToIso(from);
  const toIso = localToIso(to);

  type SearchState = { cid?: string; page?: number; limit?: number; kinds?: string; from?: string; to?: string; sort?: "asc" | "desc" };

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
    mutationFn: (correlationId: string) =>
      exportTraceCsv({
        data: {
          correlationId,
          maxRows: 50_000,
          kinds:
            activeKinds.length === ALL_KINDS.length
              ? undefined
              : (activeKinds as [Kind, ...Kind[]]),
          fromTs: fromIso,
          toTs: toIso,
          sort: currentSort,
        },
      }),
    onSuccess: (data) => {
      const blob = new Blob(["\ufeff" + data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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

  const toggleSort = () => {
    const next = currentSort === "asc" ? "desc" : "asc";
    navigate({ search: (prev: SearchState) => ({ ...prev, sort: next, page: 1 }) });
  };

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
      </section>

      {result ? (
        <TraceResultView
          result={result}
          onPage={goToPage}
          onLimit={changeLimit}
          pending={traceMut.isPending}
          onExport={() => exportMut.mutate(result.correlationId)}
          exporting={exportMut.isPending}
          activeKinds={activeKinds}
          onToggleKind={toggleKind}
          onResetKinds={resetKinds}
          sort={currentSort}
          onToggleSort={toggleSort}
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

function TraceResultView({
  result,
  onPage,
  onLimit,
  pending,
  onExport,
  exporting,
  activeKinds,
  onToggleKind,
  onResetKinds,
  sort,
  onToggleSort,
}: {
  result: TraceResult;
  onPage: (p: number) => void;
  onLimit: (n: number) => void;
  pending: boolean;
  onExport: () => void;
  exporting: boolean;
  activeKinds: Kind[];
  onToggleKind: (k: Kind) => void;
  onResetKinds: () => void;
  sort: "asc" | "desc";
  onToggleSort: () => void;
}) {
  const { correlationId, counts, totals, pagination, timeline } = result;
  const [keyword, setKeyword] = useState("");
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
  const resetColumns = () => setColumns(DEFAULT_COLUMNS);
  const activeColumnCount = Object.values(columns).filter(Boolean).length;
  const kw = keyword.trim().toLowerCase();
  const filteredTimeline = useMemo(() => {
    if (!kw) return timeline;
    return timeline.filter((item) => {
      try {
        return JSON.stringify(item).toLowerCase().includes(kw);
      } catch {
        return false;
      }
    });
  }, [timeline, kw]);
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
              onClick={onExport}
              disabled={exporting || totals.total === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Export toàn bộ trace ra CSV"
            >
              <Download className={`h-3 w-3 ${exporting ? "animate-pulse" : ""}`} />
              {exporting ? "Đang export…" : "Export CSV"}
            </button>
            <ColumnsMenu columns={columns} onToggle={toggleColumn} onReset={resetColumns} activeCount={activeColumnCount} />
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
              <TimelineRow key={`${item.kind}-${idx}`} item={item} columns={columns} />
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

function TimelineRow({ item }: { item: TimelineItem }) {
  const t = new Date(item.at);
  const time = t.toLocaleTimeString("vi-VN", { hour12: false });
  const date = t.toLocaleDateString("vi-VN");

  return (
    <li className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-40 shrink-0 flex-col gap-0.5 text-muted-foreground">
        <span className="tabular-nums text-foreground">{time}</span>
        <span>{date}</span>
        <KindBadge kind={item.kind} />
      </div>
      <div className="flex-1 min-w-0">
        {item.kind === "quota_check" ? (
          <QuotaEventRow data={item.data as unknown as QuotaEvent} />
        ) : item.kind === "audit" ? (
          <AuditEventRow data={item.data as unknown as AuditEvent} />
        ) : (
          <OutboxEventRow data={item.data as unknown as OutboxEvent} />
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

function QuotaEventRow({ data }: { data: QuotaEvent }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">{data.meter_key}</span>
        {data.allowed ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> PASS
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
            <XCircle className="h-3 w-3" /> {data.reason}
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">
          Δ +{data.requested_delta} · {data.current_usage}/{data.quota_limit ?? "∞"}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        <span>tenant: {data.tenant_id.slice(0, 8)}…</span>
        {data.actor_id && <span>actor: {data.actor_id.slice(0, 8)}…</span>}
      </div>
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

function AuditEventRow({ data }: { data: AuditEvent }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">
          {data.event_type ?? data.action ?? "audit"}
        </span>
        {data.aggregate_type && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
            {data.aggregate_type}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
        {data.actor_user_id && <span>actor: {data.actor_user_id.slice(0, 8)}…</span>}
        {data.aggregate_id && <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>}
        {data.resource_type && <span>res: {data.resource_type}</span>}
      </div>
      {data.payload && Object.keys(data.payload as object).length > 0 ? (
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

function OutboxEventRow({ data }: { data: OutboxEvent }) {
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
        <span className="font-mono text-foreground">{data.event_type}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${statusTint}`}>{data.status}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
          {data.aggregate_type}
        </span>
        {data.attempt_count > 0 && (
          <span className="text-muted-foreground">attempts: {data.attempt_count}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
        <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>
        {data.processed_at && (
          <span>processed: {new Date(data.processed_at).toLocaleTimeString("vi-VN", { hour12: false })}</span>
        )}
      </div>
      {data.last_error && (
        <p className="mt-0.5 rounded bg-rose-500/5 p-1.5 text-[11px] text-rose-400">
          {data.last_error}
        </p>
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