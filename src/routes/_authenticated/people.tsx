import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPeople,
  upsertPersonProfile,
  removePerson,
  type PersonDTO,
} from "@/lib/api/people.functions";
import { useEffect, useMemo, useRef, useState } from "react";
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
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { notifyComingSoon } from "@/lib/coming-soon";
import { FilterPageHeader } from "@/components/filter-page-header";

export const Route = createFileRoute("/_authenticated/people")({
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

const TENANT_ROLES = ["tenant_owner", "tenant_admin", "manager", "member", "guest"];

const ROLE_COLORS: Record<string, string> = {
  tenant_owner: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  tenant_admin: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  manager: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
  member: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  guest: "bg-muted text-muted-foreground border border-border",
};

export function dtoToPerson(d: PersonDTO): Person {
  return {
    id: d.id,
    name: d.name,
    seed: d.seed,
    role: d.role,
    roleColor: ROLE_COLORS[d.role] ?? ROLE_COLORS["member"]!,
    title: d.title || "—",
    team: d.team || "—",
    email: d.email,
    phone: d.phone,
    location: d.location,
    department: d.department,
    status: d.memberStatus === "active" ? "online" : "offline",
    empId: d.empId,
    joinDate: d.joinDate,
    skills: d.skills,
    reportsTo: d.reportsTo,
    teams: d.teams,
    about: d.about,
  };
}

const statusDot: Record<Status, string> = {
  online: "bg-success",
  away: "bg-amber-400",
  offline: "bg-muted-foreground",
};

function PeoplePage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const [role, setRole] = useState("All");
  const [location, setLocation] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "teams" | "departments" | "positions" | "skills" | "org">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Partial<Person>[] | null>(null);

  const fetchPeople = useServerFn(listPeople);
  const saveProfile = useServerFn(upsertPersonProfile);
  const removeMember = useServerFn(removePerson);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["people"],
    queryFn: () => fetchPeople(),
    staleTime: 30_000,
  });

  const peopleList = useMemo<Person[]>(() => (data?.people ?? []).map(dtoToPerson), [data]);
  const canManage = data?.canManage ?? false;
  const departments = useMemo(() => ["All", ...(data?.departments ?? [])], [data]);
  const roles = useMemo(() => ["All", ...(data?.roles ?? [])], [data]);
  const locations = useMemo(() => ["All", ...(data?.locations ?? [])], [data]);

  const saveMutation = useMutation({
    mutationFn: (input: Person) =>
      saveProfile({
        data: {
          userId: input.id,
          displayName: input.name,
          title: input.title === "—" ? "" : input.title,
          department: input.department,
          team: input.team === "—" ? "" : input.team,
          location: input.location,
          phone: input.phone,
          empId: input.empId,
          joinDate: input.joinDate,
          reportsTo: input.reportsTo,
          skills: input.skills,
          teams: input.teams,
          about: input.about,
          role: input.role,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu thông tin nhân sự");
      qc.invalidateQueries({ queryKey: ["people"] });
      setEditOpen(false);
      setEditingPerson(null);
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được"),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { userId } }),
    onSuccess: () => {
      toast.success("Đã gỡ nhân sự khỏi tổ chức");
      qc.invalidateQueries({ queryKey: ["people"] });
      setDeleteOpen(false);
      setDeletingId(null);
    },
    onError: (e: Error) => toast.error(e.message || "Không gỡ được nhân sự"),
  });

  const exportPeopleCsv = () => {
    const rows = [
      [
        "ID",
        "Name",
        "Email",
        "Role",
        "Department",
        "Team",
        "Title",
        "Location",
        "Phone",
        "Emp ID",
        "Join Date",
        "Reports To",
        "Skills",
        "Teams",
      ],
      ...peopleList.map((p) => [
        p.id,
        p.name,
        p.email,
        p.role,
        p.department,
        p.team,
        p.title,
        p.location,
        p.phone,
        p.empId,
        p.joinDate,
        p.reportsTo,
        p.skills.join("; "),
        p.teams.join("; "),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `people-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Đã xuất danh sách nhân sự");
  };

  const parseCsv = (text: string): Partial<Person>[] => {
    const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const get = (row: string[], name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? row[idx]!.replace(/^"|"$/g, "").replace(/""/g, '"') : "";
    };
    return lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        name: get(cols, "name"),
        email: get(cols, "email"),
        role: get(cols, "role"),
        department: get(cols, "department"),
        team: get(cols, "team"),
        title: get(cols, "title"),
        location: get(cols, "location"),
        phone: get(cols, "phone"),
        empId: get(cols, "emp id") || get(cols, "empid") || get(cols, "emp_id"),
        joinDate: get(cols, "join date") || get(cols, "joindate") || get(cols, "join_date"),
        reportsTo: get(cols, "reports to") || get(cols, "reportsto") || get(cols, "reports_to"),
        skills: (get(cols, "skills") || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
        teams: (get(cols, "teams") || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    });
  };

  const importPeople = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("Không tìm thấy dữ liệu trong file CSV");
      return;
    }
    setImportPreview(rows);
    setImportOpen(true);
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    let ok = 0;
    for (const row of importPreview) {
      if (!row.name || !row.email) continue;
      try {
        await saveProfile({
          data: {
            userId: row.id ?? crypto.randomUUID(),
            displayName: row.name,
            email: row.email,
            title: row.title === "—" ? "" : row.title || "",
            department: row.department || "",
            team: row.team || "",
            location: row.location || "",
            phone: row.phone || "",
            empId: row.empId || "",
            joinDate: row.joinDate || "",
            reportsTo: row.reportsTo || "",
            skills: row.skills ?? [],
            teams: row.teams ?? [],
            about: "",
            role: row.role || "member",
          },
        });
        ok += 1;
      } catch (e) {
        toast.error(`${row.email}: ${(e as Error).message}`);
      }
    }
    setImporting(false);
    setImportOpen(false);
    setImportPreview(null);
    qc.invalidateQueries({ queryKey: ["people"] });
    toast.success(`Đã nhập ${ok}/${importPreview.length} nhân sự`);
  };

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

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered, pageSize],
  );
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [query, department, role, location, tab, pageSize]);

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
    if (deletingId) deleteMutation.mutate(deletingId);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="people" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <FilterPageHeader
                crumbs={[{ label: "Trang chủ", to: "/tasks" }, { label: t("people.title") }]}
                title={t("people.title")}
                description={t("people.sub")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importPeople(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                >
                  <Upload className="h-4 w-4" /> {t("people.import")}
                </button>
                <button
                  onClick={exportPeopleCsv}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                >
                  <Download className="h-4 w-4" /> {t("people.export")}
                </button>
                <Link
                  to="/workspace/invite"
                  className="flex min-h-11 items-center gap-1.5 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-action-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> {t("people.add")}
                </Link>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:bg-surface-3">
                    {t("people.filter.more")} <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface border-border">
                  <DropdownMenuItem
                    onClick={() => {
                      setQuery("");
                      setDepartment("All");
                      setRole("All");
                      setLocation("All");
                      setPage(1);
                    }}
                    className="cursor-pointer focus:bg-surface-2"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" /> Xóa bộ lọc
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView(view === "grid" ? "list" : "grid")}
                    className="cursor-pointer focus:bg-surface-2"
                  >
                    {view === "grid" ? (
                      <List className="h-4 w-4 mr-2" />
                    ) : (
                      <Grid3x3 className="h-4 w-4 mr-2" />
                    )}
                    {view === "grid" ? "Xem dạng danh sách" : "Xem dạng lưới"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <Tab
                label={t("people.tab.all")}
                count={peopleList.length}
                active={tab === "all"}
                onClick={() => setTab("all")}
              />
              <Tab
                label={t("people.tab.teams")}
                count={new Set(peopleList.flatMap((p) => p.teams)).size}
                active={tab === "teams"}
                onClick={() => setTab("teams")}
              />
              <Tab
                label={t("people.tab.departments")}
                count={(data?.departments ?? []).length}
                active={tab === "departments"}
                onClick={() => setTab("departments")}
              />
              <Tab
                label={t("people.tab.positions")}
                count={new Set(peopleList.map((p) => p.title).filter((x) => x && x !== "—")).size}
                active={tab === "positions"}
                onClick={() => setTab("positions")}
              />
              <Tab
                label={t("people.tab.skills")}
                active={tab === "skills"}
                onClick={() => setTab("skills")}
              />
              <Tab
                label={t("people.tab.org")}
                active={tab === "org"}
                onClick={() => setTab("org")}
              />
            </div>

            {/* Cards / List */}
            {isPending ? (
              <div className="flex items-center justify-center rounded-xl border border-border bg-surface/40 py-16 text-sm text-muted-foreground">
                Đang tải danh sách nhân sự…
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-surface/40 py-16 text-sm text-destructive">
                Không tải được danh sách nhân sự.
                <button
                  onClick={() => refetch()}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
                >
                  Thử lại
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 py-16 text-sm text-muted-foreground">
                <UsersIcon className="mb-2 h-8 w-8 opacity-50" />
                {t("people.empty")}
              </div>
            ) : tab === "all" ? (
              view === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {paginated.map((p) => (
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
                  {paginated.map((p, i) => (
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
              )
            ) : tab === "teams" ? (
              <GroupByTeam people={filtered} onClick={(id) => setSelectedId(id)} />
            ) : tab === "departments" ? (
              <GroupByDepartment people={filtered} onClick={(id) => setSelectedId(id)} />
            ) : tab === "positions" ? (
              <GroupByPosition people={filtered} onClick={(id) => setSelectedId(id)} />
            ) : tab === "skills" ? (
              <SkillsView people={filtered} />
            ) : (
              <OrgView people={filtered} />
            )}

            {/* Pagination */}
            {tab === "all" && pageCount > 1 && (
              <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
                <div>
                  {t("people.showing")} {(page - 1) * pageSize + 1} -{" "}
                  {Math.min(page * pageSize, filtered.length)} {t("people.of")} {filtered.length}{" "}
                  {t("people.people")}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-8 min-w-8 rounded-lg bg-surface-2 px-2 text-xs hover:bg-surface-3 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs ${p === page ? "bg-primary text-primary-foreground" : "bg-surface-2 hover:bg-surface-3"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount}
                    className="h-8 min-w-8 rounded-lg bg-surface-2 px-2 text-xs hover:bg-surface-3 disabled:opacity-40"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </main>

          {/* Right panel */}
          {selectedId && selected && (
            <PersonPanel
              person={selected}
              peers={peopleList.filter((p) => p.id !== selected.id)}
              canManage={canManage || selected.id === data?.people.find((x) => x.isSelf)?.id}
              onEdit={() => handleEdit(selected)}
              onOpenDetail={() => navigate({ to: "/people/$id", params: { id: selected.id } })}
              onClose={() => setSelectedId("")}
            />
          )}
        </div>
      </div>
      <EditPersonDialog
        open={editOpen}
        person={editingPerson}
        onClose={() => {
          setEditOpen(false);
          setEditingPerson(null);
        }}
        canManageRole={canManage}
        saving={saveMutation.isPending}
        onSave={(updated) => saveMutation.mutate(updated)}
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

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
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
    <div
      className={`group flex flex-col gap-3 rounded-xl border bg-card text-left shadow-card transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/50 ${
        active ? "border-primary/70 ring-1 ring-primary/40" : "border-border"
      }`}
    >
      <button onClick={onClick} className="flex flex-col gap-3 p-4 text-left">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img
              src={avatar(p.seed)}
              alt={p.name}
              className="h-14 w-14 rounded-full object-cover"
            />
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
      </button>
      <div className="flex items-center gap-1 border-t border-border px-4 pb-4 pt-3">
        <IconBtn onClick={() => window.open(`/chat`, "_self")} title="Nhắn tin">
          <MessageCircle className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          onClick={() => window.open(`/email/compose?to=${encodeURIComponent(p.email)}`, "_self")}
          title="Gửi email"
        >
          <Mail className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => window.open(`tel:${p.phone.replace(/\s/g, "")}`)} title="Gọi điện">
          <Phone className="h-3.5 w-3.5" />
        </IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconBtn className="ml-auto" title="Thêm">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-surface border-border">
            <DropdownMenuItem
              onClick={() => window.open(`/calendar`, "_self")}
              className="cursor-pointer focus:bg-surface-2"
            >
              <Calendar className="h-4 w-4 mr-2" /> Lên lịch họp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="cursor-pointer focus:bg-surface-2">
              <Edit3 className="h-4 w-4 mr-2" /> Sửa
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-400"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
          <DropdownMenuItem
            onClick={onDelete}
            className="cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-400"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function IconBtn({
  children,
  className = "",
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      {children}
    </button>
  );
}

function PersonPanel({
  person,
  peers,
  canManage,
  onEdit,
  onOpenDetail,
  onClose,
}: {
  person: Person;
  peers: Person[];
  canManage: boolean;
  onEdit: () => void;
  onOpenDetail: () => void;
  onClose: () => void;
}) {
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
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-2"
        >
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

      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <button
          onClick={onOpenDetail}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface-3"
        >
          Xem hồ sơ
        </button>
        {canManage && (
          <button
            onClick={onEdit}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Chỉnh sửa
          </button>
        )}
        <IconBtn onClick={() => window.open(`/chat`, "_self")} title="Nhắn tin">
          <MessageCircle className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          onClick={() =>
            window.open(`/email/compose?to=${encodeURIComponent(person.email)}`, "_self")
          }
          title="Gửi email"
        >
          <Mail className="h-4 w-4" />
        </IconBtn>
        <IconBtn
          onClick={() => window.open(`tel:${person.phone.replace(/\s/g, "")}`)}
          title="Gọi điện"
        >
          <Phone className="h-4 w-4" />
        </IconBtn>
        <IconBtn onClick={() => window.open(`/calendar`, "_self")} title="Lên lịch">
          <Calendar className="h-4 w-4" />
        </IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconBtn title="Thêm">
              <MoreHorizontal className="h-4 w-4" />
            </IconBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-surface border-border">
            <DropdownMenuItem
              onClick={() => window.open(`/tasks`, "_self")}
              className="cursor-pointer focus:bg-surface-2"
            >
              <BriefcaseIcon className="h-4 w-4 mr-2" /> Giao việc
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(`/meeting`, "_self")}
              className="cursor-pointer focus:bg-surface-2"
            >
              <Video className="h-4 w-4 mr-2" /> Mời họp
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
        {tab === "overview" && <OverviewTab person={person} peers={peers} />}
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

function OverviewTab({ person, peers }: { person: Person; peers: Person[] }) {
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
        <SectionTitle>
          {t("people.panel.direct")} ({peers.length})
        </SectionTitle>
        <div className="flex -space-x-2">
          {peers.slice(0, 6).map((p) => (
            <img
              key={p.id}
              src={avatar(p.seed)}
              alt={p.name}
              title={p.name}
              className="h-8 w-8 rounded-full border-2 border-surface object-cover"
            />
          ))}
          {peers.length > 6 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] text-muted-foreground">
              +{peers.length - 6}
            </span>
          )}
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
      <button
        onClick={() => notifyComingSoon()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:bg-surface-3"
      >
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
        <button
          onClick={() => notifyComingSoon()}
          className="mt-4 w-full rounded-lg border border-border bg-surface-2 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
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
          <button
            onClick={() => notifyComingSoon()}
            className="text-[11px] text-primary hover:underline"
          >
            Xem tất cả
          </button>
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
              <button
                onClick={() => notifyComingSoon()}
                className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
              >
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
          <button
            onClick={() => notifyComingSoon()}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
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

function EditPersonDialog({
  open,
  person,
  canManageRole,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  person: Person | null;
  canManageRole: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (person: Person) => void;
}) {
  const empty = {
    name: "",
    email: "",
    phone: "",
    title: "",
    department: "",
    team: "",
    role: "member",
    location: "",
    empId: "",
    joinDate: "",
    reportsTo: "",
    skills: "",
    teams: "",
    about: "",
  };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (person) {
      setForm({
        name: person.name,
        email: person.email,
        phone: person.phone,
        title: person.title === "—" ? "" : person.title,
        department: person.department,
        team: person.team === "—" ? "" : person.team,
        role: person.role,
        location: person.location,
        empId: person.empId,
        joinDate: person.joinDate,
        reportsTo: person.reportsTo,
        skills: person.skills.join(", "),
        teams: person.teams.join(", "),
        about: person.about,
      });
    }
  }, [person]);

  const handleChange = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const split = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    onSave({
      ...person,
      name: form.name,
      phone: form.phone,
      title: form.title,
      department: form.department,
      team: form.team,
      role: form.role,
      location: form.location,
      empId: form.empId,
      joinDate: form.joinDate,
      reportsTo: form.reportsTo,
      about: form.about,
      skills: split(form.skills),
      teams: split(form.teams),
    });
  };

  const field = (label: string, key: keyof typeof form, placeholder = "", type = "text") => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => handleChange(key, e.target.value)}
        className="bg-surface-2"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto bg-surface">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Chỉnh sửa nhân sự</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("Họ và tên", "name", "Nguyễn Văn A")}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input value={form.email} disabled className="bg-surface-2 opacity-70" />
            </div>
            {field("Số điện thoại", "phone", "(+84) 912 345 678", "tel")}
            {field("Chức danh", "title", "Senior Developer")}
            {field("Phòng ban", "department", "Engineering")}
            {field("Nhóm", "team", "Platform Team")}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vai trò</label>
              <select
                value={form.role}
                disabled={!canManageRole}
                onChange={(e) => handleChange("role", e.target.value)}
                className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              >
                {TENANT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {field("Địa điểm", "location", "Hà Nội")}
            {field("Mã nhân viên", "empId", "UNI-0000")}
            {field("Ngày vào làm", "joinDate", "", "date")}
            {field("Quản lý trực tiếp", "reportsTo", "Nguyễn Văn B")}
          </div>
          {field("Kỹ năng (phân tách bằng dấu phẩy)", "skills", "React, SQL, Figma")}
          {field("Nhóm tham gia (phân tách bằng dấu phẩy)", "teams", "Platform, Growth")}
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
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ========== Grouped tab views ==========

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item) || "Chưa phân loại";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

function GroupByTeam({ people, onClick }: { people: Person[]; onClick: (id: string) => void }) {
  const groups = groupBy(people, (p) => p.team);
  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map(([team, members]) => (
        <div
          key={team}
          className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{team}</h3>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {members.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((p) => (
              <button
                key={p.id}
                onClick={() => onClick(p.id)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-left text-xs hover:bg-surface-3"
              >
                <img src={avatar(p.seed)} alt={p.name} className="h-6 w-6 rounded-full" />
                <span className="font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupByDepartment({
  people,
  onClick,
}: {
  people: Person[];
  onClick: (id: string) => void;
}) {
  const groups = groupBy(people, (p) => p.department);
  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map(([dept, members]) => (
        <div
          key={dept}
          className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{dept}</h3>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {members.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {members.map((p) => (
              <button
                key={p.id}
                onClick={() => onClick(p.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupByPosition({ people, onClick }: { people: Person[]; onClick: (id: string) => void }) {
  const groups = groupBy(people, (p) => p.title);
  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map(([title, members]) => (
        <div
          key={title}
          className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {members.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((p) => (
              <button
                key={p.id}
                onClick={() => onClick(p.id)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-left text-xs hover:bg-surface-3"
              >
                <img src={avatar(p.seed)} alt={p.name} className="h-6 w-6 rounded-full" />
                <span className="font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsView({ people }: { people: Person[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    people.forEach((p) =>
      p.skills.forEach((s) => {
        map.set(s, (map.get(s) || 0) + 1);
      }),
    );
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [people]);
  const max = counts[0]?.[1] ?? 1;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <Award className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Kỹ năng phổ biến</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map(([skill, count]) => (
          <div key={skill} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{skill}</span>
              <span className="text-xs text-muted-foreground">{count} người</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgView({ people }: { people: Person[] }) {
  const byName = useMemo(() => {
    const map = new Map<string, Person>();
    people.forEach((p) => map.set(p.name, p));
    return map;
  }, [people]);

  const tree = useMemo(() => {
    const roots: Person[] = [];
    const children = new Map<string, Person[]>();
    people.forEach((p) => {
      const manager = p.reportsTo?.trim();
      if (manager && byName.has(manager)) {
        if (!children.has(manager)) children.set(manager, []);
        children.get(manager)!.push(p);
      } else {
        roots.push(p);
      }
    });
    return { roots, children };
  }, [people, byName]);

  const renderNode = (p: Person, depth = 0) => (
    <div key={p.id} className="relative">
      <div
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
        style={{ marginLeft: depth * 24 }}
      >
        <img src={avatar(p.seed)} alt={p.name} className="h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {p.title} · {p.team}
          </div>
        </div>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
          {p.department}
        </span>
      </div>
      {tree.children.get(p.name)?.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-3">
      {tree.roots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/40 py-12 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu cấu trúc báo cáo.
        </div>
      ) : (
        tree.roots.map((p) => renderNode(p))
      )}
    </div>
  );
}
