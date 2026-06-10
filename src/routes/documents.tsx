import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  FileText, FileSpreadsheet, FileImage, FileVideo, FileCode, File as FileIcon,
  Folder, FolderPlus, Upload, Plus, Search, Star, Clock, Users, Share2,
  MoreVertical, Grid3x3, List, ChevronRight, Download, Trash2, Filter,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Tài liệu · UNIWORK" },
      { name: "description", content: "Quản lý tập trung mọi tài liệu của tổ chức." },
    ],
  }),
  component: DocumentsPage,
});

type FileKind = "doc" | "sheet" | "image" | "video" | "code" | "pdf" | "folder";

const FOLDERS = [
  { name: "Tất cả tài liệu", count: 1284, active: true },
  { name: "Của tôi", count: 142 },
  { name: "Được chia sẻ", count: 86 },
  { name: "Yêu thích", count: 23 },
  { name: "Gần đây", count: 38 },
  { name: "Thùng rác", count: 11 },
];

const WORKSPACES = [
  { name: "STOS Project", color: "bg-emerald-500" },
  { name: "Y tế xã", color: "bg-amber-500" },
  { name: "Smart University", color: "bg-sky-500" },
  { name: "UNI-HRM", color: "bg-violet-500" },
  { name: "Marketing & PM", color: "bg-rose-500" },
];

