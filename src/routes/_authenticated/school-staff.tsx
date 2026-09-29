import { withAppShell } from "@/components/page-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Copy, Filter, Upload, UserPlus, Users, X } from "lucide-react";
import {
  getSchoolStaff,
  inviteSchoolStaff,
  listSchoolDepartments,
  updateSchoolStaff,
  type SchoolStaff,
} from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/school-staff")({
  head: () => ({
    meta: [
      { title: "Nhân sự trường học — UNIWORK" },
      { name: "description", content: "Quản lý Ban Giám hiệu, tổ trưởng và giáo viên theo tổ chuyên môn." },
      { property: "og:title", content: "Nhân sự trường học — UNIWORK" },
      { property: "og:description", content: "Quản lý Ban Giám hiệu, tổ trưởng và giáo viên theo tổ chuyên môn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(SchoolStaffPage),
});

type Role = "tenant_admin" | "manager" | "member";
type InviteRow = { email: string; role: Role; department: string | null };

const ROLE_KEYS: Record<string, string> = {
  tenant_owner: "sst.role.principal",
  tenant_admin: "sst.role.bgh",
  manager: "sst.role.lead",
  member: "sst.role.teacher",
  guest: "sst.role.teacher",
};

function parseRole(v: string): Role {
  const x = v.trim().toLowerCase();
  if (["bgh", "ban giám hiệu", "admin", "tenant_admin", "phó hiệu trưởng"].includes(x)) return "tenant_admin";
  if (["tổ trưởng", "to truong", "lead", "manager"].includes(x)) return "manager";
  return "member";
}

/** CSV/dán: mỗi dòng "email, vai trò, tổ" (vai trò/tổ có thể bỏ trống). */
function parseList(text: string): InviteRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/[,;\t]/).map((c) => c.trim()))
    .filter((c) => c[0] && c[0].includes("@"))
    .slice(0, 200)
    .map((c) => ({ email: c[0].toLowerCase(), role: parseRole(c[1] ?? ""), department: c[2] || null }));
}

function SchoolStaffPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fetchStaff = useServerFn(getSchoolStaff);
  const update = useServerFn(updateSchoolStaff);
  const invite = useServerFn(inviteSchoolStaff);
  const q = useQuery({ queryKey: ["school-staff"], queryFn: () => fetchStaff() });
  const d = q.data;
  const deptFn = useServerFn(listSchoolDepartments);
  const dq = useQuery({ queryKey: ["school-departments"], queryFn: () => deptFn() });
  const isBgh = d?.enabled && d.role === "bgh";

  const depts = useMemo(
    () => [...new Set([...(dq.data?.departments ?? []).map((x) => x.name), ...(d?.staff ?? []).map((s) => s.department).filter((x): x is string => !!x)])].sort(),
    [d, dq.data],
  );
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtered = useMemo(() => {
    const all = d?.staff ?? [];
    return all.filter((s) => {
      if (deptFilter && (s.department ?? "") !== deptFilter) return false;
      if (roleFilter === "tenant_admin") return ["tenant_owner", "tenant_admin"].includes(s.role);
      if (roleFilter === "manager") return s.role === "manager";
      if (roleFilter === "member") return ["member", "guest"].includes(s.role);
      return true;
    });
  }, [d, roleFilter, deptFilter]);
  const activeFilterCount = (roleFilter ? 1 : 0) + (deptFilter ? 1 : 0);
  const groups = useMemo(() => {
    const m = new Map<string, SchoolStaff[]>();
    for (const s of filtered) {
      const k = s.department ?? "";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
  }, [filtered]);

  const errMsg = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    const k = `sst.err.${m}`;
    const v = t(k as never);
    return v === k ? t("sst.err.FAILED") : v;
  };

  const save = useMutation({
    mutationFn: (v: { userId: string; role: Role | null; department: string | null }) =>
      update({ data: { ...v, correlationId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(t("sst.saved"));
      qc.invalidateQueries({ queryKey: ["school-staff"] });
      qc.invalidateQueries({ queryKey: ["school-ops"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const [one, setOne] = useState<InviteRow>({ email: "", role: "member", department: null });
  const [bulk, setBulk] = useState("");
  const [links, setLinks] = useState<Array<{ email: string; url?: string; error?: string }>>([]);
  const inv = useMutation({
    mutationFn: (rows: InviteRow[]) => invite({ data: { rows, correlationId: crypto.randomUUID() } }),
    onSuccess: (res) => {
      setLinks(res.map((r) => ({ email: r.email, url: r.token ? `${window.location.origin}/invite/${r.token}` : undefined, error: r.error })));
      const ok = res.filter((r) => r.token).length;
      toast.success(t("sst.invited").replace("{n}", String(ok)));
      setOne({ email: "", role: "member", department: null });
      setBulk("");
      qc.invalidateQueries({ queryKey: ["school-staff"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const bulkRows = parseList(bulk);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 512 * 1024) return toast.error(t("sst.fileTooBig"));
    setBulk(await f.text());
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("sst.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("sst.desc")}</p>
          </div>
        </div>
        <Link to="/school-ops" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm hover:bg-accent">
          <ArrowLeft className="h-4 w-4" /> {t("nav.schoolOps")}
        </Link>
      </header>

      {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
      {q.isError && <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{t("sst.err.FAILED")}</p>}
      {d && !d.enabled && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p>}

      {d?.enabled && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {(["sst.role.bgh", "sst.role.lead", "sst.role.teacher"] as const).map((k, i) => {
              const n = d.staff.filter((s) =>
                i === 0 ? ["tenant_owner", "tenant_admin"].includes(s.role) : i === 1 ? s.role === "manager" : ["member", "guest"].includes(s.role),
              ).length;
              return (
                <div key={k} className="rounded-xl border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{t(k)}</p>
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(`${k}.desc`)}</p>
                </div>
              );
            })}
          </section>

          {isBgh && (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-semibold"><UserPlus className="h-4 w-4" />{t("sst.inviteOne")}</h2>
                <Input className="h-11" type="email" placeholder={t("sst.email")} value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <RoleSelect value={one.role} onChange={(role) => setOne({ ...one, role })} allowAdmin={d.isOwner} />
                  <DeptInput value={one.department} depts={depts} onChange={(department) => setOne({ ...one, department })} />
                </div>
                <Button className="min-h-11" disabled={!one.email.includes("@") || inv.isPending} onClick={() => inv.mutate([one])}>
                  {t("sst.sendInvite")}
                </Button>
              </div>
              <div className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-semibold"><Upload className="h-4 w-4" />{t("sst.inviteBulk")}</h2>
                <p className="text-xs text-muted-foreground">{t("sst.bulkHint")}</p>
                <Textarea rows={5} className="font-mono text-xs" placeholder={"gv.toan@truong.edu.vn, giáo viên, Tổ Toán\ntt.van@truong.edu.vn, tổ trưởng, Tổ Ngữ văn"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm hover:bg-accent">
                    {t("sst.chooseFile")}
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                  <Button className="min-h-11" disabled={bulkRows.length === 0 || inv.isPending} onClick={() => inv.mutate(bulkRows.filter((r) => d.isOwner || r.role !== "tenant_admin"))}>
                    {t("sst.sendBulk").replace("{n}", String(bulkRows.length))}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-1 text-base font-semibold">{t("sst.links")}</h2>
              <p className="mb-3 text-xs text-muted-foreground">{t("sst.linksHint")}</p>
              <ul className="space-y-2 text-sm">
                {links.map((l) => (
                  <li key={l.email} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span className="min-w-0 break-all">{l.email}</span>
                    {l.url ? (
                      <Button variant="outline" className="h-11 gap-2" onClick={() => { navigator.clipboard.writeText(l.url!); toast.success(t("sst.copied")); }}>
                        <Copy className="h-4 w-4" /> {t("sst.copy")}
                      </Button>
                    ) : (
                      <span className="text-xs text-destructive">{errMsg(new Error(l.error))}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4">
            {groups.map(([dept, rows]) => (
              <div key={dept || "_none"} className="rounded-xl border bg-card shadow-sm">
                <h3 className="border-b px-4 py-3 text-sm font-semibold">
                  {dept || t("sst.noDeptGroup")} <span className="font-normal text-muted-foreground">· {rows.length}</span>
                </h3>
                <ul className="divide-y">
                  {rows.map((s) => (
                    <StaffRow key={s.user_id} s={s} editable={!!isBgh} allowAdmin={d.isOwner} depts={depts} busy={save.isPending}
                      onSave={(role, department) => save.mutate({ userId: s.user_id, role, department })} />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {isBgh && d.invites.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">{t("sst.pending")}</h2>
              <ul className="space-y-2 text-sm">
                {d.invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span className="min-w-0 break-all">{i.email}</span>
                    <span className="text-xs text-muted-foreground">{t((ROLE_KEYS[i.role] ?? "sst.role.teacher") as never)}{i.department ? ` · ${i.department}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StaffRow({ s, editable, allowAdmin, depts, busy, onSave }: {
  s: SchoolStaff; editable: boolean; allowAdmin: boolean; depts: string[]; busy: boolean;
  onSave: (role: Role | null, dept: string | null) => void;
}) {
  const { t } = useI18n();
  const [role, setRole] = useState<string>(s.role);
  const [dept, setDept] = useState<string | null>(s.department);
  const dirty = role !== s.role || (dept ?? "") !== (s.department ?? "");
  const owner = s.role === "tenant_owner";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.display_name || s.email || "—"}</p>
        <p className="truncate text-xs text-muted-foreground">{s.email}</p>
      </div>
      {editable ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {owner ? (
            <span className="text-xs text-muted-foreground">{t("sst.role.principal")}</span>
          ) : (
            <RoleSelect value={role as Role} onChange={setRole} allowAdmin={allowAdmin || s.role === "tenant_admin"} />
          )}
          <DeptInput value={dept} depts={depts} onChange={setDept} />
          <Button className="h-11" disabled={!dirty || busy} onClick={() => onSave(owner || role === s.role ? null : (role as Role), dept)}>
            {t("sst.save")}
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{t((ROLE_KEYS[s.role] ?? "sst.role.teacher") as never)}</span>
      )}
    </li>
  );
}

function RoleSelect({ value, onChange, allowAdmin }: { value: Role; onChange: (r: Role) => void; allowAdmin: boolean }) {
  const { t } = useI18n();
  return (
    <select
      aria-label={t("sst.roleLabel")}
      className="h-11 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      {(allowAdmin || value === "tenant_admin") && <option value="tenant_admin">{t("sst.role.bgh")}</option>}
      <option value="manager">{t("sst.role.lead")}</option>
      <option value="member">{t("sst.role.teacher")}</option>
    </select>
  );
}

function DeptInput({ value, depts, onChange }: { value: string | null; depts: string[]; onChange: (v: string | null) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Input
        aria-label={t("sst.dept")}
        list="school-depts"
        className="h-11 sm:w-44"
        placeholder={t("sst.dept")}
        maxLength={80}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
      />
      <datalist id="school-depts">
        {depts.map((x) => <option key={x} value={x} />)}
      </datalist>
    </>
  );
}
