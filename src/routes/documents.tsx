import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronDown, ChevronRight, Folder, FileText, Plus, Search, Star, Share2,
  MessageSquare, Clock, MoreHorizontal, Bold, Italic, Underline, Strikethrough,
  Code, List, ListOrdered, AlignLeft, AlignCenter, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Eye, Sparkles, Globe, History, Send,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Doc = { id: string; title: string; folder: string; content: string; updated_at: string };

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — UNIWORK" },
      { name: "description", content: "Tài liệu dự án trên nền tảng UNIWORK." },
    ],
  }),
  component: DocumentsPage,
});

type TreeNode = { name: string; icon?: "folder" | "file"; active?: boolean; children?: TreeNode[]; open?: boolean };

const tree: TreeNode[] = [
  { name: "Overview", icon: "folder" },
  {
    name: "Business", icon: "folder", open: true, children: [
      { name: "BRD", icon: "file", active: true },
      { name: "PRD", icon: "file" },
      { name: "User Stories", icon: "file" },
    ],
  },
  {
    name: "Design", icon: "folder", open: true, children: [
      { name: "UI/UX", icon: "file" },
      { name: "System Design", icon: "file" },
    ],
  },
  {
    name: "API", icon: "folder", open: true, children: [
      { name: "Specifications", icon: "file" },
      { name: "Integrations", icon: "file" },
    ],
  },
  {
    name: "SOP", icon: "folder", open: true, children: [
      { name: "Development", icon: "file" },
      { name: "Deployment", icon: "file" },
    ],
  },
  {
    name: "Meetings", icon: "folder", open: true, children: [
      { name: "Sprint 5", icon: "file" },
      { name: "Sprint 6", icon: "file" },
      { name: "Sprint 6 Review", icon: "file" },
    ],
  },
  { name: "Archive", icon: "folder" },
];

function TreeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(node.open ?? false);
  const hasChildren = !!node.children?.length;
  return (
    <>
      <button
        onClick={() => hasChildren && setOpen(!open)}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm ${
          node.active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
        ) : <span className="w-3.5" />}
        {node.icon === "folder" ? (
          <Folder className={`h-4 w-4 ${open ? "text-primary" : ""}`} />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && open && node.children!.map((c) => <TreeRow key={c.name} node={c} depth={depth + 1} />)}
    </>
  );
}

