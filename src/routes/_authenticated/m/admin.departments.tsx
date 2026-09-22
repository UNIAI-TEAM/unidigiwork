import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Network, UserRound } from "lucide-react";
import { toast } from "sonner";
import { listPeople, upsertPersonProfile, type PersonDTO } from "@/lib/api/people.functions";
import { MobileAdminLayout, MobileAdminLoading, MobileAdminMessage, ReadOnlyNotice } from "@/components/mobile/mobile-admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/departments")({
  head: () => ({ meta: [
    { title: "Quản lý bộ phận mobile — UNIWORK" }, { name: "description", content: "Quản lý bộ phận và phân công thành viên theo tổ chức trên PWA UNIWORK." },
    { property: "og:title", content: "Quản lý bộ phận mobile — UNIWORK" }, { property: "og:description", content: "Quản lý bộ phận và phân công thành viên theo tổ chức trên PWA UNIWORK." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: MobileDepartments,
});

function MobileDepartments() {
  const { t } = useI18n();
  const listFn = useServerFn(listPeople), saveFn = useServerFn(upsertPersonProfile), qc = useQueryClient();
  const query = useQuery({ queryKey: ["m-admin-departments"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<PersonDTO | null>(null), [department, setDepartment] = useState("");
  const save = useMutation({ mutationFn: (person: PersonDTO) => saveFn({ data: { userId: person.id, displayName: person.name, title: person.title, department: department.trim(), team: person.team, location: person.location, phone: person.phone, empId: person.empId, joinDate: person.joinDate, reportsTo: person.reportsTo, skills: person.skills, teams: person.teams, about: person.about } }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["m-admin-departments"] }); setSelected(null); toast.success(t("m.admin.departmentSaved")); }, onError: () => toast.error(t("m.admin.departmentError")) });
  const groups = useMemo(() => { const map = new Map<string, PersonDTO[]>(); for (const person of query.data?.people ?? []) { const key = person.department || t("m.admin.departmentNone"); map.set(key, [...(map.get(key) ?? []), person]); } return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)); }, [query.data?.people, t]);
  return <MobileAdminLayout title={t("m.admin.departments")} subtitle={t("m.admin.departmentsHint")} backTo="/m/admin">
    {query.data && !query.data.canManage ? <ReadOnlyNotice /> : null}
    {query.isLoading ? <MobileAdminLoading /> : query.isError ? <MobileAdminMessage retry={() => void query.refetch()}>{t("m.admin.departmentError")}</MobileAdminMessage> : null}
    <div className="grid gap-4">{groups.map(([name, people]) => <section key={name}><div className="mb-2 flex items-center gap-2"><Network className="h-4 w-4" /><h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</h2><Badge variant="outline">{t("m.admin.departmentMembers").replace("{count}", String(people.length))}</Badge></div><div className="grid gap-2">{people.map((person) => <button type="button" key={person.id} disabled={!query.data?.canManage} onClick={() => { setSelected(person); setDepartment(person.department); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border p-3 text-left disabled:opacity-70"><UserRound className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.name}</span><span className="block truncate text-xs text-muted-foreground">{person.title || person.email}</span></span></button>)}</div></section>)}</div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{t("m.admin.departmentAssign")}</DialogTitle><DialogDescription>{selected?.name}</DialogDescription></DialogHeader><div className="grid gap-2"><Label htmlFor="department">{t("m.admin.departmentName")}</Label><Input id="department" value={department} onChange={(event) => setDepartment(event.target.value)} className="min-h-11" list="department-list" /><datalist id="department-list">{query.data?.departments.map((value) => <option key={value} value={value} />)}</datalist></div><DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setSelected(null)}>{t("m.admin.cancel")}</Button><Button className="min-h-11" disabled={!selected || save.isPending} onClick={() => selected && save.mutate(selected)}>{t("m.admin.save")}</Button></DialogFooter></DialogContent></Dialog>
  </MobileAdminLayout>;
}