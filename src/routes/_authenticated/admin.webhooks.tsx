import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Download, X, Copy, RefreshCw, Webhook } from "lucide-react";
import {
  listMeetingWebhookEvents,
  getMeetingWebhookEvent,
} from "@/lib/api/meeting-webhooks.functions";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({
    meta: [
      { title: "Audit webhook LiveKit — UNIWORK" },
      {
        name: "description",
        content: "Tra cứu từng event webhook LiveKit theo event.id, xem applied/duplicate và tải log debug.",
      },
      { property: "og:title", content: "Audit webhook LiveKit — UNIWORK" },
      {
        property: "og:description",
        content: "Tra cứu event webhook LiveKit, trạng thái applied/duplicate và tải log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminWebhooksPage,
});

const EVENT_TYPES = ["room_started", "participant_joined", "participant_left", "room_finished"];
const PAGE_SIZE = 25;

type EventRow = {
  id: string;
  event_id: string;
  event_type: string;
  meeting_id: string;
  room_sid: string | null;
  participant_identity: string | null;
  correlation_id: string | null;
  occurred_at: string | null;
  created_at: string;
  duplicate_count: number;
  last_duplicate_at: string | null;
  payload: unknown;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("vi-VN");
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminWebhooksPage() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState<"all" | "applied" | "duplicate">("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<EventRow | null>(null);

  const params = useMemo(
    () => ({
      search: search || undefined,
      eventType: eventType || undefined,
      status,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [search, eventType, status, page],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "webhooks", params],
    queryFn: () => listMeetingWebhookEvents({ data: params }),
    staleTime: 10_000,
  });

  const rows = (data?.rows ?? []) as EventRow[];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch() {
    setPage(0);
    setSearch(searchInput.trim());
  }

  async function lookupExact() {
    const id = searchInput.trim();
    if (!id) return;
    const row = (await getMeetingWebhookEvent({ data: { eventId: id } })) as EventRow | null;
    if (!row) {
      toast.error(`${t("adm.107")} “${id}” ${t("adm.108")}`);
      return;
    }
    setDetail(row);
  }

  function exportCsv() {
    const header = [
      "event_id",
      "event_type",
      "status",
      "duplicate_count",
      "meeting_id",
      "room_sid",
      "participant_identity",
      "correlation_id",
      "occurred_at",
      "created_at",
      "last_duplicate_at",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows
      .map((r) =>
        [
          r.event_id,
          r.event_type,
          r.duplicate_count > 0 ? "duplicate" : "applied",
          r.duplicate_count,
          r.meeting_id,
          r.room_sid,
          r.participant_identity,
          r.correlation_id,
          r.occurred_at,
          r.created_at,
          r.last_duplicate_at,
        ]
          .map(esc)
          .join(","),
      )
      .join("\n");
    download(
      `livekit-webhooks-${new Date().toISOString().slice(0, 19)}.csv`,
      `\uFEFF${header.join(",")}\n${body}`,
      "text/csv;charset=utf-8",
    );
    toast.success(t("adm.78"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-base font-semibold">{t("adm.109")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("adm.111")} <span className="font-mono">event.id</span>{t("adm.79")}
              {t("adm.80")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> {t("adm.110")}
          </button>
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {t("adm.81")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder={t("adm.82")}
            className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-8 text-sm outline-none focus:border-primary"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(0);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("adm.13")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={applySearch}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:bg-surface"
        >
          {t("adm.83")}
        </button>
        <button
          onClick={() => void lookupExact()}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:bg-surface"
        >
          {t("adm.84")}
        </button>
        <select
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-border bg-bg px-2 py-2 text-xs"
        >
          <option value="">{t("adm.85")}</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(0);
          }}
          className="rounded-lg border border-border bg-bg px-2 py-2 text-xs"
        >
          <option value="all">{t("adm.86")}</option>
          <option value="applied">{t("adm.87")}</option>
          <option value="duplicate">{t("adm.88")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">event.id</th>
              <th className="px-3 py-2 font-medium">{t("adm.73")}</th>
              <th className="px-3 py-2 font-medium">{t("adm.19")}</th>
              <th className="px-3 py-2 font-medium">{t("adm.89")}</th>
              <th className="px-3 py-2 font-medium">{t("adm.90")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  {t("adm.91")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  {t("adm.92")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono">{r.event_id}</td>
                  <td className="px-3 py-2">{r.event_type}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">applied</span>
                    {r.duplicate_count > 0 && (
                      <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                        duplicate ×{r.duplicate_count}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                    {r.room_sid ?? "—"} {r.participant_identity ? `· ${r.participant_identity}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setDetail(r)}
                      className="rounded-md border border-border px-2 py-1 hover:bg-surface"
                    >
                      {t("adm.93")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} event · trang {page + 1}/{pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
          >
            {t("adm.94")}
          </button>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ row, onClose }: { row: EventRow; onClose: () => void }) {
  const { t } = useI18n();
  const json = JSON.stringify(row, null, 2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t("adm.95")}</h3>
            <p className="font-mono text-xs text-muted-foreground">{row.event_id}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <Info label={t("adm.73")} value={row.event_type} />
          <Info
            label={t("adm.19")}
            value={row.duplicate_count > 0 ? `applied · duplicate ×${row.duplicate_count}` : "applied"}
          />
          <Info label="Meeting" value={row.meeting_id} />
          <Info label="Room SID" value={row.room_sid ?? "—"} />
          <Info label="Identity" value={row.participant_identity ?? "—"} />
          <Info label="Correlation" value={row.correlation_id ?? "—"} />
          <Info label={t("adm.96")} value={fmt(row.occurred_at)} />
          <Info label={t("adm.90")} value={fmt(row.created_at)} />
          <Info label={t("adm.97")} value={fmt(row.last_duplicate_at)} />
        </dl>

        <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed">
          {json}
        </pre>

        <div className="mt-3 flex justify-end gap-2 text-xs">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(json);
              toast.success(t("adm.98"));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2"
          >
            <Copy className="h-3.5 w-3.5" /> {t("adm.99")}
          </button>
          <button
            onClick={() => download(`event-${row.event_id}.json`, json, "application/json")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" /> {t("adm.100")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[11px]">{value}</dd>
    </div>
  );
}
