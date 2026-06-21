import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search as SearchIcon,
  Video,
  ListChecks,
  Flag,
  FileText,
  Users as UsersIcon,
  Calendar as CalendarIcon,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";

type SearchParams = { q?: string; type?: ResultType | "all" };

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : undefined,
    type:
      s.type === "meeting" ||
      s.type === "task" ||
      s.type === "deadline" ||
      s.type === "document" ||
      s.type === "person"
        ? s.type
        : "all",
  }),
  head: () => ({
    meta: [
      { title: "Tìm kiếm — UNIWORK" },
      {
        name: "description",
        content:
          "Tìm kiếm toàn workspace: meeting, công việc, hạn chót, tài liệu và nhân sự.",
      },
    ],
  }),
  component: SearchPage,
});

type ResultType = "meeting" | "task" | "deadline" | "document" | "person";

type Result = {
  id: string;
  type: ResultType;
  title: string;
  snippet: string;
  meta: string;
  to: string;
  search?: Record<string, unknown>;
  owner?: { name: string; seed: string };
  date?: string;
};

const DATA: Result[] = [
  {
    id: "m1",
    type: "meeting",
    title: "Standup Engineering",
    snippet: "Daily sync 9:00 — cập nhật tiến độ sprint, blockers và mục tiêu trong ngày.",
    meta: "Hôm nay · 09:00 · Meet Room A",
    to: "/meeting",
    owner: { name: "Minh", seed: "minh" },
    date: "Hôm nay",
  },
  {
    id: "m2",
    type: "meeting",
    title: "Demo khách hàng VPBank",
    snippet: "Trình bày phiên bản beta cho khối Khách hàng doanh nghiệp.",
    meta: "Thứ 5 · 14:00 · Zoom",
    to: "/meeting",
    owner: { name: "Phong", seed: "phong" },
  },
  {
    id: "m3",
    type: "meeting",
    title: "Sprint Review Q3",
    snippet: "Tổng kết sprint, retro và lên kế hoạch sprint tiếp theo cùng PO.",
    meta: "Thứ 6 · 15:30",
    to: "/meeting",
    owner: { name: "Linh", seed: "linh" },
  },
  {
    id: "t1",
    type: "task",
    title: "Hoàn thiện wireframe Dashboard",
    snippet: "Cập nhật wireframe cho trang Dashboard mới theo feedback của Linh.",
    meta: "Dự án Redesign · Cao",
    to: "/tasks",
    owner: { name: "Linh", seed: "linh" },
  },
  {
    id: "t2",
    type: "task",
    title: "Viết tài liệu API v2",
    snippet: "Mô tả endpoint, payload, error code cho UNIWORK Public API v2.",
    meta: "Dự án Core · Trung bình",
    to: "/tasks",
    owner: { name: "An", seed: "an" },
  },
  {
    id: "t3",
    type: "task",
    title: "Setup CI/CD cho service báo cáo",
    snippet: "Build pipeline GitHub Actions, deploy lên môi trường staging.",
    meta: "DevOps · Đang làm",
    to: "/tasks",
    owner: { name: "Bảo", seed: "bao" },
  },
  {
    id: "d1",
    type: "deadline",
    title: "Nộp đề xuất Q3",
    snippet: "Đề xuất ngân sách và roadmap Q3 cho ban giám đốc.",
    meta: "Hạn 17:00 hôm nay",
    to: "/calendar",
    owner: { name: "Hà", seed: "ha" },
  },
  {
    id: "d2",
    type: "deadline",
    title: "Phát hành phiên bản 1.4",
    snippet: "Release UNIWORK 1.4 cho khách hàng pilot.",
    meta: "Hạn 30/06",
    to: "/calendar",
    owner: { name: "Phong", seed: "phong" },
  },
  {
    id: "doc1",
    type: "document",
    title: "Kiến trúc hệ thống UNIWORK",
    snippet:
      "Tài liệu mô tả tổng quan kiến trúc microservices, message bus và data layer.",
    meta: "Kho tri thức · cập nhật 2 giờ trước",
    to: "/knowledge",
    owner: { name: "Khang", seed: "khang" },
  },
  {
    id: "doc2",
    type: "document",
    title: "Quy trình onboarding nhân sự",
    snippet: "Checklist 30/60/90 ngày dành cho nhân sự mới.",
    meta: "Tài liệu · HR",
    to: "/documents",
    owner: { name: "Hà", seed: "ha" },
  },
  {
    id: "doc3",
    type: "document",
    title: "Brand guideline UNIWORK 2026",
    snippet: "Bộ nhận diện thương hiệu mới, màu sắc, typography và iconography.",
    meta: "Tài liệu · Brand",
    to: "/documents",
    owner: { name: "Trang", seed: "trang" },
  },
  {
    id: "p1",
    type: "person",
    title: "Nguyễn Mỹ Linh",
    snippet: "Product Designer · Team Design · linh@uniwork.vn",
    meta: "Online · TP.HCM",
    to: "/people",
    owner: { name: "Linh", seed: "linh" },
  },
  {
    id: "p2",
    type: "person",
    title: "Trần Quốc Bảo",
    snippet: "Senior DevOps Engineer · Platform · bao@uniwork.vn",
    meta: "Đang họp · Hà Nội",
    to: "/people",
    owner: { name: "Bảo", seed: "bao" },
  },
  {
    id: "p3",
    type: "person",
    title: "Phạm Hoàng Phong",
    snippet: "Engineering Manager · Core · phong@uniwork.vn",
    meta: "Vắng đến 16:00",
    to: "/people",
    owner: { name: "Phong", seed: "phong" },
  },
];

