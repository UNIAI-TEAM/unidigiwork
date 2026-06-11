import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  Save,
  Plus,
  Zap,
  GitBranch,
  CheckCircle2,
  Mail,
  Database,
  Sparkles,
  Settings,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";

export const Route = createFileRoute("/workflows/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Quy trình ${params.id} · UNIWORK` }],
  }),
  component: WorkflowDetailPage,
});

type NodeKind = "trigger" | "ai" | "branch" | "action" | "end";
type WFNode = {
  id: string;
  kind: NodeKind;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const nodes: WFNode[] = [
  { id: "n1", kind: "trigger", title: "Khi có tài liệu mới", sub: "Trigger · Documents", icon: Zap, color: "amber" },
  { id: "n2", kind: "ai", title: "Phân loại bằng AI", sub: "AI Copilot · Gemini", icon: Sparkles, color: "violet" },
  { id: "n3", kind: "branch", title: "Loại = Hợp đồng?", sub: "Điều kiện", icon: GitBranch, color: "sky" },
  { id: "n4", kind: "action", title: "Gửi email tới Pháp chế", sub: "Email Hub", icon: Mail, color: "emerald" },
  { id: "n5", kind: "action", title: "Lưu vào Knowledge Hub", sub: "Database", icon: Database, color: "emerald" },
  { id: "n6", kind: "end", title: "Hoàn tất", sub: "End", icon: CheckCircle2, color: "muted" },
];

const colorMap: Record<string, string> = {
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  violet: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  sky: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  muted: "bg-surface-2 text-muted-foreground border-border",
};

function WorkflowDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState<string | null>("n2");

  const sel = nodes.find((n) => n.id === selected);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="workflows" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div>
            <Link to="/workflows" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Tất cả quy trình
            </Link>
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="text-lg font-semibold">Tự động phân loại tài liệu</h1>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{id}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${running ? "bg-success/20 text-success" : "bg-surface-2 text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                {running ? "Đang chạy" : "Tạm dừng"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunning(!running)}
              className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3"
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? "Tạm dừng" : "Chạy"}
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Save className="h-4 w-4" /> Lưu
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,_theme(colors.border)_1px,_transparent_0)] [background-size:20px_20px]">
            <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-10">
              {nodes.map((n, i) => (
                <div key={n.id} className="flex flex-col items-center">
                  <button
                    onClick={() => setSelected(n.id)}
                    className={`w-72 rounded-xl border bg-surface p-3 text-left transition-all hover:shadow-lg ${selected === n.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colorMap[n.color]}`}>
                        <n.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{n.title}</div>
                        <div className="text-[11px] text-muted-foreground">{n.sub}</div>
                      </div>
                    </div>
                  </button>
                  {i < nodes.length - 1 && (
                    <div className="my-1 flex flex-col items-center text-muted-foreground">
                      <div className="h-4 w-px bg-border" />
                      <button className="rounded-full border border-dashed border-border bg-bg p-0.5 hover:border-primary hover:text-primary">
                        <Plus className="h-3 w-3" />
                      </button>
                      <div className="h-4 w-px bg-border" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside className="hidden w-80 shrink-0 border-l border-border bg-surface p-4 lg:block">
            {sel ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Cài đặt node</h2>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tên</label>
                  <input
                    defaultValue={sel.title}
                    className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mô tả</label>
                  <textarea
                    rows={3}
                    defaultValue="Sử dụng AI để phân loại tài liệu theo nội dung."
                    className="mt-1 w-full resize-none rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mô hình AI</label>
                  <select className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm focus:outline-none">
                    <option>Lovable AI · Gemini 2.5 Flash</option>
                    <option>Lovable AI · GPT-5</option>
                  </select>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Lần chạy gần nhất</div>
                  Thành công · 12 giây trước · 1.2s
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Chọn một node để xem cài đặt.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}