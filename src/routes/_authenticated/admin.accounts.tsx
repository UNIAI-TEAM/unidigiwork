import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Globe, KeyRound, Search, Trash2, Users, X } from "lucide-react";
import { avatar } from "@/components/app-shell";
import { useAdminAccess } from "@/features/admin/access";
import { useI18n, LANGS } from "@/lib/i18n";
import { listAllUsers } from "@/lib/api/admin.functions";
import {
  adminDeleteUser,
  adminSetUserLanguage,
  adminSetUserPassword,
  getAccountDetail,
  listTenantAccountLimits,
  setTenantAccountLimit,
} from "@/lib/api/admin-accounts.functions";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Tài khoản & giới hạn — UNIWORK" },
      {
        name: "description",
        content:
          "Quản trị tài khoản: xem chi tiết, đổi mật khẩu, đổi ngôn ngữ, xoá tài khoản và giới hạn số tài khoản theo tổ chức.",
      },
      { property: "og:title", content: "Tài khoản & giới hạn — UNIWORK" },
      {
        property: "og:description",
        content: "Xem, đổi mật khẩu, đổi ngôn ngữ, xoá tài khoản và đặt giới hạn theo tổ chức.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAccountsPage,
});

type Tab = "users" | "limits";

function AdminAccountsPage() {
  const { t } = useI18n();
  const { access } = useAdminAccess();
  const canWrite = access.canWrite;
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["users", "limits"] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === k
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {k === "users" ? t("acct.tabUsers") : t("acct.tabLimits")}
          </button>
        ))}
        {!canWrite && (
          <span className="ml-auto text-[11px] text-muted-foreground">{t("acct.readOnly")}</span>
        )}
      </div>
      {tab === "users" ? <AccountsTable canWrite={canWrite} /> : <LimitsTable canWrite={canWrite} />}
    </div>
  );
}

/* ------------------------------ Accounts ------------------------------ */

