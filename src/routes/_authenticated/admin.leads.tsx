import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Search, X } from "lucide-react";
import { toast } from "sonner";
import { listDemoRequests, updateDemoRequestStatus } from "@/lib/api/demo-requests.functions";

export const Route = createFileRoute("/_authenticated/admin/leads")({
  head: () => ({
    meta: [
      { title: "Lead demo — UNIWORK" },
      { name: "description", content: "Xem, lọc và cập nhật trạng thái các yêu cầu đặt lịch demo." },
    ],
  }),
  component: AdminLeadsPage,
});

type Status = "new" | "contacted" | "qualified" | "won" | "lost";

const STATUSES: { key: Status; label: string; tint: string }[] = [
  { key: "new", label: "Mới", tint: "bg-primary/15 text-primary" },
  { key: "contacted", label: "Đã liên hệ", tint: "bg-amber-500/15 text-amber-300" },
  { key: "qualified", label: "Tiềm năng", tint: "bg-sky-500/15 text-sky-300" },
  { key: "won", label: "Thành công", tint: "bg-emerald-500/15 text-emerald-400" },
  { key: "lost", label: "Thất bại", tint: "bg-surface-2 text-muted-foreground" },
];

function AdminLeadsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["admin", "leads"],
    queryFn: () => listDemoRequests(),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; status: Status }) => updateDemoRequestStatus({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leads"] });
      toast.success("Đã cập nhật trạng thái lead");
    },
    onError: () => toast.error("Cập nhật thất bại"),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (!s) return true;
      return (
        l.name.toLowerCase().includes(s) ||
        l.email.toLowerCase().includes(s) ||
        (l.role ?? "").toLowerCase().includes(s)
      );
    });
  }, [leads, q, filter]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, email hoặc vai trò..."
            className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", ...STATUSES.map((s) => s.key)] as const).map((k) => {
            const label = k === "all" ? "Tất cả" : STATUSES.find((s) => s.key === k)?.label;
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k as Status | "all")}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length}/{leads.length} lead
        </span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Đang tải danh sách…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">Chưa có lead nào</div>
          <p className="text-xs text-muted-foreground">Thử đổi bộ lọc hoặc từ khóa tìm kiếm</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Người liên hệ</th>
                <th className="px-4 py-2 font-medium">Vai trò</th>
                <th className="px-4 py-2 font-medium">Nguồn</th>
                <th className="px-4 py-2 font-medium">Ngày gửi</th>
                <th className="px-4 py-2 font-medium text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.role || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.source}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          STATUSES.find((s) => s.key === l.status)?.tint ?? "bg-surface-2 text-muted-foreground"
                        }`}
                      >
                        {STATUSES.find((s) => s.key === l.status)?.label ?? l.status}
                      </span>
                      <select
                        value={l.status}
                        disabled={updateMut.isPending}
                        onChange={(e) =>
                          updateMut.mutate({ id: l.id, status: e.target.value as Status })
                        }
                        className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                        aria-label="Cập nhật trạng thái"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}