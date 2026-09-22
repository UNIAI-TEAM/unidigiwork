import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Check, KeyRound, Languages, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getMyAdminAccess, grantUserRole, revokeUserRole } from "@/lib/api/admin.functions";
import { adminSetUserPassword, getAccountDetail } from "@/lib/api/admin-accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { localeTag, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/accounts/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết tài khoản mobile — UNIWORK" },
      { name: "description", content: "Chi tiết tài khoản, quyền và mật khẩu UNIWORK." },
      { property: "og:title", content: "Chi tiết tài khoản mobile — UNIWORK" },
      { property: "og:description", content: "Chi tiết tài khoản, quyền và mật khẩu UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileAdminAccountDetail,
});

type SystemRole = "admin" | "moderator" | "user";
const SYSTEM_ROLES: SystemRole[] = ["admin", "moderator", "user"];

function MobileAdminAccountDetail() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const accessFn = useServerFn(getMyAdminAccess);
  const detailFn = useServerFn(getAccountDetail);
  const grantFn = useServerFn(grantUserRole);
  const revokeFn = useServerFn(revokeUserRole);
  const passwordFn = useServerFn(adminSetUserPassword);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const detail = useQuery({
    queryKey: ["m-admin-account", id],
    queryFn: () => detailFn({ data: { user_id: id } }),
    enabled: access.data?.canRead === true,
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["m-admin-account", id] }),
      queryClient.invalidateQueries({ queryKey: ["m-admin-users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    ]);
  };
  const roleMutation = useMutation({
    mutationFn: ({ role, enabled }: { role: SystemRole; enabled: boolean }) =>
      enabled
        ? grantFn({ data: { user_id: id, role } })
        : revokeFn({ data: { user_id: id, role } }),
    onSuccess: async () => {
      await invalidate();
      toast.success(t("m.admin.roleSaved"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("m.admin.roleError")),
  });
  const passwordMutation = useMutation({
    mutationFn: () => passwordFn({ data: { user_id: id, password } }),
    onSuccess: () => {
      setPasswordOpen(false);
      setPassword("");
      setConfirmPassword("");
      toast.success(t("m.admin.passwordSaved"));
    },
    onError: () => toast.error(t("m.admin.passwordError")),
  });
  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(localeTag(lang), {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : t("m.admin.never");

  if (access.isLoading || detail.isLoading)
    return (
      <MobileAdminLayout title={t("m.admin.accounts")} backTo="/m/admin/accounts">
        <MobileAdminLoading />
      </MobileAdminLayout>
    );
  if (!access.data?.canRead)
    return (
      <MobileAdminLayout title={t("m.admin.accounts")} backTo="/m/admin/accounts">
        <MobileAdminMessage>{t("m.admin.denied")}</MobileAdminMessage>
      </MobileAdminLayout>
    );
  if (!detail.data)
    return (
      <MobileAdminLayout title={t("m.admin.accounts")} backTo="/m/admin/accounts">
        <MobileAdminMessage retry={() => void detail.refetch()}>
          {t("m.admin.empty")}
        </MobileAdminMessage>
      </MobileAdminLayout>
    );

  const account = detail.data;
  return (
    <MobileAdminLayout
      title={account.display_name ?? account.email}
      subtitle={account.display_name ? account.email : undefined}
      backTo="/m/admin/accounts"
    >
      {!access.data.canWrite ? <ReadOnlyNotice /> : null}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">{t("m.admin.accountInfo")}</h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">{t("m.admin.createdAt")}</dt>
              <dd>{formatDate(account.created_at)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">{t("m.admin.lastSignIn")}</dt>
              <dd>{formatDate(account.last_sign_in_at)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Languages className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">{t("m.admin.language")}</dt>
              <dd>{account.lang.toUpperCase()}</dd>
            </div>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5" />
          <div>
            <h2 className="font-medium">{t("m.admin.systemRoles")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("m.admin.systemRolesHint")}</p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-border">
          {SYSTEM_ROLES.map((role) => {
            const checked = account.roles.includes(role);
            return (
              <div key={role} className="flex min-h-14 items-center justify-between gap-4 py-2">
                <span className="text-sm">{t(`m.admin.role.${role}` as never)}</span>
                <Switch
                  checked={checked}
                  disabled={!access.data.canWrite || roleMutation.isPending}
                  aria-label={t(`m.admin.role.${role}` as never)}
                  onCheckedChange={(enabled) => {
                    if (window.confirm(t("m.admin.roleConfirm")))
                      roleMutation.mutate({ role, enabled });
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">{t("m.admin.organizationRoles")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("m.admin.organizationRolesHint")}</p>
        <div className="mt-3 grid gap-2">
          {account.memberships.length ? (
            account.memberships.map((membership) => (
              <div key={membership.tenant_id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{membership.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`m.admin.role.${membership.role}` as never)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {t(`m.admin.status.${membership.status}` as never)}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("m.admin.noOrganization")}</p>
          )}
        </div>
      </section>

      {access.data.canWrite ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setPasswordOpen(true)}
        >
          <KeyRound className="mr-2 h-4 w-4" /> {t("m.admin.password")}
        </Button>
      ) : null}

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("m.admin.password")}</DialogTitle>
            <DialogDescription>{t("m.admin.passwordHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-password">{t("m.admin.newPassword")}</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password-confirm">{t("m.admin.confirmPassword")}</Label>
              <Input
                id="admin-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="min-h-11"
              />
            </div>
            {confirmPassword && password !== confirmPassword ? (
              <p className="text-sm text-destructive">{t("m.admin.passwordMismatch")}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setPasswordOpen(false)}
            >
              {t("m.admin.cancel")}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                password.length < 8 || password !== confirmPassword || passwordMutation.isPending
              }
              onClick={() => passwordMutation.mutate()}
            >
              {t("m.admin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileAdminLayout>
  );
}
