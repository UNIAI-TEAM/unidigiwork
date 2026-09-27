import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitConsultationBooking, type CmsEntry } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";

export function ConsultationForm({
  services,
  defaultService = "",
}: {
  services: CmsEntry[];
  defaultService?: string;
}) {
  const { lang } = useI18n();
  const c = mk(lang);
  const fn = useServerFn(submitConsultationBooking);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    service: defaultService,
    message: "",
    when: "",
  });
  const m = useMutation({
    mutationFn: () => {
      const { when, ...rest } = f;
      return fn({ data: { ...rest, preferredAt: new Date(when).toISOString() } });
    },
    onSuccess: (res) => {
      toast.success(c.sent);
      void navigate({ to: "/tu-van/$token", params: { token: res.token } });
    },
    onError: () => toast.error(c.error),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      id="tu-van"
      className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{c.formTitle}</h2>
        <p className="text-sm text-muted-foreground">{c.formSub}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cf-name" label={c.name}>
          <Input
            id="cf-name"
            required
            maxLength={120}
            className="h-11"
            value={f.name}
            onChange={set("name")}
          />
        </Field>
        <Field id="cf-email" label={c.email}>
          <Input
            id="cf-email"
            type="email"
            required
            className="h-11"
            value={f.email}
            onChange={set("email")}
          />
        </Field>
        <Field id="cf-phone" label={c.phone}>
          <Input
            id="cf-phone"
            maxLength={40}
            className="h-11"
            value={f.phone}
            onChange={set("phone")}
          />
        </Field>
        <Field id="cf-company" label={c.company}>
          <Input
            id="cf-company"
            maxLength={200}
            className="h-11"
            value={f.company}
            onChange={set("company")}
          />
        </Field>
      </div>
      <Field id="cf-service" label={c.service}>
        <select
          id="cf-service"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={f.service}
          onChange={set("service")}
        >
          <option value="">{c.general}</option>
          <option value="uniOffice">uniOffice</option>
          {services.map((s) => (
            <option key={s.id} value={s.title}>
              {s.title}
            </option>
          ))}
        </select>
      </Field>
      <Field id="cf-when" label={c.preferredAt}>
        <Input
          id="cf-when"
          type="datetime-local"
          required
          className="h-11"
          value={f.when}
          onChange={set("when")}
        />
        <p className="text-xs text-muted-foreground">{c.preferredHint}</p>
      </Field>
      <Field id="cf-msg" label={c.message}>
        <Textarea
          id="cf-msg"
          rows={4}
          maxLength={4000}
          value={f.message}
          onChange={set("message")}
        />
      </Field>
      <Button type="submit" className="h-11" disabled={m.isPending}>
        {c.send}
      </Button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
