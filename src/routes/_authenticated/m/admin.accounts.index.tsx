import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Search, UserRound, XCircle } from "lucide-react";
import { getMyAdminAccess, listAllUsers } from "@/lib/api/admin.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import {
  MobileAdminLayout,
  MobileAdminLoading,
  MobileAdminMessage,
  ReadOnlyNotice,
} from "@/components/mobile/mobile-admin-layout";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/admin/accounts/")({
  head: () => ({
    meta: [
      { title: "Tài khoản quản trị mobile — UNIWORK" },
      { name: "description", content: "Quản lý tài khoản và quyền UNIWORK trên điện thoại." },
      { property: "og:title", content: "Tài khoản quản trị mobile — UNIWORK" },
      { property: "og:description", content: "Quản lý tài khoản và quyền UNIWORK trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileAdminAccounts,
});

function MobileAdminAccounts() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const accessFn = useServerFn(getMyAdminAccess);
  const usersFn = useServerFn(listAllUsers);
  const access = useQuery({ queryKey: ["m-admin-access"], queryFn: () => accessFn() });
  const users = useQuery({
    queryKey: ["m-admin-users"],
    queryFn: () => usersFn(),
    enabled: access.data?.canRead === true,
  });
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users.data ?? [];
    return (users.data ?? []).filter((user) =>
      `${user.display_name ?? ""} ${user.email}`.toLowerCase().includes(term),
    );
  }, [search, users.data]);

  return (
    <MobileAdminLayout
      title={t("m.admin.accounts")}
      subtitle={t("m.admin.accountsHint")}
      backTo="/m/admin"
    >
      {access.isLoading ? <MobileAdminLoading /> : null}
      {access.data && !access.data.canRead ? (
        <MobileAdminMessage>{t("m.admin.denied")}</MobileAdminMessage>
      ) : null}
      {access.data?.canRead ? (
        <>
          {!access.data.canWrite ? <ReadOnlyNotice /> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("m.admin.search")}
              className="min-h-11 pl-10"
            />
          </div>
          {users.isLoading ? <MobileAdminLoading /> : null}
          {users.isError ? (
            <MobileAdminMessage retry={() => void users.refetch()}>{t("m.admin.roleError")}</MobileAdminMessage>
          ) : null}
          {!users.isLoading && !users.isError && filtered.length === 0 ? (
            <MobileAdminMessage>{t("m.admin.empty")}</MobileAdminMessage>
          ) : null}
          <div className="grid gap-2">
            {filtered.map((user) => (
              <MobileListItem
                key={user.id}
                title={user.display_name ?? user.email}
                subtitle={user.display_name ? user.email : undefined}
                meta={user.roles.map((role) => t(`m.admin.role.${role}` as never)).join(" · ") || t("m.admin.role.user")}
                icon={<UserRound className="h-5 w-5" />}
                badge={
                  <Badge variant="outline" className="gap-1 normal-case">
                    {user.email_confirmed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {user.email_confirmed ? t("m.admin.confirmed") : t("m.admin.unconfirmed")}
                  </Badge>
                }
                onClick={() => void navigate({ to: "/m/admin/accounts/$id", params: { id: user.id } })}
              />
            ))}
          </div>
        </>
      ) : null}
    </MobileAdminLayout>
  );
}