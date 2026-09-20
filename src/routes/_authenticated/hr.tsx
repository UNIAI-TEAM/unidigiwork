// QUẢN LÝ NHÂN SỰ — hồ sơ thành viên thật (bộ phận, vai trò) và danh bạ nhân sự AI.
// Dữ liệu ở đây là nguồn "vai trò thật" mà Bộ não AI đọc khi đào tạo lại.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { listPeople, upsertPersonProfile, removePerson } from "@/lib/api/people.functions";
import {
  listTenantAiWorkers,
  upsertTenantAiWorker,
  deleteTenantAiWorker,
  importAiWorkers,
} from "@/lib/api/ai-workforce.functions";
import { importPeopleProfiles } from "@/lib/api/people.functions";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "Quản lý nhân sự — UNIWORK" },
      {
        name: "description",
        content:
          "Thêm, sửa, xóa hồ sơ nhân sự, gán bộ phận và vai trò để Bộ não AI đề xuất sát thực tế.",
      },
      { property: "og:title", content: "Quản lý nhân sự — UNIWORK" },
      {
        property: "og:description",
        content: "Hồ sơ nhân sự, bộ phận và vai trò — nguồn dữ liệu thật cho Bộ não AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HrPage,
});

type WorkerDraft = {
  id: string | null;
  name: string;
  role: string;
  skills: string;
  status: "ACTIVE" | "INACTIVE";
};

const emptyWorker = (): WorkerDraft => ({
  id: null,
  name: "",
  role: "",
  skills: "",
  status: "ACTIVE",
});

const ROLE_OPTIONS = [
  { value: "tenant_owner", label: "Chủ sở hữu" },
  { value: "tenant_admin", label: "Quản trị" },
  { value: "tenant_member", label: "Thành viên" },
];

function HrPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWs = workspaceId ?? workspaces?.[0]?.id ?? "";

  const [tab, setTab] = useState<"members" | "roster">("members");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ department: "", title: "", role: "" });
  const [workerDraft, setWorkerDraft] = useState<WorkerDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const peopleFn = useServerFn(listPeople);
  const upsertFn = useServerFn(upsertPersonProfile);
  const removeFn = useServerFn(removePerson);
  const rosterFn = useServerFn(listTenantAiWorkers);
  const saveWorkerFn = useServerFn(upsertTenantAiWorker);
  const deleteWorkerFn = useServerFn(deleteTenantAiWorker);
  const importWorkersFn = useServerFn(importAiWorkers);
  const importPeopleFn = useServerFn(importPeopleProfiles);

  const peopleQuery = useQuery({ queryKey: ["people"], queryFn: () => peopleFn() });
  const rosterQuery = useQuery({
    queryKey: ["ai-roster", activeWs],
    queryFn: () => rosterFn({ data: { workspaceId: activeWs } }),
    enabled: Boolean(activeWs),
  });

  const people = peopleQuery.data?.people ?? [];
  const canManage = peopleQuery.data?.canManage ?? false;
  const roster = rosterQuery.data ?? [];
  const departments = useMemo(
    () => Array.from(new Set(people.map((p) => p.department).filter(Boolean))).sort(),
    [people],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
    void qc.invalidateQueries({ queryKey: ["ai-roster"] });
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    void qc.invalidateQueries({ queryKey: ["ceo"] });
  };

  const saveMember = useMutation({
    mutationFn: (userId: string) =>
      upsertFn({
        data: {
          userId,
          department: form.department,
          title: form.title,
          ...(canManage && form.role ? { role: form.role } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật hồ sơ nhân sự.");
      setEditing(null);
      invalidate();
    },
    onError: () => toast.error("Không cập nhật được hồ sơ."),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Đã gỡ nhân sự khỏi tổ chức.");
      invalidate();
    },
    onError: () => toast.error("Không gỡ được nhân sự."),
  });

  const saveWorker = useMutation({
    mutationFn: (draft: WorkerDraft) =>
      saveWorkerFn({
        data: {
          workspaceId: activeWs,
          id: draft.id,
          name: draft.name.trim(),
          role: draft.role.trim(),
          skills: draft.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 30),
          status: draft.status,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu hồ sơ nhân sự.");
      setWorkerDraft(null);
      invalidate();
    },
    onError: () => toast.error("Không lưu được hồ sơ nhân sự."),
  });

  const deleteWorker = useMutation({
    mutationFn: (id: string) => deleteWorkerFn({ data: { workspaceId: activeWs, id } }),
    onSuccess: (res) => {
      toast.success(
        res.deactivated ? "Hồ sơ còn công việc nên đã chuyển sang ngừng hoạt động." : "Đã xóa hồ sơ.",
      );
      invalidate();
    },
    onError: () => toast.error("Không xóa được hồ sơ."),
  });

  async function onImport(file: File, kind: "members" | "roster") {
    setBusy(true);
    try {
      const { readXlsxRows, readCsvRows } = await import("@/lib/xlsx-read");
      const rows: string[][] = file.name.toLowerCase().endsWith(".csv")
        ? readCsvRows(await file.text())
        : readXlsxRows(await file.arrayBuffer());
      if (rows.length < 2) throw new Error("Tệp không có dữ liệu.");
      const header = rows[0]!.map((h: string) => h.trim().toLowerCase());
      const at = (row: string[], names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0 && row[i]) return row[i]!.trim();
        }
        return "";
      };
      const body = rows.slice(1).filter((r: string[]) => r.some((c: string) => c.trim()));

      if (kind === "members") {
        const payload = body
          .map((r: string[]) => ({
            email: at(r, ["email", "thư điện tử", "e-mail"]),
            displayName: at(r, ["name", "họ tên", "tên"]) || null,
            department: at(r, ["department", "bộ phận", "phòng ban"]) || null,
            title: at(r, ["title", "chức danh"]) || null,
            team: at(r, ["team", "nhóm"]) || null,
            location: at(r, ["location", "địa điểm"]) || null,
            phone: at(r, ["phone", "điện thoại"]) || null,
            empId: at(r, ["employee id", "mã nhân viên", "empid"]) || null,
          }))
          .filter((r: { email: string }) => r.email.includes("@"))
          .slice(0, 500);
        if (!payload.length) throw new Error("Không tìm thấy cột email hợp lệ.");
        const res = await importPeopleFn({ data: { rows: payload } });
        toast.success(
          `Đã cập nhật ${res.updated} hồ sơ.${res.notFound.length ? ` Chưa là thành viên: ${res.notFound.join(", ")}` : ""}`,
        );
      } else {
        const payload = body
          .map((r: string[]) => ({
            code: at(r, ["code", "mã"]) || null,
            name: at(r, ["name", "họ tên", "tên"]),
            role: at(r, ["role", "vai trò", "chức danh"]) || null,
            skills: (at(r, ["skills", "kỹ năng"]) || "")
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 30),
            status: at(r, ["status", "trạng thái"]) || null,
          }))
          .filter((r: { name: string }) => r.name)
          .slice(0, 200);
        if (!payload.length) throw new Error("Không tìm thấy cột tên hợp lệ.");
        const res = await importWorkersFn({ data: { workspaceId: activeWs, rows: payload } });
        toast.success(`Đã thêm ${res.created}, cập nhật ${res.updated} hồ sơ nhân sự.`);
      }
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đọc được tệp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="people" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                <Users className="h-5 w-5 text-primary" aria-hidden />
                Quản lý nhân sự
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Hồ sơ, bộ phận và vai trò thật. Bộ não AI đọc dữ liệu này khi đào tạo lại.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/ai-brain">Mở Bộ não AI</Link>
            </Button>
          </header>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "members" ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setTab("members")}
            >
              Thành viên ({people.length})
            </Button>
            <Button
              variant={tab === "roster" ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setTab("roster")}
            >
              Danh bạ nhân sự AI ({roster.length})
            </Button>
          </div>

          {tab === "members" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="sr-only"
                    disabled={busy || !canManage}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void onImport(f, "members");
                    }}
                  />
                  <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    Nhập bộ phận từ Excel
                  </span>
                </label>
                <span className="text-xs text-muted-foreground">
                  Cột: email, họ tên, bộ phận, chức danh
                </span>
              </div>

              <ul className="space-y-2">
                {people.map((p) => (
                  <li key={p.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.department ? <Badge variant="secondary">{p.department}</Badge> : null}
                          {p.title ? <Badge variant="outline">{p.title}</Badge> : null}
                          <Badge variant="outline">{p.role}</Badge>
                        </div>
                      </div>
                      {canManage ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="min-h-11"
                            onClick={() => {
                              setEditing(p.id);
                              setForm({
                                department: p.department,
                                title: p.title,
                                role: p.role,
                              });
                            }}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Sửa
                          </Button>
                          {!p.isSelf ? (
                            <Button
                              variant="outline"
                              className="min-h-11 text-destructive"
                              onClick={() => removeMember.mutate(p.id)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Gỡ khỏi tổ chức</span>
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!people.length && !peopleQuery.isLoading ? (
                  <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Chưa có thành viên nào trong tổ chức.
                  </li>
                ) : null}
              </ul>
            </section>
          ) : (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button className="min-h-11" onClick={() => setWorkerDraft(emptyWorker())}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Thêm hồ sơ
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="sr-only"
                    disabled={busy || !activeWs}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void onImport(f, "roster");
                    }}
                  />
                  <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    Nhập từ Excel
                  </span>
                </label>
              </div>

              <ul className="space-y-2">
                {roster.map((w) => (
                  <li key={w.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.code} · {w.role}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant={w.status === "ACTIVE" ? "secondary" : "outline"}>
                            {w.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}
                          </Badge>
                          {(w.skills ?? []).slice(0, 4).map((s) => (
                            <Badge key={s} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="min-h-11"
                          onClick={() =>
                            setWorkerDraft({
                              id: w.id,
                              name: w.name,
                              role: w.role,
                              skills: (w.skills ?? []).join(", "),
                              status: w.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
                            })
                          }
                        >
                          <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Sửa
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-11 text-destructive"
                          onClick={() => deleteWorker.mutate(w.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Xóa hồ sơ</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
                {!roster.length && !rosterQuery.isLoading ? (
                  <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Chưa có hồ sơ nhân sự nào. Thêm mới hoặc nhập từ Excel.
                  </li>
                ) : null}
              </ul>
            </section>
          )}
        </main>
      </div>

      {/* Sửa hồ sơ thành viên thật */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa hồ sơ nhân sự</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hr-dep">Bộ phận</Label>
              <Input
                id="hr-dep"
                value={form.department}
                list="hr-departments"
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              />
              <datalist id="hr-departments">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-title">Chức danh</Label>
              <Input
                id="hr-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-role">Vai trò trong tổ chức</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger id="hr-role" className="min-h-11">
                  <SelectValue placeholder="Chọn vai trò" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button
              className="min-h-11"
              disabled={saveMember.isPending}
              onClick={() => editing && saveMember.mutate(editing)}
            >
              {saveMember.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thêm / sửa hồ sơ nhân sự AI */}
      <Dialog open={Boolean(workerDraft)} onOpenChange={(o) => !o && setWorkerDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{workerDraft?.id ? "Sửa hồ sơ" : "Thêm hồ sơ nhân sự"}</DialogTitle>
          </DialogHeader>
          {workerDraft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-name">Họ tên</Label>
                <Input
                  id="w-name"
                  value={workerDraft.name}
                  onChange={(e) =>
                    setWorkerDraft({ ...workerDraft, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-role">Vai trò</Label>
                <Input
                  id="w-role"
                  value={workerDraft.role}
                  onChange={(e) => setWorkerDraft({ ...workerDraft, role: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-skills">Kỹ năng (cách nhau bởi dấu phẩy)</Label>
                <Input
                  id="w-skills"
                  value={workerDraft.skills}
                  onChange={(e) => setWorkerDraft({ ...workerDraft, skills: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-status">Trạng thái</Label>
                <Select
                  value={workerDraft.status}
                  onValueChange={(v) =>
                    setWorkerDraft({ ...workerDraft, status: v as "ACTIVE" | "INACTIVE" })
                  }
                >
                  <SelectTrigger id="w-status" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Đang hoạt động</SelectItem>
                    <SelectItem value="INACTIVE">Ngừng hoạt động</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setWorkerDraft(null)}>
              Hủy
            </Button>
            <Button
              className="min-h-11"
              disabled={saveWorker.isPending || !workerDraft?.name.trim() || !activeWs}
              onClick={() => workerDraft && saveWorker.mutate(workerDraft)}
            >
              {saveWorker.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
