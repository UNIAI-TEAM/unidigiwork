import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, LogIn, Pause, Play, Plus, Archive, Search } from "lucide-react";
import { useAdminAccess } from "@/features/admin/access";
import {
  createPlatformTenant,
  enterTenantAsPlatformAdmin,
  listPlatformTenants,
  setPlatformTenantStatus,
  type PlatformTenantRow,
} from "@/lib/api/platform-tenants.functions";

export const Route = createFileRoute("/_authenticated/admin/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Quản lý tổ chức — UNIWORK" },
      {
        name: "description",
        content:
          "Danh sách toàn bộ tổ chức trên hệ thống: tìm kiếm, tạo mới, tạm dừng, khoá và vào quản trị hộ.",
      },
      { property: "og:title", content: "Platform — Quản lý tổ chức — UNIWORK" },
      {
        property: "og:description",
        content: "Quản trị đa tổ chức: trạng thái, thành viên, workspace và quản trị hộ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động",
  suspended: "Tạm dừng",
  archived: "Đã khoá",
};

const STATUS_CLASS: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  suspended: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  archived: "border-border bg-surface-2 text-muted-foreground",
};

function PlatformPage() {
  const { access } = useAdminAccess();
  const canWrite = access.canWrite;
  const qc = useQueryClient();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const tenants = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => listPlatformTenants(),
  });

  const rows = useMemo(() => {
    const list = tenants.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((t) =>
      [t.name, t.slug, t.ownerEmail ?? "", t.ownerName ?? ""].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
  }, [tenants.data, q]);

  const statusMut = useMutation({
    mutationFn: (v: { tenantId: string; status: "active" | "suspended" | "archived" }) =>
      setPlatformTenantStatus({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái tổ chức");
      qc.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không đổi được trạng thái"),
  });

  const enterMut = useMutation({
    mutationFn: (tenantId: string) => enterTenantAsPlatformAdmin({ data: { tenantId } }),
    onSuccess: async () => {
      toast.success("Đã chuyển sang tổ chức này để quản trị hộ");
      qc.clear();
      await router.invalidate();
      router.navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message || "Không vào được tổ chức"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, mã hoặc email chủ sở hữu…"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <button
          type="button"
          disabled={!canWrite}
          onClick={() => setCreating((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Tạo tổ chức
        </button>
      </div>

      {creating && canWrite && (
        <CreateTenantForm
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["platform-tenants"] });
          }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Tổ chức</th>
              <th className="px-4 py-2.5 text-left font-medium">Chủ sở hữu</th>
              <th className="px-4 py-2.5 text-left font-medium">Trạng thái</th>
              <th className="px-4 py-2.5 text-right font-medium">Thành viên</th>
              <th className="px-4 py-2.5 text-right font-medium">Workspace</th>
              <th className="px-4 py-2.5 text-right font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {tenants.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Đang tải danh sách tổ chức…
                </td>
              </tr>
            )}
            {!tenants.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Không có tổ chức nào khớp.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <TenantRow
                key={t.id}
                tenant={t}
                canWrite={canWrite}
                busy={statusMut.isPending || enterMut.isPending}
                onStatus={(status) => statusMut.mutate({ tenantId: t.id, status })}
                onEnter={() => enterMut.mutate(t.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Khi vào quản trị hộ, tài khoản của bạn được cấp vai trò quản trị tổ chức đó và thao tác được
        ghi vào nhật ký kiểm toán.
      </p>
    </div>
  );
}

function TenantRow({
  tenant,
  canWrite,
  busy,
  onStatus,
  onEnter,
}: {
  tenant: PlatformTenantRow;
  canWrite: boolean;
  busy: boolean;
  onStatus: (s: "active" | "suspended" | "archived") => void;
  onEnter: () => void;
}) {
  const archived = tenant.status === "archived";
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{tenant.name}</div>
            <div className="truncate text-xs text-muted-foreground">{tenant.slug}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        <div>{tenant.ownerName ?? "—"}</div>
        <div>{tenant.ownerEmail ?? ""}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
            STATUS_CLASS[tenant.status] ?? STATUS_CLASS["archived"]
          }`}
        >
          {STATUS_LABEL[tenant.status] ?? tenant.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {tenant.members}
        {tenant.maxUsers ? <span className="text-muted-foreground">/{tenant.maxUsers}</span> : null}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{tenant.workspaces}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {tenant.status === "active" ? (
            <ActionBtn
              disabled={!canWrite || busy}
              onClick={() => onStatus("suspended")}
              icon={<Pause className="h-3.5 w-3.5" />}
              label="Tạm dừng"
            />
          ) : (
            <ActionBtn
              disabled={!canWrite || busy || archived}
              onClick={() => onStatus("active")}
              icon={<Play className="h-3.5 w-3.5" />}
              label="Mở lại"
            />
          )}
          <ActionBtn
            disabled={!canWrite || busy || archived}
            onClick={() => {
              if (confirm(`Khoá vĩnh viễn tổ chức "${tenant.name}"? Không thể mở lại.`)) {
                onStatus("archived");
              }
            }}
            icon={<Archive className="h-3.5 w-3.5" />}
            label="Khoá"
          />
          <ActionBtn
            disabled={!canWrite || busy || tenant.status !== "active"}
            onClick={onEnter}
            icon={<LogIn className="h-3.5 w-3.5" />}
            label="Quản trị hộ"
            primary
          />
        </div>
      </td>
    </tr>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        primary
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function CreateTenantForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      createPlatformTenant({
        data: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          ownerEmail: ownerEmail.trim() ? ownerEmail.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo tổ chức mới");
      setName("");
      setSlug("");
      setOwnerEmail("");
      onDone();
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("OWNER_NOT_FOUND")
          ? "Không tìm thấy tài khoản với email này"
          : e.message.includes("TENANT_SLUG_CONFLICT")
            ? "Mã tổ chức đã tồn tại"
            : e.message || "Không tạo được tổ chức",
      ),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tên tổ chức" value={name} onChange={setName} placeholder="Công ty ABC" />
        <Field
          label="Mã (slug)"
          value={slug}
          onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
          placeholder="cong-ty-abc"
        />
        <Field
          label="Email chủ sở hữu (tuỳ chọn)"
          value={ownerEmail}
          onChange={setOwnerEmail}
          placeholder="owner@congty.vn"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={mut.isPending || name.trim().length < 2 || slug.trim().length < 3}
          onClick={() => mut.mutate()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {mut.isPending ? "Đang tạo…" : "Tạo tổ chức"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary/50"
      />
    </label>
  );
}