const QUICK_FOLDERS = [
  { name: "Hợp đồng & Pháp lý", count: 48, color: "bg-violet-500/20 text-violet-300" },
  { name: "Báo cáo tài chính", count: 124, color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Tài liệu kỹ thuật", count: 312, color: "bg-sky-500/20 text-sky-300" },
  { name: "Marketing Assets", count: 86, color: "bg-amber-500/20 text-amber-300" },
];

const FILES: {
  name: string; kind: FileKind; size: string; owner: string; updated: string;
  shared: number; starred?: boolean; tag?: string;
}[] = [
  { name: "Sprint 6 - Biên bản họp.docx", kind: "doc", size: "324 KB", owner: "Nguyễn Văn A", updated: "10 phút trước", shared: 8, starred: true, tag: "Cuộc họp" },
  { name: "Báo cáo doanh thu Q2-2025.xlsx", kind: "sheet", size: "1.2 MB", owner: "Trần Thị B", updated: "1 giờ trước", shared: 4, tag: "Báo cáo" },
  { name: "Wireframe Mobile App.fig", kind: "image", size: "8.4 MB", owner: "Lê Minh C", updated: "Hôm nay", shared: 12, tag: "Thiết kế" },
  { name: "Demo onboarding khách hàng.mp4", kind: "video", size: "124 MB", owner: "Phạm D", updated: "Hôm qua", shared: 6, tag: "Marketing" },
  { name: "api-gateway-config.ts", kind: "code", size: "12 KB", owner: "Hoàng E", updated: "2 ngày trước", shared: 3, tag: "DevOps" },
  { name: "Hợp đồng STOS Platform.pdf", kind: "pdf", size: "2.1 MB", owner: "Nguyễn Văn A", updated: "3 ngày trước", shared: 2, starred: true, tag: "Pháp lý" },
  { name: "Kế hoạch marketing tháng 6.docx", kind: "doc", size: "458 KB", owner: "Phạm D", updated: "4 ngày trước", shared: 5, tag: "Marketing" },
  { name: "PRD - STOS Mobile App.pdf", kind: "pdf", size: "3.6 MB", owner: "Trần Thị B", updated: "Tuần trước", shared: 9, tag: "Sản phẩm" },
  { name: "User research findings.xlsx", kind: "sheet", size: "892 KB", owner: "Lê Minh C", updated: "Tuần trước", shared: 4, tag: "Nghiên cứu" },
  { name: "Logo & Brand assets.zip", kind: "image", size: "42 MB", owner: "Phạm D", updated: "16/05/2025", shared: 14, tag: "Thương hiệu" },
];

const RECENT = FILES.slice(0, 4);

function iconFor(kind: FileKind) {
  switch (kind) {
    case "doc": return { I: FileText, c: "bg-sky-500/20 text-sky-300" };
    case "sheet": return { I: FileSpreadsheet, c: "bg-emerald-500/20 text-emerald-300" };
    case "image": return { I: FileImage, c: "bg-violet-500/20 text-violet-300" };
    case "video": return { I: FileVideo, c: "bg-rose-500/20 text-rose-300" };
    case "code": return { I: FileCode, c: "bg-amber-500/20 text-amber-300" };
    case "pdf": return { I: FileText, c: "bg-orange-500/20 text-orange-300" };
    case "folder": return { I: Folder, c: "bg-primary/20 text-primary" };
    default: return { I: FileIcon, c: "bg-surface-2 text-muted-foreground" };
  }
}

function DocumentsPage() {
  const [open, setOpen] = useSidebarState();
  const [view, setView] = useState<"grid" | "list">("list");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("Tất cả tài liệu");

  const filtered = FILES.filter((f) =>
    [f.name, f.owner, f.tag ?? ""].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="documents" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} onNew={() => {}} />

        <div className="flex min-h-0 flex-1">
          {/* Left sub-sidebar */}
          <aside className="hidden w-[240px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
            <div className="border-b border-border p-4">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> Tài liệu mới
              </button>
              <div className="mt-2 flex gap-2">
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:border-primary/40">
                  <Upload className="h-3.5 w-3.5" /> Tải lên
                </button>
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:border-primary/40">
                  <FolderPlus className="h-3.5 w-3.5" /> Thư mục
                </button>
              </div>
            </div>

            <div className="px-2 py-3">
              {FOLDERS.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setFolder(f.name)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    folder === f.name
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{f.name}</span>
                  <span className="text-[11px]">{f.count}</span>
                </button>
              ))}
            </div>

            <div className="px-4 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspaces
            </div>
            <div className="px-2 pb-4">
              {WORKSPACES.map((w) => (
                <button key={w.name} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${w.color}`}>
                    {w.name[0]}
                  </span>
                  <span className="truncate">{w.name}</span>
                </button>
              ))}
            </div>

            <div className="mt-auto border-t border-border p-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Lưu trữ</span>
                <span className="font-medium">4.2 / 10 GB</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full w-[42%] rounded-full bg-primary" />
              </div>
              <button className="mt-2 w-full text-xs text-primary hover:underline">Nâng cấp lưu trữ</button>
            </div>
          </aside>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            {/* Header */}
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">Tài liệu</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Quản lý, chia sẻ và cộng tác trên mọi tài liệu của tổ chức.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 sm:flex">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Tìm tài liệu, người sở hữu, thẻ…"
                      className="w-64 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>
                  <button className="rounded-lg border border-border bg-surface p-2 text-muted-foreground hover:text-foreground">
                    <Filter className="h-4 w-4" />
                  </button>
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    <button onClick={() => setView("list")} className={`p-2 ${view === "list" ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground hover:text-foreground"}`}>
                      <List className="h-4 w-4" />
                    </button>
                    <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground hover:text-foreground"}`}>
                      <Grid3x3 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Quick folders */}
              <div className="mb-6">
                <h2 className="mb-3 text-sm font-semibold">Thư mục nhanh</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {QUICK_FOLDERS.map((f) => (
                    <button key={f.name} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:border-primary/40">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${f.color}`}>
                        <Folder className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground">{f.count} tệp</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent */}
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Truy cập gần đây</h2>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {RECENT.map((r) => {
                    const { I, c } = iconFor(r.kind);
                    return (
                      <div key={r.name} className="group rounded-xl border border-border bg-surface p-4 hover:border-primary/40">
                        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${c}`}>
                          <I className="h-5 w-5" />
                        </div>
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{r.size}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.updated}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* All files */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{folder} <span className="ml-2 text-xs font-normal text-muted-foreground">({filtered.length})</span></h2>
                </div>

                {view === "list" ? (
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="col-span-5">Tên</div>
                      <div className="col-span-2">Người sở hữu</div>
                      <div className="col-span-2">Cập nhật</div>
                      <div className="col-span-1">Kích thước</div>
                      <div className="col-span-1">Chia sẻ</div>
                      <div className="col-span-1 text-right">Hành động</div>
                    </div>
                    {filtered.map((f) => {
                      const { I, c } = iconFor(f.kind);
                      return (
                        <div key={f.name} className="grid grid-cols-12 items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-surface-2">
                          <div className="col-span-5 flex min-w-0 items-center gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c}`}>
                              <I className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{f.name}</span>
                                {f.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" />}
                              </div>
                              {f.tag && <div className="text-[11px] text-muted-foreground">{f.tag}</div>}
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <img src={avatar(f.owner)} alt="" className="h-6 w-6 rounded-full object-cover" />
                            <span className="truncate">{f.owner}</span>
                          </div>
                          <div className="col-span-2 text-xs text-muted-foreground">{f.updated}</div>
                          <div className="col-span-1 text-xs text-muted-foreground">{f.size}</div>
                          <div className="col-span-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3.5 w-3.5" /> {f.shared}
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1 text-muted-foreground">
                            <button className="rounded p-1.5 hover:bg-surface hover:text-foreground"><Share2 className="h-3.5 w-3.5" /></button>
                            <button className="rounded p-1.5 hover:bg-surface hover:text-foreground"><Download className="h-3.5 w-3.5" /></button>
                            <button className="rounded p-1.5 hover:bg-surface hover:text-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {filtered.map((f) => {
                      const { I, c } = iconFor(f.kind);
                      return (
                        <div key={f.name} className="group rounded-xl border border-border bg-surface p-4 hover:border-primary/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c}`}>
                              <I className="h-5 w-5" />
                            </div>
                            {f.starred && <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />}
                          </div>
                          <div className="mt-3 truncate text-sm font-medium">{f.name}</div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{f.size}</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{f.shared}</span>
                          </div>
                          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <img src={avatar(f.owner)} alt="" className="h-5 w-5 rounded-full object-cover" />
                              <span className="truncate">{f.owner.split(" ").slice(-1)[0]}</span>
                            </div>
                            <span>{f.updated}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}