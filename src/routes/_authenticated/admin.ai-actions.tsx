import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, RefreshCw, Search, X, ExternalLink, Radio, ScrollText, Loader2 } from "lucide-react";
import {
  listAiActionAudit,
  getAiActionAuditDetail,
  type AiActionAuditRow,
} from "@/lib/api/ai-actions-audit.functions";

export const Route = createFileRoute("/_authenticated/admin/ai-actions")({
  head: () => ({
    meta: [
      { title: "Nhật ký AI Action — UNIWORK" },
      {
        name: "description",
        content: "Theo dõi các hành động AI đã được xác nhận và thực thi, kèm audit trail và sự kiện outbox.",
      },
      { property: "og:title", content: "Nhật ký AI Action — UNIWORK" },
      { property: "og:description", content: "Audit log và outbox cho hành động AI đã xác nhận." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAiActionsPage,
});

const PAGE_SIZE = 25;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SUCCEEDED: { label: "Đã thực thi", cls: "bg-emerald-500/10 text-emerald-600" },
  FAILED: { label: "Thất bại", cls: "bg-destructive/10 text-destructive" },
  EXECUTING: { label: "Đang chạy", cls: "bg-blue-500/10 text-blue-600" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-muted text-muted-foreground" },
  EXPIRED: { label: "Hết hạn", cls: "bg-amber-500/10 text-amber-600" },
};

const ACTION_LABEL: Record<string, string> = {
  CREATE_TASK: "Tạo công việc",
  UPDATE_TASK_FIELDS: "Cập nhật công việc",
  CREATE_MEETING: "Tạo cuộc họp",
  CREATE_EMAIL_DRAFT: "Tạo thư nháp",
};

const DELIVERY_CLS: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("vi-VN") : "—");

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>;
}

function AdminAiActionsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "SUCCEEDED" | "FAILED" | "EXECUTING" | "CANCELLED" | "EXPIRED">("all");
  const [actionType, setActionType] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AiActionAuditRow | null>(null);

  const params = useMemo(
    () => ({
      status,
      actionType: actionType || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [status, actionType, search, page],
  );

  const listQ = useQuery({
    queryKey: ["admin", "ai-actions", params],
    queryFn: () => listAiActionAudit({ data: params }),
  });

  const detailQ = useQuery({
    queryKey: ["admin", "ai-action-detail", selected?.id],
    queryFn: () => getAiActionAuditDetail({ data: { actionId: selected!.id } }),
    enabled: Boolean(selected?.id),
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const inputCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Bot className="h-5 w-5 text-primary" /> Nhật ký AI Action
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Các hành động UNI đề xuất đã được người dùng xác nhận và thực thi, kèm audit trail và sự kiện nền (outbox).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void listQ.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} /> Làm mới
        </button>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(0);
                setSearch(searchInput.trim());
              }
            }}
            placeholder="Tìm theo tiêu đề hành động…"
            aria-label="Tìm hành động AI"
            className={`${inputCls} w-72 pl-9 pr-9`}
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(0);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          className={inputCls}
          value={status}
          aria-label="Lọc theo trạng thái"
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value as typeof status);
          }}
        >
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(STATUS_META).map(([v, m]) => (
            <option key={v} value={v}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={actionType}
          aria-label="Lọc theo loại hành động"
          onChange={(e) => {
            setPage(0);
            setActionType(e.target.value);
          }}
        >
          <option value="">Tất cả loại hành động</option>
          {Object.entries(ACTION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải nhật ký…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Chưa có hành động AI nào được xác nhận.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Hành động</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Người xác nhận</th>
                <th className="px-4 py-3 font-medium">Xác nhận lúc</th>
                <th className="px-4 py-3 font-medium">Thực thi lúc</th>
                <th className="px-4 py-3 font-medium">Audit / Outbox</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title ?? ACTION_LABEL[r.actionType] ?? r.actionType}</div>
                    <div className="text-xs text-muted-foreground">
                      {ACTION_LABEL[r.actionType] ?? r.actionType}
                      {r.source ? ` · ${r.source}` : ""}
                      {r.risk ? ` · rủi ro ${r.risk}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                    {r.errorCode && <div className="mt-1 text-xs text-destructive">{r.errorCode}</div>}
                  </td>
                  <td className="px-4 py-3">{r.actorName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.confirmedAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.executedAt)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ScrollText className="h-3.5 w-3.5" /> {r.auditCount}
                      <Radio className="ml-2 h-3.5 w-3.5" /> {r.outboxCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">
                  {selected.title ?? ACTION_LABEL[selected.actionType] ?? selected.actionType}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={selected.status} />
                  <span>{selected.actorName}</span>
                  <span>· {fmt(selected.confirmedAt)}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selected.href && (
              <a
                href={selected.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Mở đối tượng đã tạo
              </a>
            )}

            {detailQ.isLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải chi tiết…
              </div>
            ) : (
              <>
                <section className="mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <ScrollText className="h-4 w-4 text-primary" /> Audit log
                  </h4>
                  {(detailQ.data?.auditEvents ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Chưa có bản ghi audit liên quan.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {detailQ.data!.auditEvents.map((a) => (
                        <li key={a.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{a.action}</span>
                            {a.resourceType && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.resourceType}</span>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground">{fmt(a.occurredAt)}</span>
                          </div>
                          {a.correlationId && (
                            <div className="mt-1 font-mono text-xs text-muted-foreground">{a.correlationId}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <Radio className="h-4 w-4 text-primary" /> Outbox &amp; gửi nền
                  </h4>
                  {(detailQ.data?.outboxEvents ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Không có sự kiện nền nào phát sinh.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {detailQ.data!.outboxEvents.map((o) => (
                        <li key={o.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{o.eventType}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{o.status}</span>
                            <span className="text-xs text-muted-foreground">lần thử {o.attemptCount}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{fmt(o.occurredAt)}</span>
                          </div>
                          {o.lastError && <div className="mt-1 text-xs text-destructive">{o.lastError}</div>}
                          {o.deliveries.length > 0 && (
                            <ul className="mt-2 space-y-1 border-t border-border pt-2">
                              {o.deliveries.map((d) => (
                                <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="rounded bg-muted px-1.5 py-0.5">{d.channel}</span>
                                  <span className="text-muted-foreground">{d.target ?? "—"}</span>
                                  <span
                                    className={`ml-auto rounded px-1.5 py-0.5 ${DELIVERY_CLS[d.status] ?? "bg-muted"}`}
                                  >
                                    {d.status}
                                    {d.httpStatus ? ` · ${d.httpStatus}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
