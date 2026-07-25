import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, FileText, Mail, ListFilter, Bell } from "lucide-react";
import { getAdminStats } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Tổng quan quản trị — UNIWORK" },
      { name: "description", content: "Số liệu tổng quan về người dùng, workspace và dữ liệu hệ thống." },
    ],
  }),
  component: AdminOverview,
});

const STATS = [
  { key: "users", label: "Người dùng", icon: Users, tint: "text-emerald-300" },
  { key: "workspaces", label: "Workspace", icon: Building2, tint: "text-sky-300" },
  { key: "documents", label: "Tài liệu", icon: FileText, tint: "text-violet-300" },
  { key: "email_threads", label: "Email threads", icon: Mail, tint: "text-amber-300" },
  { key: "rules", label: "Quy tắc", icon: ListFilter, tint: "text-primary" },
  { key: "notifications", label: "Thông báo", icon: Bell, tint: "text-rose-300" },
] as const;

function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getAdminStats(),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STATS.map((s) => (
        <div key={s.key} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${s.tint}`}>
              <s.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">
            {isLoading ? (
              <span className="inline-block h-8 w-16 animate-pulse rounded bg-surface-2" />
            ) : (
              (data?.[s.key] ?? 0).toLocaleString("vi-VN")
            )}
          </div>
        </div>
      ))}
    </div>
  );
}