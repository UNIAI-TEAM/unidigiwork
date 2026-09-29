import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Network, Plus, UserPlus } from "lucide-react";
import {
  inviteSchoolStaff,
  listSchoolDepartments,
  saveSchoolDepartment,
} from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type InviteRole = "tenant_admin" | "manager" | "member";

/** Nút + hộp thoại quản lý tổ chức ngay trên trang Điều hành: tạo tổ và mời thành viên. */
export function SchoolOrgDialogButton() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listSchoolDepartments);
  const saveFn = useServerFn(saveSchoolDepartment);
  const inviteFn = useServerFn(inviteSchoolStaff);
  const q = useQuery({ queryKey: ["school-departments"], queryFn: () => listFn(), enabled: open });
  const depts = q.data?.departments ?? [];

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [dept, setDept] = useState<string>("");
  const [link, setLink] = useState<string | null>(null);

  const err = (e: unknown) => {
    const k = `sorg.err.${e instanceof Error ? e.message : ""}`;
    const v = t(k as never);
    return v === k ? t("sorg.err.FAILED") : v;
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["school-departments"] });
    qc.invalidateQueries({ queryKey: ["school-staff"] });
    qc.invalidateQueries({ queryKey: ["school-ops"] });
  };

  const create = useMutation({
    mutationFn: () => saveFn({ data: { id: null, name: name.trim(), description: desc.trim() || null } }),
    onSuccess: () => {
      toast.success(t("sorg.saved"));
      setName("");
      setDesc("");
      refresh();
    },
    onError: (e) => toast.error(err(e)),
  });

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({ data: { rows: [{ email: email.trim(), role, department: dept || null }], correlationId: crypto.randomUUID() } }),
    onSuccess: (res) => {
      const r = res[0];
      if (r?.token) {
        setLink(`${window.location.origin}/invite/${r.token}`);
        toast.success(t("sst.invited").replace("{n}", "1"));
        setEmail("");
        refresh();
      } else {
        toast.error(err(new Error(r?.error ?? "FAILED")));
      }
    },
    onError: (e) => toast.error(err(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 gap-2">
          <Network className="h-4 w-4" /> {t("sorg.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sorg.title")}</DialogTitle>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t("sorg.new")}</h3>
          <Input className="h-11" maxLength={80} placeholder={t("sorg.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="h-11" maxLength={300} placeholder={t("sorg.descField")} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button className="min-h-11 gap-2" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> {t("sorg.create")}
          </Button>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{t("sorg.invite")}</h3>
          <Input className="h-11" type="email" placeholder={t("sorg.inviteEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("sst.role.teacher")}</SelectItem>
                <SelectItem value="manager">{t("sst.role.lead")}</SelectItem>
                <SelectItem value="tenant_admin">{t("sst.role.bgh")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("sorg.pickDept")} /></SelectTrigger>
              <SelectContent>
                {depts.map((x) => (
                  <SelectItem key={x.id} value={x.name}>{x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-11 gap-2" disabled={!email.trim() || invite.isPending} onClick={() => invite.mutate()}>
            <UserPlus className="h-4 w-4" /> {t("sorg.inviteSend")}
          </Button>
          {link && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 shrink-0 gap-1.5"
                aria-label={t("sst.copy")}
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  toast.success(t("sst.copy"));
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("sst.copy")}</span>
              </Button>
            </div>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          <Link to="/school-org" className="underline underline-offset-2" onClick={() => setOpen(false)}>
            {t("sorg.manageFull")}
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
