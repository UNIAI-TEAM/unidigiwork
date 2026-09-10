import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Minus,
  Sparkles,
  Building2,
  Rocket,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listPublicPlans, type PublicPlanDto } from "@/lib/api/pricing.functions";
import { getActiveTenant } from "@/lib/api/active-tenant.functions";
import { getActiveSubscription, changeSubscription } from "@/lib/api/billing.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Bảng giá — UNIWORK" },
      {
        name: "description",
        content:
          "Bảng giá UNIWORK: Starter, Business và Enterprise. Tính theo số nhân sự, có dùng thử miễn phí 14 ngày.",
      },
      { property: "og:title", content: "Bảng giá — UNIWORK" },
      {
        property: "og:description",
        content: "Ba gói linh hoạt cho mọi quy mô. Dùng thử miễn phí 14 ngày.",
      },
      { property: "og:url", content: "https://unidigiwork.lovable.app/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/pricing" }],
  }),
  component: PricingPage,
});

const PLAN_ICONS: Record<string, typeof Sparkles> = {
  free: Sparkles,
  pro: Rocket,
  business: Building2,
};

function formatPrice(p: PublicPlanDto): { value: string; unit: string } {
  if (p.priceLabel) return { value: p.priceLabel, unit: p.priceUnitLabel ?? "" };
  if (p.priceAmount === null) return { value: "Liên hệ", unit: "" };
  if (p.priceAmount === 0) return { value: "Miễn phí", unit: "" };
  const formatted = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: p.priceCurrency || "VND",
    maximumFractionDigits: 0,
  }).format(p.priceAmount);
  return {
    value: formatted,
    unit: p.priceUnitLabel ?? (p.billingPeriod === "year" ? "/ năm" : "/ tháng"),
  };
}

function formatQuota(value: number, unit: string | null): string {
  if (unit === "bytes") {
    if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(0)} TB`;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(0)} GB`;
    return `${(value / 1024 ** 2).toFixed(0)} MB`;
  }
  const n = new Intl.NumberFormat("vi-VN").format(value);
  const suffix =
    unit === "minutes"
      ? " phút"
      : unit === "seats"
        ? " thành viên"
        : unit === "tokens"
          ? " tokens"
          : unit === "runs"
            ? " lượt chạy"
            : unit === "requests"
              ? " requests"
              : unit === "items" || unit === "count"
                ? ""
                : "";
  return `${n}${suffix}`;
}

function featureLabel(f: PublicPlanDto["features"][number]): string {
  if (f.kind === "flag") return f.name;
  if (f.quotaLimit === null) return `${f.name}: không giới hạn`;
  return `${f.name}: ${formatQuota(f.quotaLimit, f.unit)}`;
}

function PricingPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PublicPlanDto | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const plansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => listPublicPlans(),
  });

  const tenantQuery = useQuery({
    queryKey: ["active-tenant-pricing"],
    enabled: signedIn,
    queryFn: () => getActiveTenant(),
  });

  const subQuery = useQuery({
    queryKey: ["active-subscription-pricing", tenantQuery.data?.tenantId ?? null],
    enabled: signedIn && !!tenantQuery.data?.tenantId,
    queryFn: () => getActiveSubscription({ data: { tenantId: tenantQuery.data!.tenantId } }),
  });

  const currentPlanCode = subQuery.data?.planCode ?? null;
  const plans = plansQuery.data ?? [];
  const currentPlan = plans.find((p) => p.code === currentPlanCode) ?? null;
  const tenantId = tenantQuery.data?.tenantId ?? null;

  const changeFn = useServerFn(changeSubscription);
  const changeMutation = useMutation({
    mutationFn: (plan: PublicPlanDto) =>
      changeFn({
        data: {
          tenantId: tenantId!,
          planCode: plan.code,
          metadata: { idempotencyKey: crypto.randomUUID() },
        },
      }),
    onSuccess: async (_res, plan) => {
      // PERF-005: chỉ làm mới dữ liệu billing/entitlement thay vì toàn bộ cache.
      await Promise.all(
        [["plans"], ["billing"], ["subscription"], ["entitlements"], ["tenant-context"]].map(
          (key) => qc.invalidateQueries({ queryKey: key }),
        ),
      );
      setCheckoutPlan(null);
      toast.success(`Đã chuyển sang gói ${plan.name}`);
      void navigate({ to: "/billing" });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Không đổi được gói. Vui lòng thử lại.");
    },
  });

  const direction = (p: PublicPlanDto): "upgrade" | "downgrade" | "switch" => {
    if (!currentPlan) return "switch";
    if (p.sortOrder > currentPlan.sortOrder) return "upgrade";
    if (p.sortOrder < currentPlan.sortOrder) return "downgrade";
    return "switch";
  };

  return (
    <PublicShell active="pricing">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-10 text-center sm:px-6 sm:py-14 lg:py-20">
          <span className="module-label inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-pale-purple px-3 py-1.5 text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Bảng giá minh bạch
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold sm:text-5xl">
            Giá hợp lý cho mọi quy mô đội ngũ
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Bắt đầu miễn phí, nâng cấp khi đội ngũ phát triển. Hợp đồng linh hoạt theo tháng hoặc
            năm, có hoá đơn VAT đầy đủ.
          </p>
          {tenantQuery.data && currentPlanCode && (
            <p className="mt-4 text-sm text-muted-foreground">
              Tổ chức{" "}
              <span className="font-medium text-foreground">{tenantQuery.data.tenantName}</span>{" "}
              đang dùng gói{" "}
              <span className="font-medium text-primary">
                {subQuery.data?.planName ?? currentPlanCode}
              </span>
              .
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:py-20">
        {plansQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bảng giá…
          </div>
        ) : plansQuery.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Không tải được bảng giá. Vui lòng thử lại sau.
          </p>
        ) : plans.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Chưa có gói dịch vụ nào được công bố.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((p) => {
              const Icon = PLAN_ICONS[p.code] ?? Sparkles;
              const price = formatPrice(p);
              const isCurrent = currentPlanCode === p.code;
              const highlight = p.isFeatured || isCurrent;
              return (
                <div
                  key={p.id}
                  className={`relative flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-card sm:p-6 ${highlight ? "border-primary ring-1 ring-primary/20" : "border-border"}`}
                >
                  {(isCurrent || p.isFeatured) && (
                    <span className="module-label absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-action px-3 py-1.5 text-action-foreground">
                      {isCurrent ? "Gói hiện tại" : "Phổ biến nhất"}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                  </div>
                  <div className="mt-4 flex min-w-0 flex-wrap items-baseline gap-1">
                    <span className="break-words font-heading text-3xl font-bold sm:text-4xl">
                      {price.value}
                    </span>
                    {price.unit && (
                      <span className="text-sm text-muted-foreground">{price.unit}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {p.tagline ?? p.description ?? ""}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f.featureKey} className="flex items-start gap-2">
                        {f.enabled ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className={f.enabled ? "" : "text-muted-foreground line-through"}>
                          {featureLabel(f)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <span className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">
                      Đang sử dụng
                    </span>
                  ) : signedIn && tenantId && p.priceAmount !== null ? (
                    <button
                      type="button"
                      onClick={() => setCheckoutPlan(p)}
                      className={`mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${highlight ? "bg-action text-action-foreground hover:opacity-90" : "border border-border-strong bg-card hover:bg-surface-2"}`}
                    >
                      {direction(p) === "upgrade" ? (
                        <>
                          Nâng cấp lên {p.name} <ArrowUp className="h-4 w-4" />
                        </>
                      ) : direction(p) === "downgrade" ? (
                        <>
                          Hạ cấp xuống {p.name} <ArrowDown className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Chọn gói {p.name} <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  ) : (
                    <Link
                      to={p.priceAmount === null ? "/contact" : "/auth"}
                      className={`mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${highlight ? "bg-action text-action-foreground hover:opacity-90" : "border border-border-strong bg-card hover:bg-surface-2"}`}
                    >
                      {p.priceAmount === null
                        ? (p.ctaLabel ?? "Liên hệ tư vấn")
                        : "Đăng nhập để đổi gói"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={!!checkoutPlan} onOpenChange={(o) => !o && setCheckoutPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {checkoutPlan && direction(checkoutPlan) === "downgrade"
                ? "Xác nhận hạ cấp gói"
                : "Xác nhận nâng cấp gói"}
            </DialogTitle>
            <DialogDescription>
              {checkoutPlan && (
                <>
                  Tổ chức <span className="font-medium">{tenantQuery.data?.tenantName}</span> sẽ
                  chuyển từ gói{" "}
                  <span className="font-medium">{currentPlan?.name ?? "hiện tại"}</span> sang{" "}
                  <span className="font-medium">{checkoutPlan.name}</span> (
                  {formatPrice(checkoutPlan).value} {formatPrice(checkoutPlan).unit}). Chi phí được
                  tính tỷ lệ theo ngày sử dụng còn lại của chu kỳ.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutPlan(null)}>
              Huỷ
            </Button>
            <Button
              onClick={() => checkoutPlan && changeMutation.mutate(checkoutPlan)}
              disabled={changeMutation.isPending}
            >
              {changeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tiếp tục thanh toán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="border-t border-border bg-surface py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Câu hỏi thường gặp</h2>
          <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-card shadow-card">
            {[
              {
                q: "UNIWORK có dùng thử miễn phí không?",
                a: "Có. Mọi gói Business đều có 14 ngày dùng thử đầy đủ tính năng, không cần thẻ thanh toán.",
              },
              {
                q: "Có thể nâng cấp / hạ cấp gói bất cứ lúc nào?",
                a: "Có. Bạn có thể đổi gói trong Settings · Billing, chi phí được tính tỷ lệ theo ngày sử dụng.",
              },
              {
                q: "Dữ liệu của tôi được lưu ở đâu?",
                a: "Mặc định lưu tại trung tâm dữ liệu Tier-3 ở Hà Nội và TP. HCM. Gói Enterprise hỗ trợ on-premise.",
              },
              {
                q: "Có hỗ trợ xuất hoá đơn VAT không?",
                a: "Có. UNIWORK phát hành hoá đơn điện tử theo Thông tư 78 ngay sau khi thanh toán.",
              },
            ].map((f) => (
              <details key={f.q} className="group px-4 py-1 sm:px-5">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
