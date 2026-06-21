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
  SlidersHorizontal,
  X,
  Briefcase,
  User as UserIcon,
  ArrowUpDown,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";

type ResultType = "meeting" | "task" | "deadline" | "document" | "person";

type SearchParams = {
  q?: string;
  type?: ResultType | "all";
  project?: string;
  assignee?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
};

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v : undefined;
    const t = s.type;
    return {
      q: str(s.q),
      type:
        t === "meeting" || t === "task" || t === "deadline" || t === "document" || t === "person"
          ? t
          : "all",
      project: str(s.project),
      assignee: str(s.assignee),
      from: str(s.from),
      to: str(s.to),
    };
  },
  head: () => ({
    meta: [
      { title: "Tìm kiếm — UNIWORK" },
      {
        name: "description",
        content:
          "Tìm kiếm toàn workspace với bộ lọc nâng cao: thời gian, dự án, người phụ trách.",
      },
    ],
  }),
  component: SearchPage,
});

type Person = { name: string; seed: string };

type Result = {
  id: string;
  type: ResultType;
  title: string;
  snippet: string;
  meta: string;
  to: string;
  search?: Record<string, unknown>;
  owner?: Person;
  iso?: string; // YYYY-MM-DD when applicable
  project?: string;
};

const DATA: Result[] = [
  {
    id: "m1",
    type: "meeting",
    title: "Standup Engineering",
    snippet: "Daily sync 9:00 — cập nhật tiến độ sprint, blockers và mục tiêu trong ngày.",
    meta: "21/06 · 09:00 · Meet Room A",
    to: "/meeting",
    owner: { name: "Minh", seed: "minh" },
    iso: "2026-06-21",
    project: "UNIWORK Core",
  },
  {
    id: "m2",
    type: "meeting",
    title: "Demo khách hàng VPBank",
    snippet: "Trình bày phiên bản beta cho khối Khách hàng doanh nghiệp.",
    meta: "25/06 · 14:00 · Zoom",
    to: "/meeting",
    owner: { name: "Phong", seed: "phong" },
    iso: "2026-06-25",
    project: "UNIWORK Core",
  },
  {
    id: "m3",
    type: "meeting",
    title: "Sprint Review Q3",
    snippet: "Tổng kết sprint, retro và lên kế hoạch sprint tiếp theo cùng PO.",
    meta: "26/06 · 15:30",
    to: "/meeting",
    owner: { name: "Linh", seed: "linh" },
    iso: "2026-06-26",
    project: "Redesign",
  },
  {
    id: "t1",
    type: "task",
    title: "Hoàn thiện wireframe Dashboard",
    snippet: "Cập nhật wireframe cho trang Dashboard mới theo feedback của Linh.",
    meta: "Dự án Redesign · Ưu tiên cao",
    to: "/tasks",
    owner: { name: "Linh", seed: "linh" },
    iso: "2026-06-22",
    project: "Redesign",
  },
  {
    id: "t2",
    type: "task",
    title: "Viết tài liệu API v2",
    snippet: "Mô tả endpoint, payload, error code cho UNIWORK Public API v2.",
    meta: "Dự án Core · Trung bình",
    to: "/tasks",
    owner: { name: "An", seed: "an" },
    iso: "2026-06-24",
    project: "UNIWORK Core",
  },
  {
    id: "t3",
    type: "task",
    title: "Setup CI/CD cho service báo cáo",
    snippet: "Build pipeline GitHub Actions, deploy lên môi trường staging.",
    meta: "DevOps · Đang làm",
    to: "/tasks",
    owner: { name: "Bảo", seed: "bao" },
    iso: "2026-06-27",
    project: "DevOps",
  },
  {
    id: "d1",
    type: "deadline",
    title: "Nộp đề xuất Q3",
    snippet: "Đề xuất ngân sách và roadmap Q3 cho ban giám đốc.",
    meta: "Hạn 21/06 · 17:00",
    to: "/calendar",
    owner: { name: "Hà", seed: "ha" },
    iso: "2026-06-21",
    project: "HR",
  },
  {
    id: "d2",
    type: "deadline",
    title: "Phát hành phiên bản 1.4",
    snippet: "Release UNIWORK 1.4 cho khách hàng pilot.",
    meta: "Hạn 30/06",
    to: "/calendar",
    owner: { name: "Phong", seed: "phong" },
    iso: "2026-06-30",
    project: "UNIWORK Core",
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
    iso: "2026-06-21",
    project: "UNIWORK Core",
  },
  {
    id: "doc2",
    type: "document",
    title: "Quy trình onboarding nhân sự",
    snippet: "Checklist 30/60/90 ngày dành cho nhân sự mới.",
    meta: "Tài liệu · HR",
    to: "/documents",
    owner: { name: "Hà", seed: "ha" },
    iso: "2026-06-10",
    project: "HR",
  },
  {
    id: "doc3",
    type: "document",
    title: "Brand guideline UNIWORK 2026",
    snippet: "Bộ nhận diện thương hiệu mới, màu sắc, typography và iconography.",
    meta: "Tài liệu · Brand",
    to: "/documents",
    owner: { name: "Trang", seed: "trang" },
    iso: "2026-05-28",
    project: "Brand",
  },
  {
    id: "p1",
    type: "person",
    title: "Nguyễn Mỹ Linh",
    snippet: "Product Designer · Team Design · linh@uniwork.vn",
    meta: "Online · TP.HCM",
    to: "/people",
    owner: { name: "Linh", seed: "linh" },
    project: "Redesign",
  },
  {
    id: "p2",
    type: "person",
    title: "Trần Quốc Bảo",
    snippet: "Senior DevOps Engineer · Platform · bao@uniwork.vn",
    meta: "Đang họp · Hà Nội",
    to: "/people",
    owner: { name: "Bảo", seed: "bao" },
    project: "DevOps",
  },
  {
    id: "p3",
    type: "person",
    title: "Phạm Hoàng Phong",
    snippet: "Engineering Manager · Core · phong@uniwork.vn",
    meta: "Vắng đến 16:00",
    to: "/people",
    owner: { name: "Phong", seed: "phong" },
    project: "UNIWORK Core",
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

const PROJECTS = Array.from(
  new Set(DATA.map((d) => d.project).filter((p): p is string => Boolean(p))),
).sort();

const ASSIGNEES = Array.from(
  new Map(DATA.filter((d) => d.owner).map((d) => [d.owner!.seed, d.owner!])).values(),
).sort((a, b) => a.name.localeCompare(b.name));

const DATE_PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  {
    id: "today",
    label: "Hôm nay",
    range: () => {
      const t = isoToday();
      return [t, t];
    },
  },
  {
    id: "7d",
    label: "7 ngày tới",
    range: () => [isoToday(), isoAdd(isoToday(), 7)],
  },
  {
    id: "30d",
    label: "30 ngày tới",
    range: () => [isoToday(), isoAdd(isoToday(), 30)],
  },
  {
    id: "month",
    label: "Tháng này",
    range: () => {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [toIso(first), toIso(last)];
    },
  },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToday() {
  return toIso(new Date());
}
function isoAdd(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + days);
  return toIso(x);
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${esc(q)})`, "ig"));
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
function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function SearchPage() {
  const params = Route.useSearch();
  const { q = "", type = "all", project, assignee, from, to } = params;
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(q);
  }, [q]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const update = (patch: Partial<SearchParams>) => {
    const next: SearchParams = { ...params, ...patch };
    // strip empty
    const clean: Record<string, unknown> = {};
    (Object.keys(next) as (keyof SearchParams)[]).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === "" || (k === "type" && v === "all")) return;
      clean[k] = v;
    });
    navigate({ to: "/search", search: clean });
  };

  const all = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return DATA.filter((r) => {
      if (needle) {
        const hay = (r.title + " " + r.snippet + " " + r.meta).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (project && r.project !== project) return false;
      if (assignee && r.owner?.seed !== assignee) return false;
      if (from && r.iso && r.iso < from) return false;
      if (to && r.iso && r.iso > to) return false;
      // When date range is set, exclude items without an `iso` (e.g. people)
      if ((from || to) && !r.iso) return false;
      return true;
    });
  }, [q, project, assignee, from, to]);

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

  const activeFilterCount =
    (project ? 1 : 0) + (assignee ? 1 : 0) + (from || to ? 1 : 0);

  const assigneeName = ASSIGNEES.find((a) => a.seed === assignee)?.name;

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
              update({ q: draft.trim() || undefined });
            }}
            className="relative mb-3"
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

          {/* Filter toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (filtersOpen || activeFilterCount > 0
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground")
              }
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc nâng cao
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/25 px-1.5 text-[10px]">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Active filter chips */}
            {project && (
              <FilterChip
                icon={Briefcase}
                label={`Dự án: ${project}`}
                onClear={() => update({ project: undefined })}
              />
            )}
            {assignee && (
              <FilterChip
                icon={UserIcon}
                label={`Người phụ trách: ${assigneeName ?? assignee}`}
                onClear={() => update({ assignee: undefined })}
              />
            )}
            {(from || to) && (
              <FilterChip
                icon={CalendarIcon}
                label={`Thời gian: ${from ?? "…"} → ${to ?? "…"}`}
                onClear={() => update({ from: undefined, to: undefined })}
              />
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  update({
                    project: undefined,
                    assignee: undefined,
                    from: undefined,
                    to: undefined,
                  })
                }
                className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Xoá tất cả
              </button>
            )}
          </div>

          {/* Filter panel */}
          {filtersOpen && (
            <div className="mb-5 grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Project */}
              <FilterField icon={Briefcase} label="Dự án">
                <select
                  value={project ?? ""}
                  onChange={(e) => update({ project: e.target.value || undefined })}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Tất cả dự án</option>
                  {PROJECTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </FilterField>

              {/* Assignee */}
              <FilterField icon={UserIcon} label="Người phụ trách">
                <select
                  value={assignee ?? ""}
                  onChange={(e) => update({ assignee: e.target.value || undefined })}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Tất cả nhân sự</option>
                  {ASSIGNEES.map((a) => (
                    <option key={a.seed} value={a.seed}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FilterField>

              {/* Date range */}
              <FilterField icon={CalendarIcon} label="Khoảng thời gian">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={from ?? ""}
                    onChange={(e) => update({ from: e.target.value || undefined })}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Từ ngày"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="date"
                    value={to ?? ""}
                    onChange={(e) => update({ to: e.target.value || undefined })}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Đến ngày"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DATE_PRESETS.map((p) => {
                    const [f, t] = p.range();
                    const active = from === f && to === t;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => update({ from: f, to: t })}
                        className={
                          "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                          (active
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border bg-surface-2 text-muted-foreground hover:text-foreground")
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </FilterField>
            </div>
          )}

          {/* Type tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            {TYPE_ORDER.map((t) => {
              const active = type === t;
              const label = t === "all" ? "Tất cả" : TYPE_META[t].label;
              const Icon = t === "all" ? Sparkles : TYPE_META[t].icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => update({ type: t === "all" ? undefined : t })}
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
                </button>
              );
            })}
          </div>

          {/* Results */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
              <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="text-base font-medium">Không có kết quả phù hợp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử nới rộng khoảng thời gian, đổi dự án hoặc người phụ trách.
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
                          {r.project && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="h-3.5 w-3.5" /> {r.project}
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
        </div>
      </main>
    </div>
  );
}

function FilterChip({
  icon: Icon,
  label,
  onClear,
}: {
  icon: typeof Briefcase;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
      <Icon className="h-3.5 w-3.5" />
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label="Xoá bộ lọc"
        className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FilterField({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Briefcase;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      {children}
    </div>
  );
}