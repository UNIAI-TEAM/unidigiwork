import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deletePlan,
  deletePlanFeature,
  listAdminPlans,
  upsertPlan,
  upsertPlanFeature,
  type AdminPlanDto,
} from "@/lib/api/admin-plans.functions";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({
    meta: [
      { title: "Bảng giá — Quản trị UNIWORK" },
      { name: "description", content: "Tạo, sửa, xóa gói dịch vụ và tính năng theo gói." },
    ],
  }),
  component: AdminPlansPage,
});

type PlanForm = {
  id?: string;
  code: string;
  name: string;
  tagline: string;
  description: string;
  priceAmount: string;
  priceCurrency: string;
  billingPeriod: string;
  priceLabel: string;
  priceUnitLabel: string;
  ctaLabel: string;
  isActive: boolean;
  isFeatured: boolean;
  isDefault: boolean;
  sortOrder: string;
};

const emptyPlan: PlanForm = {
  code: "",
  name: "",
  tagline: "",
  description: "",
  priceAmount: "",
  priceCurrency: "VND",
  billingPeriod: "monthly",
  priceLabel: "",
  priceUnitLabel: "",
  ctaLabel: "",
  isActive: true,
  isFeatured: false,
  isDefault: false,
  sortOrder: "0",
};

function toForm(p: AdminPlanDto): PlanForm {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    priceAmount: p.priceAmount === null ? "" : String(p.priceAmount),
    priceCurrency: p.priceCurrency,
    billingPeriod: p.billingPeriod,
    priceLabel: p.priceLabel ?? "",
    priceUnitLabel: p.priceUnitLabel ?? "",
    ctaLabel: p.ctaLabel ?? "",
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    isDefault: p.isDefault,
    sortOrder: String(p.sortOrder),
  };
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

function AdminPlansPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlanForm | null>(null);
  const [featureFor, setFeatureFor] = useState<AdminPlanDto | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => listAdminPlans(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    qc.invalidateQueries({ queryKey: ["public", "plans"] });
    qc.invalidateQueries({ queryKey: ["pricing"] });
  };

  const saveMut = useMutation({
    mutationFn: (v: PlanForm) =>
      upsertPlan({
        data: {
          id: v.id,
          code: v.code.trim(),
          name: v.name.trim(),
          tagline: v.tagline.trim() || null,
          description: v.description.trim() || null,
          priceAmount: v.priceAmount.trim() === "" ? null : Number(v.priceAmount),
          priceCurrency: v.priceCurrency.trim() || "VND",
          billingPeriod: v.billingPeriod.trim() || "monthly",
          priceLabel: v.priceLabel.trim() || null,
          priceUnitLabel: v.priceUnitLabel.trim() || null,
          ctaLabel: v.ctaLabel.trim() || null,
          isActive: v.isActive,
          isFeatured: v.isFeatured,
          isDefault: v.isDefault,
          sortOrder: Number(v.sortOrder) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu gói dịch vụ");
      setForm(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePlan({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.deleted ? "Đã xóa gói" : "Gói đang có thuê bao — đã chuyển sang ngừng bán");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const featureMut = useMutation({
    mutationFn: (v: { planId: string; featureKey: string; enabled: boolean; quotaLimit: number | null }) =>
      upsertPlanFeature({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật tính năng");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFeatureMut = useMutation({
    mutationFn: (v: { planId: string; featureKey: string }) => deletePlanFeature({ data: v }),
    onSuccess: () => {
      toast.success("Đã gỡ tính năng khỏi gói");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plans = data?.plans ?? [];
  const features = data?.features ?? [];
  const current = useMemo(
    () => (featureFor ? plans.find((p) => p.id === featureFor.id) ?? featureFor : null),
    [featureFor, plans],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Gói dịch vụ &amp; bảng giá</h2>
          <p className="text-sm text-muted-foreground">
            Thay đổi tại đây áp dụng ngay cho trang <span className="font-medium">/pricing</span>.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...emptyPlan, sortOrder: String(plans.length + 1) })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Tạo gói mới
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Đang tải bảng giá…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Chưa có gói dịch vụ nào.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Gói</th>
                <th className="px-4 py-3 text-left">Mã</th>
                <th className="px-4 py-3 text-left">Giá</th>
                <th className="px-4 py-3 text-left">Chu kỳ</th>
                <th className="px-4 py-3 text-left">Tính năng</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.isFeatured && <Star className="h-3.5 w-3.5 text-amber-400" />}
                      {p.isDefault && (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                          Mặc định
                        </span>
                      )}
                    </div>
                    {p.tagline && <div className="text-xs text-muted-foreground">{p.tagline}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.code}</td>
                  <td className="px-4 py-3">
                    {p.priceLabel ??
                      (p.priceAmount === null
                        ? "Liên hệ"
                        : `${p.priceAmount.toLocaleString("vi-VN")} ${p.priceCurrency}`)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.billingPeriod}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setFeatureFor(p)}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-2"
                    >
                      {p.features.length} tính năng
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs ${
                        p.isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.isActive ? "Đang bán" : "Ngừng bán"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setForm(toForm(p))}
                        className="rounded-lg border border-border p-1.5 hover:bg-surface-2"
                        aria-label="Sửa gói"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Xóa gói "${p.name}"?`)) deleteMut.mutate(p.id);
                        }}
                        className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"
                        aria-label="Xóa gói"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.id ? "Sửa gói dịch vụ" : "Tạo gói dịch vụ"} onClose={() => setForm(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã gói (code)">
              <input
                className={inputCls}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Tên hiển thị">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Tagline">
              <input
                className={inputCls}
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </Field>
            <Field label="Nhãn CTA">
              <input
                className={inputCls}
                value={form.ctaLabel}
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              />
            </Field>
            <Field label="Giá (để trống = liên hệ)">
              <input
                type="number"
                className={inputCls}
                value={form.priceAmount}
                onChange={(e) => setForm({ ...form, priceAmount: e.target.value })}
              />
            </Field>
            <Field label="Tiền tệ">
              <input
                className={inputCls}
                value={form.priceCurrency}
                onChange={(e) => setForm({ ...form, priceCurrency: e.target.value })}
              />
            </Field>
            <Field label="Chu kỳ thanh toán">
              <select
                className={inputCls}
                value={form.billingPeriod}
                onChange={(e) => setForm({ ...form, billingPeriod: e.target.value })}
              >
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
                <option value="custom">custom</option>
              </select>
            </Field>
            <Field label="Thứ tự hiển thị">
              <input
                type="number"
                className={inputCls}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </Field>
            <Field label="Nhãn giá tùy chỉnh">
              <input
                className={inputCls}
                value={form.priceLabel}
                onChange={(e) => setForm({ ...form, priceLabel: e.target.value })}
              />
            </Field>
            <Field label="Đơn vị giá">
              <input
                className={inputCls}
                value={form.priceUnitLabel}
                onChange={(e) => setForm({ ...form, priceUnitLabel: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Mô tả">
                <textarea
                  rows={3}
                  className={inputCls}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <Check
                label="Đang bán"
                checked={form.isActive}
                onChange={(v) => setForm({ ...form, isActive: v })}
              />
              <Check
                label="Nổi bật"
                checked={form.isFeatured}
                onChange={(v) => setForm({ ...form, isFeatured: v })}
              />
              <Check
                label="Gói mặc định"
                checked={form.isDefault}
                onChange={(v) => setForm({ ...form, isDefault: v })}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              Hủy
            </button>
            <button
              disabled={!form.code.trim() || !form.name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate(form)}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMut.isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </Modal>
      )}

      {current && (
        <Modal title={`Tính năng — ${current.name}`} onClose={() => setFeatureFor(null)}>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {features.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có danh mục tính năng.</p>
            )}
            {features.map((f) => {
              const pf = current.features.find((x) => x.featureKey === f.key);
              return (
                <div
                  key={f.key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {f.key} · {f.kind}
                      {f.unit ? ` · ${f.unit}` : ""}
                    </div>
                  </div>
                  {f.kind === "quota" && (
                    <input
                      type="number"
                      placeholder="Không giới hạn"
                      defaultValue={pf?.quotaLimit ?? ""}
                      onBlur={(e) =>
                        featureMut.mutate({
                          planId: current.id,
                          featureKey: f.key,
                          enabled: pf?.enabled ?? true,
                          quotaLimit: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-36 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                    />
                  )}
                  <Check
                    label="Bật"
                    checked={pf?.enabled ?? false}
                    onChange={(v) =>
                      featureMut.mutate({
                        planId: current.id,
                        featureKey: f.key,
                        enabled: v,
                        quotaLimit: pf?.quotaLimit ?? null,
                      })
                    }
                  />
                  {pf && (
                    <button
                      onClick={() =>
                        removeFeatureMut.mutate({ planId: current.id, featureKey: f.key })
                      }
                      className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label="Gỡ tính năng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <CreditCard className="h-4 w-4 text-primary" /> {title}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
