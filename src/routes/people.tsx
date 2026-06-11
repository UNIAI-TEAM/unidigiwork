import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Upload,
  Download,
  Plus,
  Search as SearchIcon,
  ChevronDown,
  MessageCircle,
  Mail,
  Phone,
  Calendar,
  MoreHorizontal,
  X,
  MapPin,
  Building2,
  Grid3x3,
  List,
  Users as UsersIcon,
  FileText,
  FileSpreadsheet,
  FileImage,
  Presentation,
  CheckCircle2,
  Circle as CircleIcon,
  Clock,
  Hash,
  Video,
  Edit3,
  Briefcase,
  Award,
  GraduationCap,
  Globe,
  ExternalLink,
  User,
  Briefcase as BriefcaseIcon,
  MapPin as MapPinIcon,
  Trash2,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People · UNIWORK" },
      {
        name: "description",
        content: "Danh bạ nhân sự, vai trò, kỹ năng và thông tin liên hệ trên UNIWORK.",
      },
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

const DEFAULT_PEOPLE: Person[] = [
  {
    id: "p1",
    name: "Nguyễn Văn A",
    seed: "nguyen-van-a-1",
    role: "CEO",
    roleColor: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    title: "Giám đốc Điều hành",
    team: "Executive Office",
    email: "nguyenvana@uniwork.vn",
    phone: "(+84) 912 345 678",
    location: "Hà Nội, Việt Nam",
    department: "Executive",
    status: "online",
    empId: "UNI-0001",
    joinDate: "01/01/2022",
    skills: ["Leadership", "Strategy", "Product Management", "Communication", "Team Building"],
    reportsTo: "Board of Directors",
    teams: ["Executive Office", "Strategy Committee", "Digital Transformation Team"],
    about:
      "Hơn 10 năm kinh nghiệm trong lĩnh vực công nghệ và quản trị doanh nghiệp. Đam mê xây dựng sản phẩm tốt và đội ngũ mạnh.",
  },
  {
    id: "p2",
    name: "Phạm Minh C",
    seed: "pham-minh-c",
    role: "Dev",
    roleColor: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
    title: "Tech Lead",
    team: "DevOps Team",
    email: "phamminhc@uniwork.vn",
    phone: "(+84) 912 000 002",
    location: "Hà Nội, Việt Nam",
    department: "Engineering",
    status: "online",
    empId: "UNI-0042",
    joinDate: "12/03/2022",
    skills: ["Kubernetes", "Go", "AWS", "Terraform"],
    reportsTo: "Nguyễn Văn A",
    teams: ["DevOps Team", "Platform Guild"],
    about: "Tech Lead phụ trách hạ tầng và CI/CD.",
  },
  {
    id: "p3",
    name: "Trần Thị B",
    seed: "tran-thi-b",
    role: "PM",
    roleColor: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
    title: "Project Manager",
    team: "Product Team",
    email: "tranthib@uniwork.vn",
    phone: "(+84) 912 000 003",
    location: "Hà Nội, Việt Nam",
    department: "Product",
    status: "online",
    empId: "UNI-0011",
    joinDate: "05/02/2022",
    skills: ["Agile", "Scrum", "Roadmap"],
    reportsTo: "Nguyễn Văn A",
    teams: ["Product Team"],
    about: "PM đa năng, kết nối kỹ thuật và kinh doanh.",
  },
  {
    id: "p4",
    name: "Lê Hoàng D",
    seed: "le-hoang-d",
    role: "Backend",
    roleColor: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    title: "Backend Developer",
    team: "Backend Team",
    email: "lehoangd@uniwork.vn",
    phone: "(+84) 912 000 004",
    location: "Đà Nẵng, Việt Nam",
    department: "Engineering",
    status: "online",
    empId: "UNI-0058",
    joinDate: "20/06/2022",
    skills: ["Node.js", "PostgreSQL", "Redis"],
    reportsTo: "Phạm Minh C",
    teams: ["Backend Team"],
    about: "Backend developer kinh nghiệm hệ thống quy mô lớn.",
  },
  {
    id: "p5",
    name: "Nguyễn Hương",
    seed: "nguyen-huong",
    role: "Designer",
    roleColor: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
    title: "UI/UX Designer",
    team: "Design Team",
    email: "nguyenhuong@uniwork.vn",
    phone: "(+84) 912 000 005",
    location: "Hà Nội, Việt Nam",
    department: "Design",
    status: "online",
    empId: "UNI-0072",
    joinDate: "10/09/2022",
    skills: ["Figma", "Design System", "Prototyping"],
    reportsTo: "Trần Thị B",
    teams: ["Design Team"],
    about: "Designer tập trung trải nghiệm sản phẩm SaaS.",
  },
  {
    id: "p6",
    name: "Đỗ Tuấn Nam",
    seed: "do-tuan-nam",
    role: "SysEng",
    roleColor: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
    title: "System Engineer",
    team: "Infrastructure Team",
    email: "dotuannam@uniwork.vn",
    phone: "(+84) 912 000 006",
    location: "Hà Nội, Việt Nam",
    department: "Engineering",
    status: "online",
    empId: "UNI-0090",
    joinDate: "01/11/2022",
    skills: ["Linux", "Networking", "Ansible"],
    reportsTo: "Phạm Minh C",
    teams: ["Infrastructure Team"],
    about: "System engineer phụ trách hạ tầng on-prem.",
  },
  {
    id: "p7",
    name: "Bảo Ngọc",
    seed: "bao-ngoc",
    role: "QA",
    roleColor: "bg-teal-500/20 text-teal-300 border border-teal-500/30",
    title: "QA Engineer",
    team: "QA Team",
    email: "baongoc@uniwork.vn",
    phone: "(+84) 912 000 007",
    location: "TP.HCM, Việt Nam",
    department: "Quality",
    status: "online",
    empId: "UNI-0105",
    joinDate: "08/01/2023",
    skills: ["Cypress", "Playwright", "Test Plan"],
    reportsTo: "Trần Thị B",
    teams: ["QA Team"],
    about: "QA chuyên test tự động.",
  },
  {
    id: "p8",
    name: "Quang Minh",
    seed: "quang-minh",
    role: "Data",
    roleColor: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
    title: "Data Analyst",
    team: "Data Team",
    email: "quangminh@uniwork.vn",
    phone: "(+84) 912 000 008",
    location: "Hà Nội, Việt Nam",
    department: "Data",
    status: "online",
    empId: "UNI-0120",
    joinDate: "15/02/2023",
    skills: ["SQL", "Python", "Looker"],
    reportsTo: "Trần Thị B",
    teams: ["Data Team"],
    about: "Data analyst hỗ trợ ra quyết định.",
  },
  {
    id: "p9",
    name: "Mỹ Linh",
    seed: "my-linh",
    role: "HR",
    roleColor: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    title: "HR Specialist",
    team: "HR Department",
    email: "mylinh@uniwork.vn",
    phone: "(+84) 912 000 009",
    location: "Hà Nội, Việt Nam",
    department: "HR",
    status: "online",
    empId: "UNI-0133",
    joinDate: "10/03/2023",
    skills: ["Recruiting", "Onboarding"],
    reportsTo: "Nguyễn Văn A",
    teams: ["HR Department"],
    about: "Phụ trách tuyển dụng & văn hoá.",
  },
  {
    id: "p10",
    name: "Duy Anh",
    seed: "duy-anh",
    role: "Mobile",
    roleColor: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
    title: "Mobile Developer",
    team: "Mobile Team",
    email: "duyanh@uniwork.vn",
    phone: "(+84) 912 000 010",
    location: "Hà Nội, Việt Nam",
    department: "Engineering",
    status: "away",
    empId: "UNI-0145",
    joinDate: "01/04/2023",
    skills: ["React Native", "Swift", "Kotlin"],
    reportsTo: "Phạm Minh C",
    teams: ["Mobile Team"],
    about: "Mobile dev đa nền tảng.",
  },
  {
    id: "p11",
    name: "Hoàng Nam",
    seed: "hoang-nam",
    role: "DevOps",
    roleColor: "bg-lime-500/20 text-lime-300 border border-lime-500/30",
    title: "DevOps Engineer",
    team: "DevOps Team",
    email: "hoangnam@uniwork.vn",
    phone: "(+84) 912 000 011",
    location: "Đà Nẵng, Việt Nam",
    department: "Engineering",
    status: "online",
    empId: "UNI-0158",
    joinDate: "05/05/2023",
    skills: ["Docker", "ArgoCD", "GitLab CI"],
    reportsTo: "Phạm Minh C",
    teams: ["DevOps Team"],
    about: "DevOps phụ trách triển khai liên tục.",
  },
  {
    id: "p12",
    name: "Tuấn Nam",
    seed: "tuan-nam-ba",
    role: "BA",
    roleColor: "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30",
    title: "Business Analyst",
    team: "BA Team",
    email: "tuannam@uniwork.vn",
    phone: "(+84) 912 000 012",
    location: "Hà Nội, Việt Nam",
    department: "Product",
    status: "online",
    empId: "UNI-0170",
    joinDate: "20/06/2023",
    skills: ["Requirements", "UML", "Process"],
    reportsTo: "Trần Thị B",
    teams: ["BA Team"],
    about: "BA cầu nối khách hàng và dev team.",
  },
];