const TYPE_META: Record<
  ResultType,
  { label: string; icon: typeof Video; chip: string; iconBg: string }
> = {
  meeting: {
    label: "Họp",
    icon: Video,
    chip: "bg-primary/15 text-primary border-primary/30",
    iconBg: "bg-primary/15 text-primary",
  },
  task: {
    label: "Công việc",
    icon: ListChecks,
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    iconBg: "bg-emerald-500/15 text-emerald-400",
  },
  deadline: {
    label: "Hạn chót",
    icon: Flag,
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    iconBg: "bg-rose-500/15 text-rose-400",
  },
  document: {
    label: "Tài liệu",
    icon: FileText,
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    iconBg: "bg-amber-500/15 text-amber-400",
  },
  person: {
    label: "Nhân sự",
    icon: UsersIcon,
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    iconBg: "bg-violet-500/15 text-violet-400",
  },
};

const TYPE_ORDER: (ResultType | "all")[] = [
  "all",
  "meeting",
  "task",
  "deadline",
  "document",
  "person",
];

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${escape(q)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function SearchPage() {
  const { q = "", type = "all" } = Route.useSearch();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(q);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const all = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return DATA;
    return DATA.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.snippet.toLowerCase().includes(needle) ||
        r.meta.toLowerCase().includes(needle),
    );
  }, [q]);

  const filtered = useMemo(
    () => (type === "all" ? all : all.filter((r) => r.type === type)),
    [all, type],
  );

  const counts = useMemo(() => {
    const c: Record<ResultType | "all", number> = {
      all: all.length,
      meeting: 0,
      task: 0,
      deadline: 0,
      document: 0,
      person: 0,
    };
    all.forEach((r) => {
      c[r.type] += 1;
    });
    return c;
  }, [all]);

  const submit = (value: string) => {
    const v = value.trim();
    navigate({
      to: "/search",
      search: { ...(v ? { q: v } : {}), ...(type !== "all" ? { type } : {}) },
    });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6">
          {/* Header */}
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <SearchIcon className="h-3.5 w-3.5" />
              Tìm kiếm toàn workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {q ? (
                <>
                  Kết quả cho{" "}
                  <span className="text-primary">&ldquo;{q}&rdquo;</span>
                </>
              ) : (
                "Tìm mọi thứ trong UNIWORK"
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Meeting, công việc, hạn chót, tài liệu và nhân sự — tất cả ở một nơi.
            </p>
          </div>

          {/* Search box */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
            className="relative mb-5"
          >
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tìm meeting, task, deadline, tài liệu hoặc nhân sự…"
              className="w-full rounded-2xl border border-border bg-surface py-4 pl-12 pr-28 text-base shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Tìm
            </button>
          </form>

          {/* Filter tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            {TYPE_ORDER.map((t) => {
              const active = type === t;
              const label = t === "all" ? "Tất cả" : TYPE_META[t].label;
              const Icon = t === "all" ? Sparkles : TYPE_META[t].icon;
              return (
                <Link
                  key={t}
                  to="/search"
                  search={{ ...(q ? { q } : {}), ...(t !== "all" ? { type: t } : {}) }}
                  className={
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (active
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span
                    className={
                      "rounded-full px-1.5 text-[10px] " +
                      (active ? "bg-primary/25 text-primary" : "bg-surface-2")
                    }
                  >
                    {counts[t]}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Results */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
              <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="text-base font-medium">Không có kết quả phù hợp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử từ khoá khác hoặc chọn loại nội dung khác ở trên.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {filtered.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                return (
                  <li key={r.id}>
                    <Link
                      to={r.to}
                      search={r.search}
                      className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
                    >
                      <div
                        className={
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                          meta.iconBg
                        }
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                              meta.chip
                            }
                          >
                            {meta.label}
                          </span>
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {highlight(r.title, q)}
                          </h3>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {highlight(r.snippet, q)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {r.owner && (
                            <span className="flex items-center gap-1.5">
                              <img
                                src={avatar(r.owner.seed)}
                                alt=""
                                className="h-5 w-5 rounded-full"
                              />
                              {r.owner.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5" /> {r.meta}
                          </span>
                        </div>
                      </div>
                      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Tips */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
              Mở nhanh tìm kiếm
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>
              Tìm
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>
              Đóng
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}