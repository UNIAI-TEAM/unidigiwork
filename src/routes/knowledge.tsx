import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen, Plus, Sparkles, Send, Star, FileText, HelpCircle, Code2,
  Lightbulb, ShieldCheck, Video, PlayCircle, Network, ChevronRight,
  Eye, MoreVertical, ChevronDown, Upload, Download, MessageSquare,
  CheckCircle2, AlertTriangle, FileCode, FileImage, FileVideo, FileSpreadsheet,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
  head: () => ({
    meta: [
      { title: "Knowledge Base · UNIWORK" },
      { name: "description", content: "Trung tâm tri thức nội bộ với AI Copilot, SOP, Playbooks, Wiki." },
    ],
  }),
});

const spaces = [
  { name: "Overview", count: null, active: true },
  { name: "All Articles", count: 328 },
  { name: "SOP Library", count: 86 },
  { name: "FAQ", count: 54 },
  { name: "Technical Wiki", count: 112 },
  { name: "Lessons Learned", count: 32 },
  { name: "Policies & Compliance", count: 18 },
  { name: "Meeting Insights", count: 26 },
  { name: "Playbooks", count: 24 },
  { name: "Archived", count: 12 },
];

const tags = [
  { name: "Release", count: 32, color: "bg-violet-500/20 text-violet-300" },
  { name: "API Gateway", count: 28, color: "bg-sky-500/20 text-sky-300" },
  { name: "DevOps", count: 21, color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Mobile App", count: 18, color: "bg-amber-500/20 text-amber-300" },
  { name: "Dashboard", count: 16, color: "bg-rose-500/20 text-rose-300" },
];

const featured = [
  { title: "Quy trình release Sprint 6", type: "SOP", icon: FileText, color: "text-violet-300 bg-violet-500/15", team: "DevOps Team", date: "May 23, 2025", views: 245 },
  { title: "API Gateway Overview", type: "Technical", icon: Code2, color: "text-sky-300 bg-sky-500/15", team: "Backend Team", date: "May 20, 2025", views: 196 },
  { title: "Sprint 6 Review Summary", type: "Meeting Insight", icon: Video, color: "text-emerald-300 bg-emerald-500/15", team: "Product Team", date: "May 22, 2025", views: 178 },
  { title: "Deployment Checklist", type: "Playbook", icon: PlayCircle, color: "text-amber-300 bg-amber-500/15", team: "DevOps Team", date: "May 21, 2025", views: 132 },
];

const categories = [
  { name: "SOP Library", count: 86, desc: "Quy trình và hướng dẫn chuẩn cho công việc", icon: FileText, color: "bg-violet-500/15 text-violet-300" },
  { name: "FAQ", count: 54, desc: "Câu hỏi thường gặp và giải đáp", icon: HelpCircle, color: "bg-sky-500/15 text-sky-300" },
  { name: "Technical Wiki", count: 112, desc: "Tài liệu kỹ thuật, kiến trúc, API, tích hợp", icon: Code2, color: "bg-emerald-500/15 text-emerald-300" },
  { name: "Lessons Learned", count: 32, desc: "Bài học kinh nghiệm từ các dự án", icon: Lightbulb, color: "bg-amber-500/15 text-amber-300" },
  { name: "Meeting Insights", count: 26, desc: "Tóm tắt và insight từ các cuộc họp", icon: Video, color: "bg-rose-500/15 text-rose-300" },
  { name: "Policies & Compliance", count: 18, desc: "Chính sách, quy định và tuân thủ", icon: ShieldCheck, color: "bg-indigo-500/15 text-indigo-300" },
  { name: "Playbooks", count: 24, desc: "Hướng dẫn triển khai và best practices", icon: PlayCircle, color: "bg-orange-500/15 text-orange-300" },
  { name: "Knowledge Maps", count: 14, desc: "Bản đồ tri thức và mối liên kết", icon: Network, color: "bg-cyan-500/15 text-cyan-300", suffix: "maps" },
];

const recent = [
  { title: "Quy trình release Sprint 6", type: "SOP", team: "DevOps Team", time: "2 hours ago", author: "Nguyễn Văn A", views: 45, color: "text-violet-300 bg-violet-500/15" },
  { title: "API Gateway timeout configuration", type: "Technical", team: "Backend Team", time: "5 hours ago", author: "Trần Thị B", views: 38, color: "text-sky-300 bg-sky-500/15" },
  { title: "Mobile App offline sync — Lessons", type: "Lessons", team: "Mobile Team", time: "Yesterday", author: "Lê Văn C", views: 67, color: "text-amber-300 bg-amber-500/15" },
  { title: "Deployment rollback procedure", type: "Playbook", team: "DevOps Team", time: "Yesterday", author: "Phạm Thị D", views: 92, color: "text-orange-300 bg-orange-500/15" },
];

const related = [
  { title: "Deployment Checklist v2.1", type: "Playbook", date: "May 21, 2025" },
  { title: "CI/CD Pipeline Guide", type: "Technical", date: "May 18, 2025" },
  { title: "Environment Management SOP", type: "SOP", date: "May 17, 2025" },
];

const gaps = [
  { text: "Thiếu SOP cho Mobile Offline Sync" },
  { text: "API Gateway chưa cập nhật theo Sprint 6" },
  { text: "Chưa có tài liệu về Rollback Procedure" },
];

const popular = [
  { q: "Quy trình release Sprint là gì?", count: 23 },
  { q: "Cách deploy lên production?", count: 18 },
  { q: "API Gateway timeout bao nhiêu?", count: 15 },
  { q: "Cách xử lý lỗi khi deploy?", count: 12 },
];

function KnowledgePage() {
  const [open, setOpen] = useSidebarState();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("Quy trình release Sprint 6 là gì?");
  const [copilotOpen, setCopilotOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="knowledge" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1">
          {/* Knowledge Spaces */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="flex items-center justify-between px-4 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Knowledge Spaces</span>
              <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="px-3">
              <button className="flex w-full items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-semibold text-white">S</span>
                <span className="flex-1 text-left font-medium">STOS Project</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
              {spaces.map((s) => (
                <button key={s.name} className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm ${s.active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>
                  <span>{s.name}</span>
                  {s.count !== null && <span className="text-xs text-muted-foreground">{s.count}</span>}
                </button>
              ))}

              <div className="flex items-center justify-between px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Tags</span>
                <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-1.5 px-2">
                {tags.map((t) => (
                  <button key={t.name} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${t.color}`}>{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.count}</span>
                  </button>
                ))}
                <button className="flex w-full items-center justify-between px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
                  <span>More tags</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</div>
              <div className="space-y-1">
                {[
                  { icon: FileText, label: "Create Article" },
                  { icon: Upload, label: "Upload & Publish" },
                  { icon: Download, label: "Import from Confluence" },
                  { icon: MessageSquare, label: "Convert Conversation to KB" },
                  { icon: CheckCircle2, label: "Knowledge Review" },
                ].map((a) => (
                  <button key={a.label} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <a.icon className="h-4 w-4" />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </nav>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span className="text-foreground">Knowledge Base</span>
                <ChevronRight className="h-4 w-4" />
                <span>STOS Project</span>
              </div>

              {/* AI Ask Box */}
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-violet-500/5 to-transparent p-6">
                <h2 className="text-center text-base font-medium text-foreground/90">Ask anything. Get answers from your organization.</h2>
                <div className="relative mt-4">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface py-3 pl-4 pr-14 text-sm focus:border-primary focus:outline-none"
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["All", "Articles", "Documents", "Meetings", "Chats", "People"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Featured */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Featured Knowledge
                  </h3>
                  <button className="text-xs text-primary hover:underline">View all</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {featured.map((c) => (
                    <article key={c.title} className="group rounded-xl border border-border bg-surface p-4 hover:border-primary/40">
                      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                        <c.icon className="h-4 w-4" />
                      </div>
                      <h4 className="line-clamp-2 text-sm font-medium leading-snug">{c.title}</h4>
                      <span className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${c.color}`}>{c.type}</span>
                      <div className="mt-3 text-[11px] text-muted-foreground">{c.team}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Updated {c.date}</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {c.views}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Categories */}
              <section>
                <h3 className="mb-3 text-base font-semibold">Browse by Category</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {categories.map((c) => (
                    <button key={c.name} className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.color}`}>
                          <c.icon className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground">{c.count} {c.suffix ?? "articles"}</div>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{c.desc}</p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Recently Updated */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold">Recently Updated</h3>
                  <button className="text-xs text-primary hover:underline">View all</button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  {recent.map((r, i) => (
                    <div key={r.title} className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 ${i > 0 ? "border-t border-border" : ""}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${r.color}`}>
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.title}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${r.color}`}>{r.type}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{r.team} · Updated {r.time}</div>
                      </div>
                      <img src={avatar(r.author)} className="hidden h-7 w-7 rounded-full sm:block" alt="" />
                      <span className="hidden text-xs text-muted-foreground sm:inline">{r.author}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" /> {r.views}</span>
                      <button className="rounded p-1 hover:bg-surface-2"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>

          {/* AI Copilot panel */}
          {copilotOpen && (
            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface px-4 py-5 xl:flex">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">AI Knowledge Copilot</span>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">Beta</span>
                </div>
                <button onClick={() => setCopilotOpen(false)} className="rounded p-1 hover:bg-surface-2">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium">
                  <span>Suggested Answer</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Quy trình release Sprint 6 bao gồm 6 bước chính:</p>
                <ol className="mt-2 space-y-1 text-xs">
                  <li>1. Code Freeze</li>
                  <li>2. Testing & QA</li>
                  <li>3. Build & Package</li>
                  <li>4. Staging Deployment</li>
                  <li>5. Production Deployment</li>
                  <li>6. Post-release Verification</li>
                </ol>
                <div className="mt-3 text-[11px] text-muted-foreground">Nguồn tham khảo (5)</div>
                <div className="mt-1 flex gap-1">
                  {[FileText, FileVideo, FileCode, FileImage, FileSpreadsheet].map((Icon, i) => (
                    <span key={i} className="flex h-6 w-6 items-center justify-center rounded bg-surface text-muted-foreground">
                      <Icon className="h-3 w-3" />
                    </span>
                  ))}
                </div>
                <button className="mt-3 w-full rounded-lg border border-border bg-surface py-2 text-xs hover:bg-surface-2">View full answer</button>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Related Articles</span>
                  <button className="text-[11px] text-primary hover:underline">View all</button>
                </div>
                <div className="space-y-2">
                  {related.map((r) => (
                    <button key={r.title} className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-surface-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{r.title}</div>
                        <div className="text-[10px] text-muted-foreground">{r.type} · Updated {r.date}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Knowledge Gaps</span>
                  <span className="text-[11px] text-destructive">3 gaps found</span>
                </div>
                <div className="space-y-2">
                  {gaps.map((g) => (
                    <div key={g.text} className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span className="text-[11px] text-foreground/90">{g.text}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-2 w-full rounded-lg border border-border bg-surface py-2 text-xs hover:bg-surface-2">Create articles from gaps</button>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Popular Questions</span>
                  <button className="text-[11px] text-primary hover:underline">View all</button>
                </div>
                <div className="space-y-1.5">
                  {popular.map((p) => (
                    <button key={p.q} className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-surface-2">
                      <span className="flex items-start gap-2 text-xs">
                        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="line-clamp-1">{p.q}</span>
                      </span>
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}