// Quản lý đồng nghiệp thật: mời (tạo), sửa hồ sơ/tên/vai trò, gỡ khỏi tổ chức.
// Tên cập nhật ở đây đồng bộ ngay vào phòng chat và Work Graph (đọc từ users.display_name).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MailPlus, Pencil, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  listPeople,
  removePerson,
  upsertPersonProfile,
  type PersonDTO,
} from "@/lib/api/people.functions";
import { createInvitation } from "@/lib/api/tenants.functions";

type TenantRole = "tenant_admin" | "manager" | "member" | "guest";
const ROLES: TenantRole[] = ["tenant_admin", "manager", "member", "guest"];

/** Mọi nơi hiển thị tên đồng nghiệp đều phải làm mới sau khi sửa. */
const SYNC_KEYS = [
  ["people"],
  ["m-people"],
  ["m-person"],
  ["chat-dm-people"],
  ["chat-manager-people"],
  ["native-chat-channels"],
  ["mobile-chat-channels"],
  ["work-graph"],
  ["m-work-graph"],
  ["task-ops"],
];

export function ColleagueManagerButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PersonDTO | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("member");

  const fetchPeople = useServerFn(listPeople);
  const saveProfile = useServerFn(upsertPersonProfile);
  const removeMember = useServerFn(removePerson);
  const invite = useServerFn(createInvitation);

  const peopleQuery = useQuery({
    queryKey: ["colleague-manager", "people"],
    queryFn: () => fetchPeople(),
    enabled: open,
    staleTime: 10_000,
  });

  const canManage = peopleQuery.data?.canManage ?? false;
  const tenantId = peopleQuery.data?.tenantId ?? null;

  const rows = useMemo(() => {
    const all = peopleQuery.data?.people ?? [];
    const s = q.trim().toLowerCase();
    return s
      ? all.filter((p) => `${p.name} ${p.email} ${p.department}`.toLowerCase().includes(s))
      : all;
  }, [peopleQuery.data, q]);

  const syncAll = () => {
    qc.invalidateQueries({ queryKey: ["colleague-manager", "people"] });
    for (const key of SYNC_KEYS) qc.invalidateQueries({ queryKey: key });
  };

  const inviteMut = useMutation({
    mutationFn: () =>
      invite({
        data: {
          tenantId: tenantId!,
          email: inviteEmail.trim(),
          role: inviteRole,
          ttlSeconds: 60 * 60 * 24 * 7,
          metadata: { idempotencyKey: crypto.randomUUID() },
        },
      }),
    onSuccess: () => {
      toast.success(t("people.manage.invited"));
      setInviteEmail("");
      syncAll();
    },
    onError: (e: Error) => toast.error(e.message || t("people.manage.inviteError")),
  });

  const saveMut = useMutation({
    mutationFn: (p: PersonDTO) =>
      saveProfile({
        data: {
          userId: p.id,
          displayName: p.name,
          title: p.title,
          department: p.department,
          team: p.team,
          phone: p.phone,
          location: p.location,
          role: p.role,
        },
      }),
    onSuccess: () => {
      toast.success(t("people.manage.saved"));
      setEditing(null);
      syncAll();
    },
    onError: (e: Error) => toast.error(e.message || t("people.manage.saveError")),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { userId } }),
    onSuccess: () => {
      toast.success(t("people.manage.removed"));
      syncAll();
    },
    onError: (e: Error) => toast.error(e.message || t("people.manage.removeError")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={`h-11 justify-start gap-2 rounded-2xl ${className ?? ""}`}
        >
          <Users className="h-4 w-4" />
          {t("people.manage.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("people.manage.title")}</DialogTitle>
        </DialogHeader>

        {canManage ? (
          <div className="space-y-2 rounded-2xl border border-border p-3">
            <Label className="text-xs text-muted-foreground">{t("people.manage.invite")}</Label>
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("people.manage.emailPlaceholder")}
              className="h-11 rounded-2xl"
              type="email"
            />
            <div className="flex gap-2">
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TenantRole)}>
                <SelectTrigger className="h-11 flex-1 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="h-11 gap-2 rounded-2xl"
                disabled={!tenantId || !inviteEmail.trim() || inviteMut.isPending}
                onClick={() => inviteMut.mutate()}
              >
                <MailPlus className="h-4 w-4" />
                {t("people.manage.inviteSend")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("people.manage.readOnly")}</p>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("people.manage.searchPlaceholder")}
            className="h-11 rounded-2xl pl-9"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.title, p.department, p.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Badge variant="secondary">{p.role}</Badge>
              {canManage && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11"
                    onClick={() => setEditing(p)}
                    aria-label={t("people.manage.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!p.isSelf && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11 text-destructive"
                      disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate(p.id)}
                      aria-label={t("people.manage.remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("people.manage.empty")}</p>
          )}
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-sm rounded-3xl">
            <DialogHeader>
              <DialogTitle>{t("people.manage.edit")}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <Field
                  label={t("people.manage.name")}
                  value={editing.name}
                  onChange={(v) => setEditing({ ...editing, name: v })}
                />
                <Field
                  label={t("people.manage.jobTitle")}
                  value={editing.title}
                  onChange={(v) => setEditing({ ...editing, title: v })}
                />
                <Field
                  label={t("people.manage.department")}
                  value={editing.department}
                  onChange={(v) => setEditing({ ...editing, department: v })}
                />
                <Field
                  label={t("people.manage.phone")}
                  value={editing.phone}
                  onChange={(v) => setEditing({ ...editing, phone: v })}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("people.manage.role")}</Label>
                  <Select
                    value={editing.role}
                    onValueChange={(v) => setEditing({ ...editing, role: v })}
                  >
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["tenant_owner", ...ROLES].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                className="h-11 w-full rounded-2xl"
                disabled={saveMut.isPending || !editing?.name.trim()}
                onClick={() => editing && saveMut.mutate(editing)}
              >
                {t("people.manage.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-2xl"
      />
    </div>
  );
}
