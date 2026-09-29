import { withAppShell } from "@/components/page-shell";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { getSchoolStaff } from "@/lib/api/school-ops.functions";
import { deleteChatGroup, listChatGroups, saveChatGroup, setChatMember, type ChatGroup } from "@/lib/api/school-chat.functions";

export const Route = createFileRoute("/_authenticated/school-chat-groups")({
  head: () => ({
    meta: [
      { title: "Nhóm chat của trường — UniWork" },
      { name: "description", content: "Ban Giám hiệu tạo, đổi tên, xóa nhóm chat và mời thành viên." },
      { property: "og:title", content: "Nhóm chat của trường — UniWork" },
      { property: "og:description", content: "Ban Giám hiệu tạo, đổi tên, xóa nhóm chat và mời thành viên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(ChatGroupsPage),
});

type ErrKey = "scg.err.FAILED";
const errT = (m: string) => `scg.err.${m}` as ErrKey;

function ChatGroupsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const listFn = useServerFn(listChatGroups);
  const q = useQuery({ queryKey: ["school-chat-groups"], queryFn: () => listFn() });
  const staffFn = useServerFn(getSchoolStaff);
  const sq = useQuery({ queryKey: ["school-staff"], queryFn: () => staffFn() });
  const [edit, setEdit] = useState<ChatGroup | "new" | null>(null);
  const [members, setMembers] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["school-chat-groups"] });

  const delFn = useServerFn(deleteChatGroup);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(t("scg.deleted")); refresh(); },
    onError: (e: Error) => toast.error(t(errT(e.message))),
  });

  const groups = q.data?.groups ?? [];
  const staff = sq.data?.staff ?? [];
  const current = groups.find((g) => g.id === members) ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("scg.title")}</h1>
          <p className="text-sm text-muted-foreground">{q.data?.scope ? `${t("scg.leadDesc")} ${q.data.scope}` : t("scg.desc")}</p>
        </div>
        {q.data?.allowed && <Button className="h-11" onClick={() => setEdit("new")}><Plus className="mr-1 h-4 w-4" />{t("scg.new")}</Button>}
      </div>

      {q.data && !q.data.allowed ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("scg.forbidden")}</p>
      ) : (
        <ul className="space-y-3">
          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {!q.isLoading && groups.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("scg.empty")}</p>}
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-medium">{g.name}</span>
                  {g.is_dept && <span className="rounded border px-1.5 text-xs text-muted-foreground">{t("scg.deptTag")}</span>}
                  {!g.is_dept && g.department && !q.data?.scope && <span className="rounded border px-1.5 text-xs text-muted-foreground">{g.department}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{g.member_ids.length} {t("scg.members")}{g.description ? ` · ${g.description}` : ""}</p>
              </div>
              <Button variant="outline" className="h-11" onClick={() => setMembers(g.id)}><Users className="mr-1 h-4 w-4" />{t("scg.manageMembers")}</Button>
              {!g.is_dept && (
                <>
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t("scg.rename")} onClick={() => setEdit(g)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t("scg.delete")} onClick={() => { if (confirm(t("scg.confirmDelete"))) del.mutate(g.id); }}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.some((g) => g.is_dept) && <p className="text-xs text-muted-foreground">{t("scg.deptNote")}</p>}

      {edit && <GroupDialog group={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={refresh} />}

      <Dialog open={!!current} onOpenChange={(o) => !o && setMembers(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("scg.manageMembers")} · {current?.name}</DialogTitle></DialogHeader>
          {current && <MemberList group={current} staff={staff} onDone={refresh} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupDialog({ group, onClose, onDone }: { group: ChatGroup | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(group?.name ?? "");
  const [desc, setDesc] = useState(group?.description ?? "");
  const fn = useServerFn(saveChatGroup);
  const m = useMutation({
    mutationFn: () => fn({ data: { id: group?.id ?? null, name, description: desc.trim() || null } }),
    onSuccess: () => { toast.success(t("scg.saved")); onDone(); onClose(); },
    onError: (e: Error) => toast.error(t(errT(e.message))),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{group ? t("scg.rename") : t("scg.new")}</DialogTitle></DialogHeader>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t("scg.name")}</span>
          <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t("scg.descLabel")}</span>
          <Input className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} /></label>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>{t("sdp.cancel")}</Button>
          <Button className="h-11" disabled={!name.trim() || m.isPending} onClick={() => m.mutate()}>{t("scg.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberList({ group, staff, onDone }: { group: ChatGroup; staff: { user_id: string; display_name: string | null; email: string | null }[]; onDone: () => void }) {
  const { t } = useI18n();
  const fn = useServerFn(setChatMember);
  const m = useMutation({
    mutationFn: (v: { userId: string; add: boolean }) => fn({ data: { channelId: group.id, ...v } }),
    onSuccess: onDone,
    onError: (e: Error) => toast.error(t(errT(e.message))),
  });
  if (staff.length === 0) return <p className="text-sm text-muted-foreground">{t("scg.noStaff")}</p>;
  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
      {staff.map((s) => {
        const on = group.member_ids.includes(s.user_id);
        return (
          <li key={s.user_id} className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-accent">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.display_name ?? s.email}</div>
              {s.display_name && <div className="truncate text-xs text-muted-foreground">{s.email}</div>}
            </div>
            <Button variant={on ? "outline" : "default"} className="h-9" disabled={m.isPending} onClick={() => m.mutate({ userId: s.user_id, add: !on })}>
              {on ? t("scg.remove") : t("scg.add")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
