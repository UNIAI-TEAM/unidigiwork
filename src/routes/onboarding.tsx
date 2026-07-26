import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveTenant } from "@/lib/api/active-tenant.functions";
import { useProvisionTenant, useSetActiveTenant } from "@/features/tenants/hooks";
import { SLUG_PATTERN } from "@/contracts/tenants/tenant";
import { Building2, ArrowRight, Check, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Thiết lập tổ chức — UNIWORK" },
      { name: "description", content: "Tạo tenant và workspace đầu tiên của bạn." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: OnboardingPage,
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("General");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");

  const provision = useProvisionTenant();
  const setActive = useSetActiveTenant();

  // Idempotency key: stable for the lifetime of this page render.
  const idempotencyKey = useMemo(
    () => `onboard-${crypto.randomUUID()}`,
    [],
  );

  const autoSlug = slugTouched ? slug : slugify(name);
  const slugValid = SLUG_PATTERN.test(autoSlug);
  const nameValid = name.trim().length >= 2;
  const step1Valid = nameValid && slugValid;
  const step2Valid = workspaceName.trim().length >= 2;

  const onCreate = async () => {
    try {
      const res = await provision.mutateAsync({
        name: name.trim(),
        slug: autoSlug,
        defaultWorkspaceName: workspaceName.trim(),
        metadata: { idempotencyKey },
      });
      await setActive.mutateAsync(res.tenantId);
      toast.success("Đã tạo tenant thành công");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể tạo tenant";
      toast.error(
        message === "TENANT_SLUG_CONFLICT"
          ? "Slug đã được sử dụng. Vui lòng chọn slug khác."
          : message === "VALIDATION_FAILED"
            ? "Dữ liệu không hợp lệ."
            : message,
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            U
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">UNIWORK</div>
            <div className="text-xs text-muted-foreground">
              Thiết lập tổ chức của bạn
            </div>
          </div>
        </div>

        <Stepper current={step} />

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Thông tin tổ chức
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Đặt tên và slug định danh cho tenant.
                </p>
              </div>
              <Field label="Tên tổ chức" required>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Acme Corporation"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {!nameValid && name.length > 0 && (
                  <p className="mt-1 text-xs text-destructive">Tên phải có ít nhất 2 ký tự.</p>
                )}
              </Field>
              <Field label="Slug định danh" required hint="Chỉ chữ thường, số và dấu gạch ngang.">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 items-center rounded-md bg-surface-2 px-3 text-xs text-muted-foreground">
                    uniwork.app/
                  </div>
                  <input
                    value={autoSlug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    placeholder="acme"
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                {autoSlug && !slugValid && (
                  <p className="mt-1 text-xs text-destructive">
                    Slug không hợp lệ. Dùng 3-63 ký tự chữ thường/số/dấu gạch ngang.
                  </p>
                )}
              </Field>
              <StepFooter
                disabled={!step1Valid}
                onNext={() => setStep(2)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Workspace mặc định
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Workspace đầu tiên sẽ được tạo cùng tenant.
                </p>
              </div>
              <Field label="Tên workspace" required>
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="General"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Field>
              <Field label="Ngành nghề (tuỳ chọn)">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Chọn ngành nghề</option>
                  <option value="tech">Công nghệ</option>
                  <option value="finance">Tài chính</option>
                  <option value="education">Giáo dục</option>
                  <option value="healthcare">Y tế</option>
                  <option value="retail">Bán lẻ</option>
                  <option value="other">Khác</option>
                </select>
              </Field>
              <Field label="Quy mô đội ngũ (tuỳ chọn)">
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Chọn quy mô</option>
                  <option value="1-10">1-10 người</option>
                  <option value="11-50">11-50 người</option>
                  <option value="51-200">51-200 người</option>
                  <option value="200+">200+ người</option>
                </select>
              </Field>
              <StepFooter
                onBack={() => setStep(1)}
                disabled={!step2Valid}
                onNext={() => setStep(3)}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Xác nhận và tạo
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bạn sẽ trở thành tenant owner sau khi tạo.
                </p>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4 text-sm">
                <Row icon={<Building2 className="h-4 w-4" />} label="Tổ chức" value={name} />
                <Row icon={<Sparkles className="h-4 w-4" />} label="Slug" value={autoSlug} mono />
                <Row icon={<Check className="h-4 w-4" />} label="Workspace" value={workspaceName} />
                {industry && <Row label="Ngành" value={industry} />}
                {size && <Row label="Quy mô" value={size} />}
              </div>
              <StepFooter
                onBack={() => setStep(2)}
                nextLabel={provision.isPending ? "Đang tạo…" : "Tạo tenant"}
                nextIcon={provision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                disabled={provision.isPending || setActive.isPending}
                onNext={onCreate}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Tổ chức" },
    { n: 2, label: "Workspace" },
    { n: 3, label: "Xác nhận" },
  ];
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {steps.map((s, i) => {
        const active = s.n === current;
        const done = s.n < current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <div className={`text-sm ${active ? "font-semibold" : "text-muted-foreground"}`}>
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function StepFooter({
  onBack,
  onNext,
  disabled,
  nextLabel = "Tiếp tục",
  nextIcon = <ArrowRight className="h-4 w-4" />,
}: {
  onBack?: () => void;
  onNext: () => void;
  disabled?: boolean;
  nextLabel?: string;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-2"
        >
          Quay lại
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {nextLabel} {nextIcon}
      </button>
    </div>
  );
}