import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History, Loader2, RefreshCw } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listWorkspaces, listWorkspaceAuditEvents } from "@/lib/api/workspaces.functions";

export const Route = createFileRoute("/_authenticated/workspace/audit")({
  head: () => ({
    meta: [
      { title: "Nhật ký workspace · UNIWORK" },
      {
        name: "description",
        content: "Xem ai đã tạo, chỉnh sửa, lưu trữ workspace và các thay đổi theo thời gian.",
      },
      { property: "og:title", content: "Nhật ký workspace · UNIWORK" },
      {
        property: "og:description",
        content: "Dòng thời gian audit log cho mọi thao tác trên workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceAuditPage,
});

const EVENT_META: Record<string, { label: string; cls: string }> = {
  "workspace.created": { label: "Tạo mới", cls: "bg-emerald-500/10 text-emerald-600" },
  "workspace.updated": { label: "Cập nhật", cls: "bg-blue-500/10 text-blue-600" },
  "workspace.archived": { label: "Lưu trữ", cls: "bg-amber-500/10 text-amber-600" },
  "workspace.restored": { label: "Khôi phục", cls: "bg-violet-500/10 text-violet-600" },
};

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function fmtDateTime(v: string): string {
  return new Date(v).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkspaceAuditPage() {
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [eventType, setEventType] = useState<string>("");

  const workspacesQ = useQuery({ queryKey: ["workspaces", "list"], queryFn: () => listWorkspaces() });
  const workspaces = workspacesQ.data ?? [];

  const auditQ = useQuery({
    queryKey: ["workspace", "audit", workspaceId || "all"],
    queryFn: () =>
      listWorkspaceAuditEvents({ data: { workspaceId: workspaceId || null, limit: 100 } }),
  });

  const events = useMemo(
    () => (auditQ.data ?? []).filter((e) => !eventType || e.eventType === eventType),
    [auditQ.data, eventType],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <AppTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-none px-4 py-8 sm:px-6 lg:px-8">
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách workspace
          </Link>

          <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <History className="h-6 w-6 text-primary" /> Nhật ký workspace
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ai đã tạo, chỉnh sửa, lưu trữ workspace và thay đổi cụ thể theo thời gian.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void auditQ.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <RefreshCw className={`h-4 w-4 ${auditQ.isFetching ? "animate-spin" : ""}`} /> Làm mới
            </button>
          </header>

          <div className="mt-6 flex flex-wrap gap-3">
            <select
              className={inputCls}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              aria-label="Lọc theo workspace"
            >
              <option value="">Tất cả workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              aria-label="Lọc theo hành động"
            >
              <option value="">Tất cả hành động</option>
              {Object.entries(EVENT_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          {auditQ.isLoading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải nhật ký…
            </div>
          ) : events.length === 0 ? (
            <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Chưa có hoạt động nào được ghi nhận.
            </p>
          ) : (
            <ol className="mt-6 space-y-3">
              {events.map((e) => {
                const meta = EVENT_META[e.eventType] ?? {
                  label: e.eventType,
                  cls: "bg-muted text-muted-foreground",
                };
                return (
                  <li key={e.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-medium">{e.workspaceName}</span>
                      <span className="text-sm text-muted-foreground">bởi {e.actorName}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {fmtDateTime(e.occurredAt)}
                      </span>
                    </div>
                    {e.changes.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                        {e.changes.map((c) => (
                          <li key={c.field} className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">{c.field}:</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs line-through">
                              {c.before}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                              {c.after}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </main>
      </div>
    </div>
  );
}