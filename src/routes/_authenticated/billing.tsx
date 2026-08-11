import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CreditCard,
  Check,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  RotateCcw,
  XCircle,
  Gauge,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { useActiveTenant } from "@/features/tenants/hooks";
import {
  listPlans,
  getActiveSubscription,
  getEntitlementSnapshot,
  changeSubscription,
  cancelSubscription,
  resumeSubscription,
} from "@/lib/api/billing.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Gói dịch vụ & thanh toán — UNIWORK" },
      { name: "description", content: "Xem gói hiện tại, nâng cấp, hạ cấp hoặc hủy đăng ký UNIWORK." },
      { property: "og:title", content: "Gói dịch vụ & thanh toán — UNIWORK" },
      { property: "og:description", content: "Tự quản lý gói đăng ký, hạn mức và quyền tính năng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

function newKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động",
  trialing: "Dùng thử",
  past_due: "Quá hạn thanh toán",
  suspended: "Tạm ngưng",
  canceled: "Đã hủy",
};

function BillingPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const qc = useQueryClient();
  const active = useActiveTenant();
  const tenantId = active.data?.tenantId;
  const isOwner = active.data?.role === "tenant_owner";

  const plansFn = useServerFn(listPlans);
  const subFn = useServerFn(getActiveSubscription);
  const entFn = useServerFn(getEntitlementSnapshot);
  const changeFn = useServerFn(changeSubscription);
  const cancelFn = useServerFn(cancelSubscription);
  const resumeFn = useServerFn(resumeSubscription);

  const plansQ = useQuery({ queryKey: ["billing", "plans"], queryFn: () => plansFn(), staleTime: 300_000 });
  const subQ = useQuery({
    queryKey: ["billing", "subscription", tenantId],
    queryFn: () => subFn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });
  const entQ = useQuery({
    queryKey: ["billing", "entitlements", tenantId],
    queryFn: () => entFn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["billing", "subscription", tenantId] }),
      qc.invalidateQueries({ queryKey: ["billing", "entitlements", tenantId] }),
    ]);

  const changeM = useMutation({
    mutationFn: (planCode: string) =>
      changeFn({
        data: {
          tenantId: tenantId!,
          planCode,
          metadata: {
            idempotencyKey: newKey("chg"),
            expectedRowVersion: subQ.data?.rowVersion,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Đã cập nhật gói dịch vụ");
      await invalidate();
    },
    onError: (e: Error) => toast.error(errText(e.message)),
  });

  const cancelM = useMutation({
    mutationFn: (immediate: boolean) =>
      cancelFn({
        data: {
          tenantId: tenantId!,
          immediate,
          idempotencyKey: newKey("cxl"),
          expectedRowVersion: subQ.data?.rowVersion,
        },
      }),
    onSuccess: async (_r, immediate) => {
      toast.success(immediate ? "Đã hủy gói và chuyển về Free" : "Đã hẹn hủy vào cuối kỳ");
      setConfirm(null);
      await invalidate();
    },
    onError: (e: Error) => toast.error(errText(e.message)),
  });

  const resumeM = useMutation({
    mutationFn: () => resumeFn({ data: { tenantId: tenantId! } }),
    onSuccess: async () => {
      toast.success("Đã khôi phục gói đăng ký");
      await invalidate();
    },
    onError: (e: Error) => toast.error(errText(e.message)),
  });

  const [confirm, setConfirm] = useState<null | "schedule" | "immediate">(null);

  const plans = plansQ.data ?? [];
  const sub = subQ.data;
  const currentOrder = useMemo(
    () => plans.find((p) => p.code === sub?.planCode)?.sortOrder ?? 0,
    [plans, sub?.planCode],
  );

  const quotaRows = (entQ.data?.entitlements ?? []).filter((e) => e.kind === "quota");

  // Chu kỳ thanh toán hiện tại
  const cycle = useMemo(() => {
    if (!sub?.periodStart || !sub.periodEnd) return null;
    const start = new Date(sub.periodStart).getTime();
    const end = new Date(sub.periodEnd).getTime();
    const now = Date.now();
    const total = Math.max(1, end - start);
    const pct = Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
    return { pct, daysLeft };
  }, [sub?.periodStart, sub?.periodEnd]);

  const autoRenew = !!sub && !sub.cancelAt && sub.status !== "canceled";

  if (active.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              <span>Gói dịch vụ</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Gói dịch vụ & thanh toán</h1>
            <p className="text-sm text-muted-foreground">
              Xem gói hiện tại, hạn mức sử dụng và tự nâng cấp, hạ cấp hoặc hủy đăng ký.
            </p>
          </div>

          {!tenantId ? (
            <EmptyPanel />
          ) : (
            <div className="space-y-6">
              {/* Current subscription */}
              <section className="rounded-2xl border border-border bg-surface p-5">
                {subQ.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tải gói hiện tại…
                  </div>
                ) : !sub ? (
                  <p className="text-sm text-muted-foreground">Tổ chức chưa có gói đăng ký nào.</p>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">{sub.planName || sub.planCode}</span>
                        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                          {STATUS_LABEL[sub.status] ?? sub.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Kỳ hiện tại: {fmtDate(sub.periodStart)} → {sub.periodEnd ? fmtDate(sub.periodEnd) : "không giới hạn"}
                      </p>
                      {sub.cancelAt && (
                        <p className="text-sm text-destructive">
                          Đã hẹn hủy vào {fmtDate(sub.cancelAt)}. Bạn vẫn dùng đầy đủ tính năng đến ngày này.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sub.cancelAt ? (
                        <button
                          onClick={() => resumeM.mutate()}
                          disabled={!isOwner || resumeM.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
                        >
                          {resumeM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          Khôi phục gói
                        </button>
                      ) : (
                        sub.planCode !== "free" && (
                          <button
                            onClick={() => setConfirm("schedule")}
                            disabled={!isOwner}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" /> Hủy gói
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
                {!isOwner && (
                  <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" /> Chỉ chủ sở hữu tổ chức mới có thể thay đổi gói dịch vụ.
                  </p>
                )}
              </section>

              {/* Plans */}
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Các gói khả dụng</h2>
                {plansQ.isLoading ? (
                  <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
                    Đang tải danh sách gói…
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {plans.map((p) => {
                      const isCurrent = p.code === sub?.planCode;
                      const upgrade = p.sortOrder > currentOrder;
                      return (
                        <div
                          key={p.id}
                          className={`flex flex-col rounded-2xl border p-5 transition-colors ${
                            isCurrent ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-base font-semibold">{p.name}</span>
                            {isCurrent && (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                                Đang dùng
                              </span>
                            )}
                          </div>
                          {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
                          <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                            {p.features
                              .filter((f) => f.enabled)
                              .slice(0, 6)
                              .map((f) => (
                                <li key={f.featureKey} className="flex items-start gap-2 text-muted-foreground">
                                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                  <span>
                                    {f.featureKey}
                                    {f.quotaLimit != null ? ` · ${f.quotaLimit.toLocaleString("vi-VN")}` : ""}
                                  </span>
                                </li>
                              ))}
                          </ul>
                          <button
                            disabled={isCurrent || !isOwner || changeM.isPending}
                            onClick={() => changeM.mutate(p.code)}
                            className={`mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                              upgrade
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "border border-border hover:bg-surface-2"
                            }`}
                          >
                            {changeM.isPending && changeM.variables === p.code ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : upgrade ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                            {isCurrent ? "Gói hiện tại" : upgrade ? "Nâng cấp" : "Hạ cấp"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Usage */}
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <Gauge className="h-4 w-4 text-primary" /> Hạn mức sử dụng kỳ này
                </h2>
                {entQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải hạn mức…</p>
                ) : quotaRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có hạn mức nào được cấu hình cho gói này.</p>
                ) : (
                  <div className="space-y-3">
                    {quotaRows.map((e) => {
                      const pct = e.quotaLimit ? Math.min(100, Math.round((e.currentUsage / e.quotaLimit) * 100)) : 0;
                      return (
                        <div key={e.featureKey}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span>{e.featureName}</span>
                            <span className="text-muted-foreground">
                              {e.currentUsage.toLocaleString("vi-VN")} /{" "}
                              {e.quotaLimit != null ? e.quotaLimit.toLocaleString("vi-VN") : "∞"} {e.unit ?? ""}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-base font-semibold">Xác nhận hủy gói</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Chọn cách hủy gói <strong>{sub?.planName}</strong>. Sau khi hủy, tổ chức sẽ chuyển về gói Free và các hạn
              mức sẽ được áp dụng lại.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => cancelM.mutate(false)}
                disabled={cancelM.isPending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {cancelM.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Hủy vào cuối kỳ
              </button>
              <button
                onClick={() => cancelM.mutate(true)}
                disabled={cancelM.isPending}
                className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Hủy ngay lập tức
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2"
              >
                Giữ nguyên gói
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function errText(msg: string) {
  if (msg.includes("PERMISSION_DENIED")) return "Bạn không có quyền thay đổi gói dịch vụ.";
  if (msg.includes("VERSION_CONFLICT")) return "Gói vừa được cập nhật ở nơi khác, hãy tải lại trang.";
  if (msg.includes("PLAN_NOT_FOUND")) return "Không tìm thấy gói dịch vụ.";
  if (msg.includes("SUBSCRIPTION_NOT_FOUND")) return "Tổ chức chưa có gói đăng ký.";
  return "Thao tác không thành công. Vui lòng thử lại.";
}

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <CreditCard className="h-6 w-6" />
      </div>
      <div className="text-base font-semibold">Chưa chọn tổ chức</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Hãy chọn hoặc tạo một tổ chức để xem và quản lý gói dịch vụ.
      </p>
      <Link
        to="/dashboard"
        className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Về Trang chủ
      </Link>
    </div>
  );
}
