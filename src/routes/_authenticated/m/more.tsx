import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  FileText,
  BookOpen,
  Users,
  Workflow,
  BarChart3,
  Sparkles,
  Bell,
  Settings,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MENU = [
  { icon: Calendar, label: "Lịch", to: "/calendar", color: "text-orange-400" },
  { icon: FileText, label: "Tài liệu", to: "/documents", color: "text-blue-400" },
  { icon: BookOpen, label: "Knowledge Base", to: "/knowledge", color: "text-emerald-400" },
  { icon: Users, label: "People", to: "/people", color: "text-violet-400" },
  { icon: Workflow, label: "Workflows", to: "/workflows", color: "text-amber-400" },
  { icon: BarChart3, label: "Reports", to: "/reports", color: "text-cyan-400" },
  { icon: Sparkles, label: "AI Assistant", to: "/ai", color: "text-primary" },
  { icon: Bell, label: "Thông báo", to: "/notifications", color: "text-rose-400" },
  { icon: Settings, label: "Cài đặt", to: "/settings", color: "text-muted-foreground" },
];

export const Route = createFileRoute("/_authenticated/m/more")({
  head: () => ({
    meta: [
      { title: "Thêm · UNIWORK" },
      { name: "description", content: "Truy cập nhanh các tính năng khác trên UNIWORK mobile." },
      { property: "og:title", content: "Thêm · UNIWORK" },
      { property: "og:description", content: "Truy cập nhanh các tính năng khác trên UNIWORK mobile." },
    ],
  }),
  component: MorePage,
});

function MorePage() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Thêm</h1>
      <ul className="grid gap-2">
        {MENU.map((item) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2", item.color)}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
