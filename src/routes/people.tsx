import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Upload, Download, Plus, Search as SearchIcon, ChevronDown, MessageCircle,
  Mail, Phone, Calendar, MoreHorizontal, X, MapPin, Building2, Grid3x3, List,
  Users as UsersIcon,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People · UNIWORK" },
      { name: "description", content: "Danh bạ nhân sự, vai trò, kỹ năng và thông tin liên hệ trên UNIWORK." },
    ],
  }),
  component: PeoplePage,
});

type Status = "online" | "away" | "offline";
type Person = {
  id: string;
  name: string;
  seed: string;
  role: string;
  roleColor: string;
  title: string;
  team: string;
  email: string;
  phone: string;
  location: string;
  department: string;
  status: Status;
  empId: string;
  joinDate: string;
  skills: string[];
  reportsTo: string;
  teams: string[];
  about: string;
};

const people: Person[] = [
  { id: "p1", name: "Nguyễn Văn A", seed: "nguyen-van-a-1", role: "CEO", roleColor: "bg-amber-500/20 text-amber-300 border border-amber-500/30", title: "Giám đốc Điều hành", team: "Executive Office", email: "nguyenvana@uniwork.vn", phone: "(+84) 912 345 678", location: "Hà Nội, Việt Nam", department: "Executive", status: "online", empId: "UNI-0001", joinDate: "01/01/2022", skills: ["Leadership", "Strategy", "Product Management", "Communication", "Team Building"], reportsTo: "Board of Directors", teams: ["Executive Office", "Strategy Committee", "Digital Transformation Team"], about: "Hơn 10 năm kinh nghiệm trong lĩnh vực công nghệ và quản trị doanh nghiệp. Đam mê xây dựng sản phẩm tốt và đội ngũ mạnh." },
  { id: "p2", name: "Phạm Minh C", seed: "pham-minh-c", role: "Dev", roleColor: "bg-sky-500/20 text-sky-300 border border-sky-500/30", title: "Tech Lead", team: "DevOps Team", email: "phamminhc@uniwork.vn", phone: "(+84) 912 000 002", location: "Hà Nội, Việt Nam", department: "Engineering", status: "online", empId: "UNI-0042", joinDate: "12/03/2022", skills: ["Kubernetes", "Go", "AWS", "Terraform"], reportsTo: "Nguyễn Văn A", teams: ["DevOps Team", "Platform Guild"], about: "Tech Lead phụ trách hạ tầng và CI/CD." },
  { id: "p3", name: "Trần Thị B", seed: "tran-thi-b", role: "PM", roleColor: "bg-violet-500/20 text-violet-300 border border-violet-500/30", title: "Project Manager", team: "Product Team", email: "tranthib@uniwork.vn", phone: "(+84) 912 000 003", location: "Hà Nội, Việt Nam", department: "Product", status: "online", empId: "UNI-0011", joinDate: "05/02/2022", skills: ["Agile", "Scrum", "Roadmap"], reportsTo: "Nguyễn Văn A", teams: ["Product Team"], about: "PM đa năng, kết nối kỹ thuật và kinh doanh." },
  { id: "p4", name: "Lê Hoàng D", seed: "le-hoang-d", role: "Backend", roleColor: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30", title: "Backend Developer", team: "Backend Team", email: "lehoangd@uniwork.vn", phone: "(+84) 912 000 004", location: "Đà Nẵng, Việt Nam", department: "Engineering", status: "online", empId: "UNI-0058", joinDate: "20/06/2022", skills: ["Node.js", "PostgreSQL", "Redis"], reportsTo: "Phạm Minh C", teams: ["Backend Team"], about: "Backend developer kinh nghiệm hệ thống quy mô lớn." },
  { id: "p5", name: "Nguyễn Hương", seed: "nguyen-huong", role: "Designer", roleColor: "bg-pink-500/20 text-pink-300 border border-pink-500/30", title: "UI/UX Designer", team: "Design Team", email: "nguyenhuong@uniwork.vn", phone: "(+84) 912 000 005", location: "Hà Nội, Việt Nam", department: "Design", status: "online", empId: "UNI-0072", joinDate: "10/09/2022", skills: ["Figma", "Design System", "Prototyping"], reportsTo: "Trần Thị B", teams: ["Design Team"], about: "Designer tập trung trải nghiệm sản phẩm SaaS." },
  { id: "p6", name: "Đỗ Tuấn Nam", seed: "do-tuan-nam", role: "SysEng", roleColor: "bg-orange-500/20 text-orange-300 border border-orange-500/30", title: "System Engineer", team: "Infrastructure Team", email: "dotuannam@uniwork.vn", phone: "(+84) 912 000 006", location: "Hà Nội, Việt Nam", department: "Engineering", status: "online", empId: "UNI-0090", joinDate: "01/11/2022", skills: ["Linux", "Networking", "Ansible"], reportsTo: "Phạm Minh C", teams: ["Infrastructure Team"], about: "System engineer phụ trách hạ tầng on-prem." },
  { id: "p7", name: "Bảo Ngọc", seed: "bao-ngoc", role: "QA", roleColor: "bg-teal-500/20 text-teal-300 border border-teal-500/30", title: "QA Engineer", team: "QA Team", email: "baongoc@uniwork.vn", phone: "(+84) 912 000 007", location: "TP.HCM, Việt Nam", department: "Quality", status: "online", empId: "UNI-0105", joinDate: "08/01/2023", skills: ["Cypress", "Playwright", "Test Plan"], reportsTo: "Trần Thị B", teams: ["QA Team"], about: "QA chuyên test tự động." },
  { id: "p8", name: "Quang Minh", seed: "quang-minh", role: "Data", roleColor: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30", title: "Data Analyst", team: "Data Team", email: "quangminh@uniwork.vn", phone: "(+84) 912 000 008", location: "Hà Nội, Việt Nam", department: "Data", status: "online", empId: "UNI-0120", joinDate: "15/02/2023", skills: ["SQL", "Python", "Looker"], reportsTo: "Trần Thị B", teams: ["Data Team"], about: "Data analyst hỗ trợ ra quyết định." },
  { id: "p9", name: "Mỹ Linh", seed: "my-linh", role: "HR", roleColor: "bg-rose-500/20 text-rose-300 border border-rose-500/30", title: "HR Specialist", team: "HR Department", email: "mylinh@uniwork.vn", phone: "(+84) 912 000 009", location: "Hà Nội, Việt Nam", department: "HR", status: "online", empId: "UNI-0133", joinDate: "10/03/2023", skills: ["Recruiting", "Onboarding"], reportsTo: "Nguyễn Văn A", teams: ["HR Department"], about: "Phụ trách tuyển dụng & văn hoá." },
  { id: "p10", name: "Duy Anh", seed: "duy-anh", role: "Mobile", roleColor: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30", title: "Mobile Developer", team: "Mobile Team", email: "duyanh@uniwork.vn", phone: "(+84) 912 000 010", location: "Hà Nội, Việt Nam", department: "Engineering", status: "away", empId: "UNI-0145", joinDate: "01/04/2023", skills: ["React Native", "Swift", "Kotlin"], reportsTo: "Phạm Minh C", teams: ["Mobile Team"], about: "Mobile dev đa nền tảng." },
  { id: "p11", name: "Hoàng Nam", seed: "hoang-nam", role: "DevOps", roleColor: "bg-lime-500/20 text-lime-300 border border-lime-500/30", title: "DevOps Engineer", team: "DevOps Team", email: "hoangnam@uniwork.vn", phone: "(+84) 912 000 011", location: "Đà Nẵng, Việt Nam", department: "Engineering", status: "online", empId: "UNI-0158", joinDate: "05/05/2023", skills: ["Docker", "ArgoCD", "GitLab CI"], reportsTo: "Phạm Minh C", teams: ["DevOps Team"], about: "DevOps phụ trách triển khai liên tục." },
  { id: "p12", name: "Tuấn Nam", seed: "tuan-nam-ba", role: "BA", roleColor: "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30", title: "Business Analyst", team: "BA Team", email: "tuannam@uniwork.vn", phone: "(+84) 912 000 012", location: "Hà Nội, Việt Nam", department: "Product", status: "online", empId: "UNI-0170", joinDate: "20/06/2023", skills: ["Requirements", "UML", "Process"], reportsTo: "Trần Thị B", teams: ["BA Team"], about: "BA cầu nối khách hàng và dev team." },
];

const departments = ["All", "Executive", "Engineering", "Product", "Design", "Data", "HR", "Quality"];
const roles = ["All", "CEO", "PM", "Dev", "Backend", "Designer", "QA", "Data", "HR", "Mobile", "DevOps", "BA", "SysEng"];
const locations = ["All", "Hà Nội, Việt Nam", "TP.HCM, Việt Nam", "Đà Nẵng, Việt Nam"];

const statusDot: Record<Status, string> = {
  online: "bg-success",
  away: "bg-amber-400",
  offline: "bg-muted-foreground",
};

function PeoplePage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const [role, setRole] = useState("All");
  const [location, setLocation] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string>("p1");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return people.filter((p) => {
      if (department !== "All" && p.department !== department) return false;
      if (role !== "All" && p.role !== role) return false;
      if (location !== "All" && p.location !== location) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.skills.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, department, role, location]);

  const selected = useMemo(() => people.find((p) => p.id === selectedId) ?? people[0], [selectedId]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="people" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">{t("people.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("people.sub")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                  <Upload className="h-4 w-4" /> {t("people.import")}
                </button>
                <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                  <Download className="h-4 w-4" /> {t("people.export")}
                </button>
                <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> {t("people.add")}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("people.search.placeholder")}
                  className="w-full rounded-lg bg-surface-2 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Select value={department} onChange={setDepartment} options={departments} label={t("people.filter.department")} />
              <Select value={role} onChange={setRole} options={roles} label={t("people.filter.role")} />
              <Select value={location} onChange={setLocation} options={locations} label={t("people.filter.location")} />
              <button className="flex items-center gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:bg-surface-3">
                {t("people.filter.more")} <ChevronDown className="h-4 w-4" />
              </button>
              <div className="ml-auto flex items-center gap-1 rounded-lg bg-surface-2 p-1">
                <button
                  onClick={() => setView("grid")}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${view === "grid" ? "bg-surface-3 text-foreground" : "text-muted-foreground"}`}
                >
                  <Grid3x3 className="h-3.5 w-3.5" /> {t("people.view.grid")}
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${view === "list" ? "bg-surface-3 text-foreground" : "text-muted-foreground"}`}
                >
                  <List className="h-3.5 w-3.5" /> {t("people.view.list")}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border">
              <Tab label={t("people.tab.all")} count={people.length} active />
              <Tab label={t("people.tab.teams")} count={16} />
              <Tab label={t("people.tab.departments")} count={8} />
              <Tab label={t("people.tab.positions")} count={24} />
              <Tab label={t("people.tab.skills")} />
              <Tab label={t("people.tab.org")} />
            </div>

            {/* Cards / List */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 py-16 text-sm text-muted-foreground">
                <UsersIcon className="mb-2 h-8 w-8 opacity-50" />
                {t("people.empty")}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((p) => (
                  <PersonCard key={p.id} p={p} active={p.id === selectedId} onClick={() => setSelectedId(p.id)} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {filtered.map((p, i) => (
                  <PersonRow key={p.id} p={p} active={p.id === selectedId} divider={i > 0} onClick={() => setSelectedId(p.id)} />
                ))}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <div>
                {t("people.showing")} 1 - {filtered.length} {t("people.of")} {people.length} {t("people.people")}
              </div>
              <div className="flex items-center gap-1">
                {["‹", "1", "2", "3", "4", "5", "…", "11", "›"].map((p, i) => (
                  <button
                    key={i}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs ${p === "1" ? "bg-primary text-primary-foreground" : "bg-surface-2 hover:bg-surface-3"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </main>

          {/* Right panel */}
          <PersonPanel person={selected} onClose={() => {}} />
        </div>
      </div>
    </div>
  );
}

function Tab({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <button
      className={`-mb-px flex items-center gap-2 border-b-2 px-1 py-2.5 text-sm transition-colors ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-surface-2 py-2 pl-3 pr-8 text-sm hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="All">{label}</option>
        {options.filter((o) => o !== "All").map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function PersonCard({ p, active, onClick }: { p: Person; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col gap-3 rounded-xl border bg-surface p-4 text-left transition-colors hover:border-primary/50 ${
        active ? "border-primary/70 ring-1 ring-primary/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <img src={avatar(p.seed)} alt={p.name} className="h-14 w-14 rounded-full object-cover" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${statusDot[p.status]}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.name}</div>
          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${p.roleColor}`}>{p.role}</span>
          <div className="mt-1 truncate text-xs text-muted-foreground">{p.title}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {p.team}</div>
        <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> <span className="truncate">{p.email}</span></div>
      </div>
      <div className="mt-1 flex items-center gap-1 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
        <IconBtn><MessageCircle className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn><Mail className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn><Phone className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn className="ml-auto"><MoreHorizontal className="h-3.5 w-3.5" /></IconBtn>
      </div>
    </button>
  );
}

function PersonRow({ p, active, divider, onClick }: { p: Person; active?: boolean; divider?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-2 ${
        active ? "bg-surface-2" : ""
      } ${divider ? "border-t border-border" : ""}`}
    >
      <div className="relative shrink-0">
        <img src={avatar(p.seed)} alt={p.name} className="h-9 w-9 rounded-full object-cover" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${statusDot[p.status]}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{p.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.roleColor}`}>{p.role}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.title} · {p.team}</div>
      </div>
      <div className="hidden text-xs text-muted-foreground sm:block">{p.email}</div>
      <div className="hidden text-xs text-muted-foreground md:block">{p.location}</div>
    </button>
  );
}

function IconBtn({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <button className={`rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground ${className}`}>
      {children}
    </button>
  );
}

function PersonPanel({ person }: { person: Person; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"overview" | "profile" | "activity" | "files" | "tasks">("overview");
  const tabs = [
    { id: "overview", label: t("people.panel.overview") },
    { id: "profile", label: t("people.panel.profile") },
    { id: "activity", label: t("people.panel.activity") },
    { id: "files", label: t("people.panel.files") },
    { id: "tasks", label: t("people.panel.tasks") },
  ] as const;

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
      <div className="flex items-start gap-3 p-5">
        <div className="relative">
          <img src={avatar(person.seed)} alt={person.name} className="h-16 w-16 rounded-full object-cover" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${statusDot[person.status]}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{person.name}</h2>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${person.roleColor}`}>{person.role}</span>
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{person.title}</div>
          <div className="text-xs text-muted-foreground">{person.team}</div>
        </div>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-surface-2"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-2 px-5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {person.email}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {person.phone}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {person.location}</div>
      </div>

      <div className="flex items-center gap-1 px-5 py-4">
        <IconBtn><MessageCircle className="h-4 w-4" /></IconBtn>
        <IconBtn><Mail className="h-4 w-4" /></IconBtn>
        <IconBtn><Phone className="h-4 w-4" /></IconBtn>
        <IconBtn><Calendar className="h-4 w-4" /></IconBtn>
        <IconBtn><MoreHorizontal className="h-4 w-4" /></IconBtn>
      </div>

      <div className="flex items-center gap-4 border-b border-border px-5 text-sm">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`-mb-px border-b-2 py-2.5 transition-colors ${
              tab === tb.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-6 px-5 py-5 text-sm">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.about")}</h3>
          <p className="leading-relaxed text-muted-foreground">{person.about}</p>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.skills")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {person.skills.map((s) => (
              <span key={s} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">{s}</span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.reports")}</h3>
          <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> {person.reportsTo}</div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.direct")} (8)</h3>
          <div className="flex -space-x-2">
            {people.slice(1, 6).map((p) => (
              <img key={p.id} src={avatar(p.seed)} alt={p.name} title={p.name} className="h-8 w-8 rounded-full border-2 border-surface object-cover" />
            ))}
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] text-muted-foreground">+3</span>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.teams")}</h3>
          <div className="space-y-1">
            {person.teams.map((tm) => (
              <div key={tm} className="text-muted-foreground">{tm}</div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("people.panel.work")}</h3>
          <div className="space-y-2">
            <Row label={t("people.panel.emp")} value={person.empId} />
            <Row label={t("people.panel.join")} value={person.joinDate} />
            <Row
              label={t("people.panel.status")}
              value={<span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("people.panel.active")}</span>}
            />
            <Row label={t("people.panel.worktype")} value={t("people.panel.fulltime")} />
          </div>
        </section>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}