function AccountsTable({ canWrite }: { canWrite: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pwId, setPwId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listAllUsers(),
  });

  const delMut = useMutation({
    mutationFn: (user_id: string) => adminDeleteUser({ data: { user_id } }),
    onSuccess: () => {
      toast.success(t("acct.deleteOk"));
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const langMut = useMutation({
    mutationFn: (v: { user_id: string; lang: string }) =>
      adminSetUserLanguage({ data: v as { user_id: string; lang: "vi" | "en" | "my" | "km" | "lo" } }),
    onSuccess: (_d, v) => {
      toast.success(t("acct.langOk"));
      qc.invalidateQueries({ queryKey: ["admin", "account", v.user_id] });
      qc.invalidateQueries({ queryKey: ["admin", "accountLangs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(s) || (u.display_name ?? "").toLowerCase().includes(s),
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
            placeholder={t("acct.search")}
            className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label={t("acct.cancel")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length}/{users.length}
        </span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t("acct.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{t("acct.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("acct.tabUsers")}</th>
                <th className="px-4 py-2 font-medium">{t("acct.roles")}</th>
                <th className="px-4 py-2 font-medium">{t("acct.language")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("acct.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.roles.length ? u.roles.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LangCell userId={u.id} canWrite={canWrite} onChange={langMut.mutate} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        onClick={() => setDetailId(u.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      >
                        <Eye className="h-3 w-3" /> {t("acct.view")}
                      </button>
                      <button
                        disabled={!canWrite}
                        onClick={() => setPwId(u.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <KeyRound className="h-3 w-3" /> {t("acct.password")}
                      </button>
                      <button
                        disabled={!canWrite || delMut.isPending}
                        onClick={() => {
                          if (window.confirm(t("acct.deleteConfirm"))) delMut.mutate(u.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> {t("acct.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <DetailDialog userId={detailId} onClose={() => setDetailId(null)} />}
      {pwId && <PasswordDialog userId={pwId} onClose={() => setPwId(null)} />}
    </section>
  );
}

function LangCell({
  userId,
  canWrite,
  onChange,
}: {
  userId: string;
  canWrite: boolean;
  onChange: (v: { user_id: string; lang: string }) => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "account", userId],
    queryFn: () => getAccountDetail({ data: { user_id: userId } }),
    staleTime: 60_000,
  });
  return (
    <select
      disabled={!canWrite || !data}
      value={data?.lang ?? "vi"}
      onChange={(e) => onChange({ user_id: userId, lang: e.target.value })}
      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        {children}
      </div>
      <button className="absolute inset-0 -z-10" aria-hidden onClick={onClose} tabIndex={-1} />
    </div>
  );
}

function DetailDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "account", userId],
    queryFn: () => getAccountDetail({ data: { user_id: userId } }),
  });
  return (
    <Dialog onClose={onClose}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Eye className="h-4 w-4 text-primary" /> {t("acct.detail")}
      </h2>
      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">{t("acct.loading")}</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <Row label="Email" value={data.email} />
          <Row label={t("acct.tabUsers")} value={data.display_name ?? "—"} />
          <Row label={t("acct.roles")} value={data.roles.length ? data.roles.join(", ") : "—"} />
          <Row label={t("acct.language")} value={data.lang} />
          <Row
            label={t("acct.created")}
            value={data.created_at ? new Date(data.created_at).toLocaleString() : "—"}
          />
          <Row
            label={t("acct.lastSignIn")}
            value={data.last_sign_in_at ? new Date(data.last_sign_in_at).toLocaleString() : "—"}
          />
          <div>
            <dt className="text-xs text-muted-foreground">{t("acct.tenants")}</dt>
            <dd className="mt-1 space-y-1">
              {data.memberships.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                data.memberships.map((m) => (
                  <div
                    key={m.tenant_id}
                    className="flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1 text-xs"
                  >
                    <span className="truncate">{m.tenant_name}</span>
                    <span className="text-muted-foreground">
                      {m.role} · {m.status}
                    </span>
                  </div>
                ))
              )}
            </dd>
          </div>
        </dl>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface"
        >
          {t("acct.close")}
        </button>
      </div>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs font-medium">{value}</dd>
    </div>
  );
}

function PasswordDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const mut = useMutation({
    mutationFn: () => adminSetUserPassword({ data: { user_id: userId, password: pw } }),
    onSuccess: () => {
      toast.success(t("acct.pwOk"));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (pw.length < 8) return toast.error(t("acct.pwMin"));
    if (pw !== pw2) return toast.error(t("acct.pwMismatch"));
    mut.mutate();
  };

  return (
    <Dialog onClose={onClose}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-primary" /> {t("acct.password")}
      </h2>
      <div className="space-y-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t("acct.newPassword")}
          className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder={t("acct.confirmPassword")}
          className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface"
        >
          {t("acct.cancel")}
        </button>
        <button
          disabled={mut.isPending}
          onClick={submit}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {t("acct.save")}
        </button>
      </div>
    </Dialog>
  );
}

/* ------------------------------- Limits ------------------------------- */

function LimitsTable({ canWrite }: { canWrite: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "tenantLimits"],
    queryFn: () => listTenantAccountLimits(),
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (v: { tenant_id: string; max_users: number | null }) =>
      setTenantAccountLimit({ data: v }),
    onSuccess: () => {
      toast.success(t("acct.limitOk"));
      qc.invalidateQueries({ queryKey: ["admin", "tenantLimits"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> {t("acct.limitTitle")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("acct.limitDesc")}</p>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t("acct.loading")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("acct.tenant")}</th>
                <th className="px-4 py-2 font-medium">{t("acct.used")}</th>
                <th className="px-4 py-2 font-medium">{t("acct.limit")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("acct.save")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const value = draft[r.id] ?? (r.max_users === null ? "" : String(r.max_users));
                const over = r.max_users !== null && r.used >= r.max_users;
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-surface-2/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${over ? "bg-destructive/15 text-destructive" : "bg-surface-2 text-muted-foreground"}`}
                      >
                        {r.used}
                        {r.max_users !== null ? ` / ${r.max_users}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        disabled={!canWrite}
                        value={value}
                        placeholder={t("acct.unlimited")}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                        className="w-32 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={!canWrite || mut.isPending}
                        onClick={() => {
                          const raw = value.trim();
                          const n = raw === "" ? null : Number(raw);
                          if (n !== null && (!Number.isFinite(n) || n < 1)) return;
                          mut.mutate({ tenant_id: r.id, max_users: n });
                        }}
                        className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("acct.save")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        <span>{t("acct.limitDesc")}</span>
      </div>
    </section>
  );
}