function ToolbarBtn({ icon: Icon }: { icon: any }) {
  return (
    <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}

function RelatedDoc({ title, date }: { title: string; date: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg p-2 hover:bg-surface-2">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">Updated {date}</div>
      </div>
    </div>
  );
}

function Suggestion({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm hover:bg-surface-2">
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DocumentsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="documents" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Document tree */}
          <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-64 lg:border-b-0 lg:border-r xl:w-72">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
              <button className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-semibold text-white">S</span>
                STOS Project
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <button className="rounded p-1.5 hover:bg-surface-2"><MoreHorizontal className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input placeholder="Quick find" className="w-full rounded-md bg-surface-2 py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none" />
              </div>
              <button className="rounded-md bg-surface-2 p-1.5 hover:bg-surface-2/70"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {tree.map((n) => <TreeRow key={n.name} node={n} />)}
            </div>
            <div className="border-t border-border p-3 text-xs">
              <div className="mb-1.5 font-medium">Storage</div>
              <div className="mb-1 text-muted-foreground">342.6 GB of 1 TB used</div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[34%] rounded-full bg-primary" />
                </div>
                <span className="text-muted-foreground">34%</span>
              </div>
              <button className="mt-3 w-full rounded-lg border border-border bg-surface-2/50 py-1.5 text-xs font-medium hover:bg-surface-2">Manage storage</button>
            </div>
          </aside>

          {/* Document content */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-border px-4 py-3 sm:px-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <span>STOS Project</span><span>/</span>
                  <span>Business</span><span>/</span>
                  <span>BRD</span><span>/</span>
                  <span className="font-medium text-foreground">STOS Platform BRD v2.0</span>
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm"><Share2 className="h-4 w-4" /> Share</button>
                  <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">Editing <ChevronDown className="h-4 w-4" /></button>
                  <button className="rounded-lg bg-surface-2 p-2"><MoreHorizontal className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold sm:text-3xl">STOS Platform – Business Requirements Document</h1>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Version 2.0</span>
                    <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">Current</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <button className="rounded p-1.5 hover:bg-surface-2"><MessageSquare className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 hover:bg-surface-2"><History className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 hover:bg-surface-2"><Star className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <img src={avatar("nguyen-van-a-1")} className="h-6 w-6 rounded-full" alt="" />
                  <span className="font-medium text-foreground">Nguyễn Văn A</span>
                </div>
                <span>Last updated: May 23, 2025 10:30 AM</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 12 min read</span>
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> 42 views</span>
                <div className="ml-auto flex -space-x-1.5">
                  {["a", "b", "c", "d"].map((s) => (
                    <img key={s} src={avatar(s)} className="h-6 w-6 rounded-full border-2 border-surface" alt="" />
                  ))}
                  <span className="flex h-6 items-center justify-center rounded-full border-2 border-surface bg-surface-2 px-1.5 text-[10px]">+6</span>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-8">
              <ToolbarBtn icon={ChevronDown} />
              <ToolbarBtn icon={ChevronRight} />
              <button className="mx-1 flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-xs">Heading 1 <ChevronDown className="h-3 w-3" /></button>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={Bold} /><ToolbarBtn icon={Italic} /><ToolbarBtn icon={Underline} /><ToolbarBtn icon={Strikethrough} /><ToolbarBtn icon={Code} />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={List} /><ToolbarBtn icon={ListOrdered} /><ToolbarBtn icon={AlignLeft} /><ToolbarBtn icon={AlignCenter} />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={LinkIcon} /><ToolbarBtn icon={ImageIcon} /><ToolbarBtn icon={TableIcon} />
              <ToolbarBtn icon={MoreHorizontal} />
            </div>

            <article className="flex-1 space-y-6 px-4 py-6 sm:px-8">
              <section>
                <h2 className="mb-3 text-xl font-bold">1. Executive Summary</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  STOS Platform là hệ thống quản lý và vận hành doanh nghiệp toàn diện, giúp số hóa quy trình,
                  tối ưu hiệu suất và cung cấp các báo cáo phân tích theo thời gian thực.
                </p>
                <p className="mt-4 text-sm font-medium">Mục tiêu chính:</p>
                <ul className="mt-2 space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-primary [&>li]:list-disc">
                  <li>Tối ưu quy trình vận hành</li>
                  <li>Cung cấp dữ liệu chính xác, real-time</li>
                  <li>Tích hợp AI hỗ trợ ra quyết định</li>
                  <li>Đảm bảo bảo mật và tuân thủ</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-3 text-xl font-bold">2. Scope</h2>
                <h3 className="mb-2 text-base font-semibold">2.1 In Scope</h3>
                <ul className="space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-primary [&>li]:list-disc">
                  <li>Quản lý người dùng và phân quyền</li>
                  <li>Quản lý quy trình nghiệp vụ</li>
                  <li>Dashboard & Báo cáo</li>
                  <li>Tích hợp API với hệ thống bên ngoài</li>
                </ul>
                <h3 className="mb-2 mt-4 text-base font-semibold">2.2 Out of Scope</h3>
                <ul className="space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-primary [&>li]:list-disc">
                  <li>Phần cứng thiết bị</li>
                  <li>Hệ thống kế toán (triển khai giai đoạn sau)</li>
                </ul>
              </section>
            </article>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-8">
              <div className="flex items-center gap-4">
                <span>1234 words</span>
                <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Vietnamese</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-success">● Saved 2 minutes ago</span>
                <button className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1"><History className="h-3.5 w-3.5" /> Version history <ChevronDown className="h-3 w-3" /></button>
              </div>
            </footer>
          </section>

          {/* Right AI panel */}
          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface xl:w-80 xl:border-l xl:border-t-0 2xl:w-96">
            <div className="flex gap-5 overflow-x-auto border-b border-border px-5 pt-4 text-sm">
              <button className="border-b-2 border-primary pb-3 font-medium">AI Copilot</button>
              <button className="pb-3 text-muted-foreground">Comments <span className="ml-1 rounded-full bg-surface-2 px-1.5 text-[10px]">8</span></button>
              <button className="pb-3 text-muted-foreground">Info</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tài liệu này mô tả yêu cầu nghiệp vụ cho nền tảng STOS. Phiên bản hiện tại 2.0 bao gồm các tính năng cốt lõi về quản lý người dùng, quy trình, báo cáo và tích hợp API.
                </p>
                <button className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Generate detailed summary</button>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">Related Documents</span>
                  <button className="text-xs text-primary">View all</button>
                </div>
                <div className="space-y-1">
                  <RelatedDoc title="STOS Platform – PRD v1.3" date="May 18, 2025" />
                  <RelatedDoc title="API Gateway Specification v2.1" date="May 20, 2025" />
                  <RelatedDoc title="System Design Document" date="May 15, 2025" />
                  <RelatedDoc title="Sprint 6 Review Notes" date="May 22, 2025" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI Suggestions</div>
                <div className="space-y-1.5">
                  <Suggestion icon="📝" label="Generate User Stories" />
                  <Suggestion icon="🧪" label="Generate Test Cases" />
                  <Suggestion icon="⚙️" label="Generate SOP" />
                  <Suggestion icon="🔁" label="Create Flow Diagram" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Ask AI</div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {["So sánh BRD v2.0 và v1.9", "Những thay đổi chính là gì?", "Tạo checklist triển khai"].map((q) => (
                    <button key={q} className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-[11px] hover:bg-surface-2">{q}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <input placeholder="Ask anything about this document…" className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none" />
                  <button className="rounded-md bg-primary p-1.5 text-primary-foreground"><Send className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}