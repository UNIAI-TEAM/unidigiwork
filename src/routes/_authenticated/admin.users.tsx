import { createFileRoute } from "@tanstack/react-router";
import { useI18n, type Key } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search, ShieldCheck, UserX, X } from "lucide-react";
import { avatar } from "@/components/app-shell";
import { useAdminAccess } from "@/features/admin/access";
import { grantUserRole, listAllUsers, revokeUserRole } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Quản lý tài khoản — UNIWORK" },
      { name: "description", content: "Danh sách người dùng và phân quyền vai trò." },
    ],
  }),
  component: AdminUsersPage,
});

type Role = "admin" | "moderator" | "user";
const ROLES: { key: Role; label: string; tint: string }[] = [
  { key: "admin", label: "adm.role.admin", tint: "bg-primary/15 text-primary" },
  { key: "moderator", label: "adm.role.moderator", tint: "bg-amber-500/15 text-amber-300" },
  { key: "user", label: "adm.role.user", tint: "bg-surface-2 text-muted-foreground" },
];

function AdminUsersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { access } = useAdminAccess();
  const canWrite = access.canWrite;
  const [q, setQ] = useState("");
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listAllUsers(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "isAdmin"] });
  };
  const grantMut = useMutation({
    mutationFn: (v: { user_id: string; role: Role }) => grantUserRole({ data: v }),
    onSuccess: invalidate,
  });
  const revokeMut = useMutation({
    mutationFn: (v: { user_id: string; role: Role }) => revokeUserRole({ data: v }),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        (u.display_name ?? "").toLowerCase().includes(s),
    );
  }, [users, q]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adm.12")}
            className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label={t("adm.13")}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length}/{users.length} tài khoản
        </span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t("adm.14")}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
            <UserX className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">{t("adm.15")}</div>
          <p className="text-xs text-muted-foreground">{t("adm.16")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("adm.17")}</th>
                <th className="px-4 py-2 font-medium">{t("adm.18")}</th>
                <th className="px-4 py-2 font-medium">{t("adm.19")}</th>
                <th className="px-4 py-2 font-medium">{t("adm.20")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("adm.21")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const busy = grantMut.isPending || revokeMut.isPending || !canWrite;
                return (
                  <tr key={u.id} className="border-b border-border/60 hover:bg-surface-2/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={avatar(u.display_name ?? u.email)}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.display_name ?? "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t("adm.22")}
                          </span>
                        ) : (
                          u.roles.map((r) => {
                            const meta = ROLES.find((x) => x.key === r);
                            return (
                              <span
                                key={r}
                                className={`rounded px-1.5 py-0.5 text-[11px] ${meta?.tint ?? "bg-surface-2 text-muted-foreground"}`}
                              >
                                {meta ? t(meta.label as Key) : r}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {u.email_confirmed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {t("adm.23")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("adm.24")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("vi-VN")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        {ROLES.map((r) => {
                          const has = u.roles.includes(r.key);
                          return (
                            <button
                              key={r.key}
                              disabled={busy}
                              onClick={() =>
                                has
                                  ? revokeMut.mutate({ user_id: u.id, role: r.key })
                                  : grantMut.mutate({ user_id: u.id, role: r.key })
                              }
                              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                                has
                                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                                  : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              title={
                                !canWrite
                                  ? t("adm.25")
                                  : has
                                    ? `${t("adm.role.revoke")} ${t(r.label as Key)}`
                                    : `${t("adm.role.grant")} ${t(r.label as Key)}`
                              }
                            >
                              {has ? "− " : "+ "}
                              {t(r.label as Key)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>
          {t("adm.26")}
          {t("adm.27")}
        </span>
      </div>
    </section>
  );
}