const departments = [
  "All",
  "Executive",
  "Engineering",
  "Product",
  "Design",
  "Data",
  "HR",
  "Quality",
];
const roles = [
  "All",
  "CEO",
  "PM",
  "Dev",
  "Backend",
  "Designer",
  "QA",
  "Data",
  "HR",
  "Mobile",
  "DevOps",
  "BA",
  "SysEng",
];
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
  const [addOpen, setAddOpen] = useState(false);
  const [peopleList, setPeopleList] = useState<Person[]>(DEFAULT_PEOPLE);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return peopleList.filter((p) => {
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
  }, [query, department, role, location, peopleList]);

  const selected = useMemo(
    () => peopleList.find((p) => p.id === selectedId) ?? peopleList[0],
    [selectedId, peopleList],
  );

  const handleEdit = (person: Person) => {
    setEditingPerson(person);
    setEditOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    setPeopleList((prev) => prev.filter((p) => p.id !== deletingId));
    if (selectedId === deletingId) {
      const remaining = peopleList.filter((p) => p.id !== deletingId);
      setSelectedId(remaining[0]?.id ?? "");
    }
    setDeletingId(null);
    setDeleteOpen(false);
  };

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
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
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
              <Select
                value={department}
                onChange={setDepartment}
                options={departments}
                label={t("people.filter.department")}
              />
              <Select
                value={role}
                onChange={setRole}
                options={roles}
                label={t("people.filter.role")}
              />
              <Select
                value={location}
                onChange={setLocation}
                options={locations}
                label={t("people.filter.location")}
              />
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
              <Tab label={t("people.tab.all")} count={peopleList.length} active />
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
                  <PersonCard
                    key={p.id}
                    p={p}
                    active={p.id === selectedId}
                    onClick={() => setSelectedId(p.id)}
                    onEdit={() => handleEdit(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {filtered.map((p, i) => (
                  <PersonRow
                    key={p.id}
                    p={p}
                    active={p.id === selectedId}
                    divider={i > 0}
                    onClick={() => setSelectedId(p.id)}
                    onEdit={() => handleEdit(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <div>
                {t("people.showing")} 1 - {filtered.length} {t("people.of")} {peopleList.length}{" "}
                {t("people.people")}
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
      <AddPersonDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditPersonDialog
        open={editOpen}
        person={editingPerson}
        onClose={() => {
          setEditOpen(false);
          setEditingPerson(null);
        }}
        onSave={(updated) => {
          setPeopleList((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
          setEditOpen(false);
          setEditingPerson(null);
        }}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-surface border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa nhân sự này? Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-surface-2 border-border hover:bg-surface-3">
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tab({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <button
      className={`-mb-px flex items-center gap-2 border-b-2 px-1 py-2.5 text-sm transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-surface-2 py-2 pl-3 pr-8 text-sm hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="All">{label}</option>
        {options
          .filter((o) => o !== "All")
          .map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function PersonCard({
  p,
  active,
  onClick,
  onEdit,
  onDelete,
}: {
  p: Person;
  active?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${statusDot[p.status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.name}</div>
          <span
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${p.roleColor}`}
          >
            {p.role}
          </span>
          <div className="mt-1 truncate text-xs text-muted-foreground">{p.title}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> {p.team}
        </div>
        <div className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> <span className="truncate">{p.email}</span>
        </div>
      </div>
      <div
        className="mt-1 flex items-center gap-1 border-t border-border pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <IconBtn>
          <MessageCircle className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn>
          <Mail className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn>
          <Phone className="h-3.5 w-3.5" />
        </IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconBtn className="ml-auto">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-surface border-border">
            <DropdownMenuItem onClick={onEdit} className="cursor-pointer focus:bg-surface-2">
              <Edit3 className="h-4 w-4 mr-2" /> Sửa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-400">
              <Trash2 className="h-4 w-4 mr-2" /> Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
  );
}

function PersonRow({
  p,
  active,
  divider,
  onClick,
  onEdit,
  onDelete,
}: {
  p: Person;
  active?: boolean;
  divider?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2 ${
        active ? "bg-surface-2" : ""
      } ${divider ? "border-t border-border" : ""}`}
    >
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="relative shrink-0">
          <img src={avatar(p.seed)} alt={p.name} className="h-9 w-9 rounded-full object-cover" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${statusDot[p.status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{p.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.roleColor}`}>
              {p.role}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {p.title} · {p.team}
          </div>
        </div>
      </button>
      <div className="hidden text-xs text-muted-foreground sm:block">{p.email}</div>
      <div className="hidden text-xs text-muted-foreground md:block">{p.location}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-surface border-border">
          <DropdownMenuItem onClick={onEdit} className="cursor-pointer focus:bg-surface-2">
            <Edit3 className="h-4 w-4 mr-2" /> Sửa
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-400">
            <Trash2 className="h-4 w-4 mr-2" /> Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function IconBtn({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <button
      className={`rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      {children}
    </button>
  );
}

function PersonPanel({ person }: { person: Person; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"overview" | "profile" | "activity" | "files" | "tasks">(
    "overview",
  );
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
          <img
            src={avatar(person.seed)}
            alt={person.name}
            className="h-16 w-16 rounded-full object-cover"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${statusDot[person.status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{person.name}</h2>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${person.roleColor}`}>
              {person.role}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{person.title}</div>
          <div className="text-xs text-muted-foreground">{person.team}</div>
        </div>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 px-5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="h-4 w-4" /> {person.email}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-4 w-4" /> {person.phone}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4" /> {person.location}
        </div>
      </div>

      <div className="flex items-center gap-1 px-5 py-4">
        <IconBtn>
          <MessageCircle className="h-4 w-4" />
        </IconBtn>
        <IconBtn>
          <Mail className="h-4 w-4" />
        </IconBtn>
        <IconBtn>
          <Phone className="h-4 w-4" />
        </IconBtn>
        <IconBtn>
          <Calendar className="h-4 w-4" />
        </IconBtn>
        <IconBtn>
          <MoreHorizontal className="h-4 w-4" />
        </IconBtn>
      </div>

      <div className="flex items-center gap-4 border-b border-border px-5 text-sm">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`-mb-px border-b-2 py-2.5 transition-colors ${
              tab === tb.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-6 px-5 py-5 text-sm">
        {tab === "overview" && <OverviewTab person={person} />}
        {tab === "profile" && <ProfileTab person={person} />}
        {tab === "activity" && <ActivityTab />}
        {tab === "files" && <FilesTab />}
        {tab === "tasks" && <TasksTab />}
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function OverviewTab({ person }: { person: Person }) {
  const { t } = useI18n();
  return (
    <>
      <section>
        <SectionTitle>{t("people.panel.about")}</SectionTitle>
        <p className="leading-relaxed text-muted-foreground">{person.about}</p>
      </section>
      <section>
        <SectionTitle>{t("people.panel.skills")}</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {person.skills.map((s) => (
            <span key={s} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">
              {s}
            </span>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>{t("people.panel.reports")}</SectionTitle>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" /> {person.reportsTo}
        </div>
      </section>
      <section>
        <SectionTitle>{t("people.panel.direct")} (8)</SectionTitle>
        <div className="flex -space-x-2">
          {DEFAULT_PEOPLE.slice(1, 6).map((p) => (
            <img
              key={p.id}
              src={avatar(p.seed)}
              alt={p.name}
              title={p.name}
              className="h-8 w-8 rounded-full border-2 border-surface object-cover"
            />
          ))}
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] text-muted-foreground">
            +3
          </span>
        </div>
      </section>
    </>
  );
}

function ProfileTab({ person }: { person: Person }) {
  const experiences = [
    {
      role: person.title,
      company: "UNIWORK",
      time: `${person.joinDate} - Hiện tại`,
      desc: "Phụ trách chiến lược sản phẩm & đội ngũ điều hành.",
    },
    {
      role: "Product Director",
      company: "TechVN JSC",
      time: "06/2018 - 12/2021",
      desc: "Dẫn dắt 3 dòng sản phẩm SaaS B2B.",
    },
    {
      role: "Senior PM",
      company: "FPT Software",
      time: "01/2014 - 05/2018",
      desc: "Quản lý các dự án triển khai cho khách hàng EU.",
    },
  ];
  const educations = [
    {
      school: "Đại học Bách Khoa Hà Nội",
      degree: "Thạc sĩ Công nghệ Thông tin",
      time: "2012 - 2014",
    },
    { school: "Đại học Bách Khoa Hà Nội", degree: "Cử nhân CNTT", time: "2008 - 2012" },
  ];
  const certs = ["PMP®", "Scrum Master (PSM I)", "AWS Solutions Architect"];
  const languages = [
    { name: "Tiếng Việt", level: "Bản ngữ" },
    { name: "English", level: "Thành thạo (C1)" },
    { name: "日本語", level: "Sơ cấp (N4)" },
  ];
  return (
    <>
      <section>
        <SectionTitle>Thông tin cá nhân</SectionTitle>
        <div className="space-y-2">
          <Row label="Họ tên đầy đủ" value={person.name} />
          <Row label="Mã nhân viên" value={person.empId} />
          <Row label="Phòng ban" value={person.department} />
          <Row label="Ngày vào" value={person.joinDate} />
          <Row label="Sinh nhật" value="14/03/1988" />
          <Row label="Giới tính" value="Nam" />
        </div>
      </section>
      <section>
        <SectionTitle>
          <Briefcase className="mr-1 inline h-3 w-3" /> Kinh nghiệm
        </SectionTitle>
        <ul className="space-y-3">
          {experiences.map((e, i) => (
            <li key={i} className="border-l-2 border-border pl-3">
              <div className="text-sm font-medium text-foreground">{e.role}</div>
              <div className="text-xs text-muted-foreground">
                {e.company} · {e.time}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{e.desc}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>
          <GraduationCap className="mr-1 inline h-3 w-3" /> Học vấn
        </SectionTitle>
        <ul className="space-y-2">
          {educations.map((e, i) => (
            <li key={i}>
              <div className="text-sm font-medium text-foreground">{e.school}</div>
              <div className="text-xs text-muted-foreground">
                {e.degree} · {e.time}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>
          <Award className="mr-1 inline h-3 w-3" /> Chứng chỉ
        </SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {certs.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-400"
            >
              <Award className="h-3 w-3" /> {c}
            </span>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>
          <Globe className="mr-1 inline h-3 w-3" /> Ngôn ngữ
        </SectionTitle>
        <div className="space-y-1.5">
          {languages.map((l) => (
            <Row
              key={l.name}
              label={l.name}
              value={<span className="text-xs text-muted-foreground">{l.level}</span>}
            />
          ))}
        </div>
      </section>
      <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:bg-surface-3">
        <Edit3 className="h-3.5 w-3.5" /> Chỉnh sửa hồ sơ
      </button>
    </>
  );
}

function ActivityTab() {
  const activities = [
    {
      icon: MessageCircle,
      color: "text-sky-400 bg-sky-500/10",
      title: "Đã bình luận trong #sprint-6",
      desc: '"Tốt, nhớ ghi lại metrics để báo cáo Steering Committee chiều nay."',
      time: "2 phút trước",
    },
    {
      icon: CheckCircle2,
      color: "text-emerald-400 bg-emerald-500/10",
      title: "Hoàn thành task",
      desc: "Phê duyệt ngân sách Q3 cho STOS Project",
      time: "1 giờ trước",
    },
    {
      icon: Video,
      color: "text-rose-400 bg-rose-500/10",
      title: "Tham gia cuộc họp",
      desc: "Steering Committee - Tuần 24",
      time: "3 giờ trước",
    },
    {
      icon: FileText,
      color: "text-violet-400 bg-violet-500/10",
      title: "Tải lên tài liệu",
      desc: "Báo cáo chiến lược Q3-2026.pdf",
      time: "Hôm qua",
    },
    {
      icon: Edit3,
      color: "text-amber-400 bg-amber-500/10",
      title: "Chỉnh sửa Wiki",
      desc: 'Cập nhật trang "Quy trình ra quyết định"',
      time: "2 ngày trước",
    },
    {
      icon: UsersIcon,
      color: "text-primary bg-primary/10",
      title: "Thêm thành viên",
      desc: "Mời 3 người vào workspace Smart University",
      time: "3 ngày trước",
    },
  ];
  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Hoạt động gần đây</SectionTitle>
          <select className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] focus:outline-none">
            <option>7 ngày qua</option>
            <option>30 ngày qua</option>
            <option>Tất cả</option>
          </select>
        </div>
        <ol className="relative space-y-4 border-l border-border pl-4">
          {activities.map((a, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface ${a.color}`}
              >
                <a.icon className="h-3 w-3" />
              </span>
              <div className="text-sm font-medium text-foreground">{a.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.desc}</p>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{a.time}</div>
            </li>
          ))}
        </ol>
        <button className="mt-4 w-full rounded-lg border border-border bg-surface-2 py-2 text-xs text-muted-foreground hover:text-foreground">
          Xem thêm hoạt động
        </button>
      </section>
    </>
  );
}

function FilesTab() {
  const files = [
    {
      name: "Báo cáo chiến lược Q3-2026.pdf",
      type: "pdf",
      size: "4.2 MB",
      time: "Hôm qua",
      shared: "STOS Project",
    },
    {
      name: "Kế hoạch OKR Q3.xlsx",
      type: "xlsx",
      size: "1.1 MB",
      time: "2 ngày trước",
      shared: "Executive Office",
    },
    {
      name: "Slide Town Hall T6.pptx",
      type: "ppt",
      size: "8.7 MB",
      time: "4 ngày trước",
      shared: "All Hands",
    },
    {
      name: "Sơ đồ tổ chức 2026.png",
      type: "image",
      size: "2.4 MB",
      time: "1 tuần trước",
      shared: "HR Department",
    },
    {
      name: "Quy chế làm việc.docx",
      type: "doc",
      size: "320 KB",
      time: "2 tuần trước",
      shared: "HR Department",
    },
  ];
  const icon = (t: string) => {
    switch (t) {
      case "pdf":
        return <FileText className="h-5 w-5 text-rose-400" />;
      case "xlsx":
        return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
      case "ppt":
        return <Presentation className="h-5 w-5 text-orange-400" />;
      case "image":
        return <FileImage className="h-5 w-5 text-violet-400" />;
      default:
        return <FileText className="h-5 w-5 text-sky-400" />;
    }
  };
  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Tệp đã chia sẻ ({files.length})</SectionTitle>
          <button className="text-[11px] text-primary hover:underline">Xem tất cả</button>
        </div>
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.name}
              className="group flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 group-hover:bg-surface-3">
                {icon(f.type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.size} · {f.time} · {f.shared}
                </div>
              </div>
              <button className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100">
                <Download className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>Theo loại</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: "PDF", c: 8, cls: "text-rose-400 bg-rose-500/10" },
            { l: "Excel", c: 5, cls: "text-emerald-400 bg-emerald-500/10" },
            { l: "Word", c: 4, cls: "text-sky-400 bg-sky-500/10" },
            { l: "PowerPoint", c: 3, cls: "text-orange-400 bg-orange-500/10" },
          ].map((g) => (
            <div key={g.l} className={`rounded-lg p-2 ${g.cls}`}>
              <div className="text-lg font-bold">{g.c}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{g.l}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function TasksTab() {
  const tasks = [
    {
      title: "Phê duyệt kế hoạch ngân sách Q3",
      project: "Executive Office",
      status: "active",
      priority: "Cao",
      due: "Hôm nay",
    },
    {
      title: "Review tài liệu chiến lược STOS",
      project: "STOS Project",
      status: "active",
      priority: "Cao",
      due: "Ngày mai",
    },
    {
      title: "Chuẩn bị slide Town Hall tháng 7",
      project: "All Hands",
      status: "todo",
      priority: "Trung bình",
      due: "30/06",
    },
    {
      title: "Họp 1-1 với Tech Lead",
      project: "DevOps Team",
      status: "done",
      priority: "Thấp",
      due: "Đã xong",
    },
    {
      title: "Ký hợp đồng đối tác CloudVN",
      project: "Partnerships",
      status: "done",
      priority: "Cao",
      due: "Đã xong",
    },
  ];
  const statusIcon = (s: string) =>
    s === "done" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : s === "active" ? (
      <Clock className="h-4 w-4 text-sky-400" />
    ) : (
      <CircleIcon className="h-4 w-4 text-muted-foreground" />
    );
  const prioCls = (p: string) =>
    p === "Cao"
      ? "bg-rose-500/15 text-rose-300"
      : p === "Trung bình"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-surface-2 text-muted-foreground";

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;

  return (
    <>
      <section>
        <SectionTitle>Tổng quan công việc</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            l="Đang làm"
            v={tasks.filter((t) => t.status === "active").length}
            cls="text-sky-400 bg-sky-500/10"
          />
          <Stat l="Hoàn thành" v={done} cls="text-emerald-400 bg-emerald-500/10" />
          <Stat
            l="Tồn đọng"
            v={tasks.filter((t) => t.status === "todo").length}
            cls="text-amber-400 bg-amber-500/10"
          />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Tỷ lệ hoàn thành</span>
            <span className="text-foreground">{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Công việc được giao</SectionTitle>
          <button className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Mở Tasks
          </button>
        </div>
        <ul className="space-y-2">
          {tasks.map((t, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-surface-2/40 p-2.5 hover:border-primary/40"
            >
              <div className="flex items-start gap-2">
                {statusIcon(t.status)}
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-medium ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      <Hash className="h-3 w-3" />
                      {t.project}
                    </span>
                    <span>·</span>
                    <span>{t.due}</span>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${prioCls(t.priority)}`}
                >
                  {t.priority}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Stat({ l, v, cls }: { l: string; v: number; cls: string }) {
  return (
    <div className={`rounded-lg p-2 text-center ${cls}`}>
      <div className="text-lg font-bold">{v}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{l}</div>
    </div>
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

function AddPersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    department: "",
    role: "",
    location: "",
    empId: "",
    joinDate: "",
    about: "",
  });

  const handleChange = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto bg-surface">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Thêm nhân sự mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Họ và tên</label>
              <Input
                placeholder="Nguyễn Văn A"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="bg-surface-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="a.nguyen@uniwork.vn"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="bg-surface-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Số điện thoại</label>
              <Input
                type="tel"
                placeholder="(+84) 912 345 678"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="bg-surface-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chức danh</label>
              <Input
                placeholder="Senior Developer"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                className="bg-surface-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phòng ban</label>
              <select
                value={form.department}
                onChange={(e) => handleChange("department", e.target.value)}
                className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Chọn phòng ban</option>
                {departments.filter((d) => d !== "All").map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vai trò</label>
              <select
                value={form.role}
                onChange={(e) => handleChange("role", e.target.value)}
                className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Chọn vai trò</option>
                {roles.filter((r) => r !== "All").map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Địa điểm</label>
              <select
                value={form.location}
                onChange={(e) => handleChange("location", e.target.value)}
                className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Chọn địa điểm</option>
                {locations.filter((l) => l !== "All").map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mã nhân viên</label>
              <Input
                placeholder="UNI-0000"
                value={form.empId}
                onChange={(e) => handleChange("empId", e.target.value)}
                className="bg-surface-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Ngày vào làm</label>
              <Input
                type="date"
                value={form.joinDate}
                onChange={(e) => handleChange("joinDate", e.target.value)}
                className="bg-surface-2"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Giới thiệu</label>
            <Textarea
              placeholder="Mô tả ngắn về nhân sự…"
              value={form.about}
              onChange={(e) => handleChange("about", e.target.value)}
              className="min-h-[80px] bg-surface-2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Thêm nhân sự
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
