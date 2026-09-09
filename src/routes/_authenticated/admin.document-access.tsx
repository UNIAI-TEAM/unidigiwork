import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search as SearchIcon, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAccessMembers,
  listAccessDocuments,
  grantDocumentAccess,
  revokeDocumentAccess,
  setAccessMemberRole,
  listMemberGrants,
  updateMemberGrant,
  setAccessMemberStatus,
} from "@/lib/api/access-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/document-access")({
  head: () => ({
    meta: [
      { title: "Quyền tài liệu — UNIWORK" },
      {
        name: "description",
        content: "Cấp quyền xem, chỉnh sửa và chia sẻ tài liệu cho thành viên tổ chức.",
      },
      { property: "og:title", content: "Quyền tài liệu — UNIWORK" },
      {
        property: "og:description",
        content: "Cấp quyền tài liệu hàng loạt cho thành viên tổ chức trong UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentAccessPage,
});

const ROLES = ["tenant_owner", "tenant_admin", "manager", "member", "guest"] as const;

function DocumentAccessPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [memberQuery, setMemberQuery] = useState("");
  const [docQuery, setDocQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [allDocuments, setAllDocuments] = useState(false);
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [expiry, setExpiry] = useState("");
  const [detailUser, setDetailUser] = useState<string | null>(null);

  const { data: memberData, isLoading } = useQuery({
    queryKey: ["access-members"],
    queryFn: () => listAccessMembers(),
  });
  const { data: grants, isLoading: grantsLoading } = useQuery({
    queryKey: ["member-grants", detailUser],
    queryFn: () => listMemberGrants({ data: { userId: detailUser as string } }),
    enabled: Boolean(detailUser),
  });
  const { data: docs } = useQuery({
    queryKey: ["access-documents", docQuery],
    queryFn: () => listAccessDocuments({ data: { search: docQuery } }),
  });

  const canManage = Boolean(memberData?.canManage);
  const members = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const list = memberData?.members ?? [];
    if (!q) return list;
    return list.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [memberData, memberQuery]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["access-members"] });
    await qc.invalidateQueries({ queryKey: ["member-grants"] });
  }

  const grant = useMutation({
    mutationFn: () =>
      grantDocumentAccess({
        data: {
          userIds: selectedUsers,
          productIds: allDocuments ? [] : selectedDocs,
          allDocuments,
          permission,
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
          idempotencyKey: `grant-${Date.now()}`,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("acc.granted"));
    },
    onError: () => toast.error(t("acc.error")),
  });

  const revoke = useMutation({
    mutationFn: (userIds: string[]) =>
      revokeDocumentAccess({ data: { userIds, idempotencyKey: `revoke-${Date.now()}` } }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("acc.revoked"));
    },
    onError: () => toast.error(t("acc.error")),
  });

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: (typeof ROLES)[number] }) =>
      setAccessMemberRole({ data: { ...v, idempotencyKey: `role-${v.userId}-${v.role}` } }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("acc.roleUpdated"));
    },
    onError: () => toast.error(t("acc.error")),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "suspended" | "removed" }) =>
      setAccessMemberStatus({
        data: { ...v, idempotencyKey: `status-${v.userId}-${v.status}-${Date.now()}` },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("acc.statusUpdated"));
    },
    onError: () => toast.error(t("acc.error")),
  });

  const editGrant = useMutation({
    mutationFn: (v: {
      shareId: string;
      action: "SET_VIEW" | "SET_EDIT" | "REVOKE" | "RESTORE" | "DELETE";
    }) =>
      updateMemberGrant({
        data: { ...v, idempotencyKey: `grant-${v.shareId}-${v.action}-${Date.now()}` },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("acc.grantUpdated"));
    },
    onError: () => toast.error(t("acc.error")),
  });

  function toggleUser(id: string) {
    setSelectedUsers((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function toggleDoc(id: string) {
    setSelectedDocs((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const canSubmit =
    canManage && selectedUsers.length > 0 && (allDocuments || selectedDocs.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>{t("acc.kicker")}</span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{t("acc.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("acc.subtitle")}</p>
      </div>

      {!canManage && !isLoading && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {t("acc.readonly")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Thành viên */}
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("acc.members")}</h3>
            <div className="relative ml-auto w-full sm:w-56">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder={t("acc.searchMember")}
                className="pl-8"
                aria-label={t("acc.searchMember")}
              />
            </div>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("acc.loading")}</p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("acc.emptyMembers")}</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <Checkbox
                    checked={selectedUsers.includes(m.userId)}
                    onCheckedChange={() => toggleUser(m.userId)}
                    aria-label={m.name}
                    disabled={!canManage}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email || "—"}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {t("acc.grantsCount")}: {m.activeGrants} ({m.viewGrants}/{m.editGrants})
                  </Badge>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      changeRole.mutate({ userId: m.userId, role: v as (typeof ROLES)[number] })
                    }
                    disabled={!canManage || m.isSelf}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`acc.role.${r}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={m.status}
                    onValueChange={(v) =>
                      changeStatus.mutate({
                        userId: m.userId,
                        status: v as "active" | "suspended" | "removed",
                      })
                    }
                    disabled={!canManage || m.isSelf}
                  >
                    <SelectTrigger className="w-36" aria-label={t("acc.memberStatus")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["active", "suspended", "removed"] as const).map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`acc.memberStatus.${s}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setDetailUser(m.userId)}>
                    {t("acc.view")}
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("acc.revokeAll")}
                      onClick={() => revoke.mutate([m.userId])}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Cấp quyền hàng loạt */}
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">{t("acc.bulkTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("acc.bulkHint")}</p>

          <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
            <Checkbox
              checked={allDocuments}
              onCheckedChange={(v) => setAllDocuments(Boolean(v))}
              aria-label={t("acc.allDocs")}
            />
            {t("acc.allDocs")}
          </label>

          {!allDocuments && (
            <>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder={t("acc.searchDoc")}
                  className="pl-8"
                  aria-label={t("acc.searchDoc")}
                />
              </div>
              <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border bg-background p-2">
                {(docs ?? []).length === 0 && (
                  <li className="p-2 text-xs text-muted-foreground">{t("acc.emptyDocs")}</li>
                )}
                {(docs ?? []).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                    <Checkbox
                      checked={selectedDocs.includes(d.id)}
                      onCheckedChange={() => toggleDoc(d.id)}
                      aria-label={d.title}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Select value={permission} onValueChange={(v) => setPermission(v as "VIEW" | "EDIT")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VIEW">{t("acc.perm.view")}</SelectItem>
              <SelectItem value="EDIT">{t("acc.perm.edit")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground" htmlFor="acc-expiry">
              {t("acc.expiry")}
            </label>
            <Input
              id="acc-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>

          <Button
            className="w-full gap-2"
            disabled={!canSubmit || grant.isPending}
            onClick={() => grant.mutate()}
          >
            {grant.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {t("acc.grant")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={!canManage || selectedUsers.length === 0 || revoke.isPending}
            onClick={() => revoke.mutate(selectedUsers)}
          >
            {t("acc.revokeSelected")}
          </Button>
        </section>
      </div>
    </div>
  );
}
