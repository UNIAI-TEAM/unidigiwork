import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  Cloud,
  CreditCard,
  Database,
  FileDown,
  Globe2,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  LogOut,
  MonitorSmartphone,
  Palette,
  Plug,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PushDevicesPanel } from "@/components/push-devices-panel";
import {
  getMyNotifPrefs,
  updateMyNotifPrefs,
  PREF_KEYS,
  type NotifPrefs,
  type PrefKey,
} from "@/lib/api/notif-prefs.functions";
import { listPeople, upsertPersonProfile, type PersonDTO } from "@/lib/api/people.functions";
import { getActiveSubscription, listInvoices } from "@/lib/api/billing.functions";
import { useActiveTenant } from "@/features/tenants/hooks";
import { clearCache } from "@/lib/offline/db";
import { performSignOut } from "@/lib/auth/sign-out";
import { LANGS, localeTag, useI18n, type Key, type Lang } from "@/lib/i18n";
import { FONT_FAMILIES, FONT_SCALES, useTheme, type FontFamily, type FontScale } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";

export type MobileSettingsTab =
  | "profile"
  | "account"
  | "password"
  | "notifications"
  | "appearance"
  | "language"
  | "integrations"
  | "team"
  | "security"
  | "billing"
  | "data";

type Section = { key: MobileSettingsTab; label: Key; description: Key; icon: typeof User };

const SECTIONS: Section[] = [
  { key: "profile", label: "ac.20", description: "ac.21", icon: User },
  { key: "account", label: "ac.22", description: "ac.23", icon: CircleUserRound },
  { key: "password", label: "ac.24", description: "ac.25", icon: KeyRound },
  { key: "notifications", label: "ac.26", description: "ac.27", icon: Bell },
  { key: "appearance", label: "ac.28", description: "ac.29", icon: Palette },
  { key: "language", label: "ac.30", description: "ac.31", icon: Languages },
  { key: "integrations", label: "ac.32", description: "ac.33", icon: Plug },
  { key: "team", label: "ac.34", description: "ac.35", icon: Users },
  { key: "security", label: "ac.36", description: "ac.37", icon: ShieldCheck },
  { key: "billing", label: "ac.38", description: "ac.39", icon: CreditCard },
  { key: "data", label: "ac.40", description: "ac.41", icon: Database },
];

function Group({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="min-w-0">
      {title ? (
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Row({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-16 min-w-0 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      {icon ? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="px-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function MobileSettings({ tab }: { tab?: MobileSettingsTab }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const section = SECTIONS.find((item) => item.key === tab);

  if (!section) {
    return (
      <div className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
        <header className="pb-5 pt-2">
          <h1 className="text-2xl font-semibold">{t("ac.80")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ac.81")}</p>
        </header>
        <Group>
          {SECTIONS.map((item) => (
            <Button
              key={item.key}
              variant="ghost"
              className="h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4 py-3 text-left"
              onClick={() => void navigate({ to: "/m/settings", search: { tab: item.key } })}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t(item.label)}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {t(item.description)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          ))}
        </Group>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl overflow-x-hidden pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => void navigate({ to: "/m/settings" })}
          aria-label={t("wp.create.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{t(section.label)}</h1>
          <p className="truncate text-xs text-muted-foreground">{t(section.description)}</p>
        </div>
      </header>
      <div className="min-w-0 space-y-5 px-4 py-5">
        <SettingsBody tab={section.key} />
      </div>
    </div>
  );
}

function SettingsBody({ tab }: { tab: MobileSettingsTab }) {
  if (tab === "profile") return <ProfileSettings />;
  if (tab === "account") return <AccountSettings />;
  if (tab === "password") return <PasswordSettings />;
  if (tab === "notifications") return <NotificationSettings />;
  if (tab === "appearance") return <AppearanceSettings />;
  if (tab === "language") return <LanguageSettings />;
  if (tab === "integrations") return <IntegrationSettings />;
  if (tab === "team") return <TeamSettings />;
  if (tab === "security") return <SecuritySettings />;
  if (tab === "billing") return <BillingSettings />;
  return <DataSettings />;
}

function usePeople() {
  const list = useServerFn(listPeople);
  return useQuery({ queryKey: ["mobile-settings", "people"], queryFn: () => list() });
}

function ProfileSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const people = usePeople();
  const save = useServerFn(upsertPersonProfile);
  const me = people.data?.people.find((person) => person.isSelf);
  const [form, setForm] = useState({
    displayName: "",
    title: "",
    department: "",
    phone: "",
    about: "",
  });
  useEffect(() => {
    if (me)
      setForm({
        displayName: me.name,
        title: me.title,
        department: me.department,
        phone: me.phone,
        about: me.about,
      });
  }, [me]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!me) throw new Error(t("m.settings.profile.unavailable"));
      return save({ data: { userId: me.id, ...form } });
    },
    onSuccess: async () => {
      toast.success(t("m.settings.saved"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mobile-settings", "people"] }),
        qc.invalidateQueries({ queryKey: ["identity", "current-user"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (people.isLoading) return <LoadingRows />;
  if (!me) return <EmptyState text={t("m.settings.profile.unavailable")} />;
  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <>
      <Group>
        <Row
          title={me.name}
          subtitle={me.email}
          icon={<span className="text-sm font-semibold">{initials}</span>}
        />
      </Group>
      <div className="space-y-4">
        <Field label={t("m.settings.profile.name")}>
          <Input
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </Field>
        <Field label={t("m.settings.profile.title")}>
          <Input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
        </Field>
        <Field label={t("m.settings.profile.department")}>
          <Input
            value={form.department}
            onChange={(event) =>
              setForm((current) => ({ ...current, department: event.target.value }))
            }
          />
        </Field>
        <Field label={t("m.settings.profile.phone")}>
          <Input
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
        </Field>
        <Field label={t("m.settings.profile.about")}>
          <textarea
            className="min-h-28 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base shadow-card outline-none focus:border-primary focus:ring-2 focus:ring-ring md:text-sm"
            value={form.about}
            maxLength={2000}
            onChange={(event) => setForm((current) => ({ ...current, about: event.target.value }))}
          />
        </Field>
      </div>
      <Button
        className="h-12 w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("ac.82")}
      </Button>
    </>
  );
}

function AccountSettings() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const active = useActiveTenant();
  const account = useQuery({
    queryKey: ["mobile-settings", "account"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const signOut = async () => {
    await performSignOut(qc);
    await navigate({ to: "/auth" });
  };
  return (
    <>
      <Group title={t("m.settings.account.identity")}>
        <Row
          title={t("ac.50")}
          subtitle={account.data?.email ?? t("m.settings.notAvailable")}
          icon={<Globe2 className="h-4 w-4" />}
          right={
            <span className="text-xs text-success">
              {account.data?.email_confirmed_at ? t("ac.51") : ""}
            </span>
          }
        />
        <Row
          title={t("m.settings.account.organization")}
          subtitle={active.data?.tenantName ?? t("m.settings.notAvailable")}
          icon={<Cloud className="h-4 w-4" />}
        />
        <Row
          title={t("m.settings.account.role")}
          subtitle={active.data?.role ?? t("m.settings.notAvailable")}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </Group>
      <Button
        variant="outline"
        className="h-12 w-full text-destructive"
        onClick={() => void signOut()}
      >
        <LogOut className="h-4 w-4" />
        {t("m.settings.signOut")}
      </Button>
    </>
  );
}

function PasswordSettings() {
  const { t } = useI18n();
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!currentPwd || !newPwd || !confirmPwd) throw new Error(t("ac.73"));
      if (newPwd !== confirmPwd) throw new Error(t("ac.74"));
      const { data } = await supabase.auth.getUser();
      if (!data.user?.email) throw new Error(t("ac.75"));
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.user.email,
        password: currentPwd,
      });
      if (authError) throw new Error(t("ac.76"));
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success(t("ac.77"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("ac.61")}</p>
      <div className="space-y-4">
        <Field label={t("ac.62")}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPwd}
            onChange={(event) => setCurrentPwd(event.target.value)}
          />
        </Field>
        <Field label={t("ac.63")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPwd}
            onChange={(event) => setNewPwd(event.target.value)}
          />
        </Field>
        <Field label={t("ac.64")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPwd}
            onChange={(event) => setConfirmPwd(event.target.value)}
          />
        </Field>
      </div>
      <Button
        className="h-12 w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Lock className="h-4 w-4" />
        {mutation.isPending ? t("ac.65") : t("ac.66")}
      </Button>
    </>
  );
}

const NOTIFICATION_GROUPS: Array<{ title: Key; prefix: "in_app" | "email" }> = [
  { title: "m.settings.notifications.inApp", prefix: "in_app" },
  { title: "m.settings.notifications.email", prefix: "email" },
];
const NOTIFICATION_CATEGORIES: Array<{ key: string; label: Key }> = [
  { key: "mention", label: "m.settings.notifications.mention" },
  { key: "task", label: "m.settings.notifications.task" },
  { key: "meeting", label: "m.settings.notifications.meeting" },
  { key: "document", label: "m.settings.notifications.document" },
  { key: "workflow", label: "m.settings.notifications.workflow" },
  { key: "system", label: "m.settings.notifications.system" },
];

function NotificationSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const getPrefs = useServerFn(getMyNotifPrefs);
  const updatePrefs = useServerFn(updateMyNotifPrefs);
  const query = useQuery({ queryKey: ["notif-prefs"], queryFn: () => getPrefs() });
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  useEffect(() => {
    if (query.data) setPrefs(query.data);
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => updatePrefs({ data: patch }),
    onSuccess: (data) => {
      setPrefs(data);
      qc.setQueryData(["notif-prefs"], data);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = (key: PrefKey) => {
    if (!prefs) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    mutation.mutate({ [key]: next });
  };
  if (!prefs) return <LoadingRows />;
  return (
    <>
      <div className="[&_button]:min-h-11 [&_button]:shrink-0">
        {" "}
        <PushDevicesPanel />{" "}
      </div>
      {NOTIFICATION_GROUPS.map((group) => (
        <Group key={group.prefix} title={t(group.title)}>
          {NOTIFICATION_CATEGORIES.map((category) => {
            const key = `${group.prefix}_${category.key}` as PrefKey;
            return (
              <Row
                key={key}
                title={t(category.label)}
                right={
                  <Switch
                    checked={prefs[key]}
                    onCheckedChange={() => toggle(key)}
                    aria-label={t(category.label)}
                  />
                }
              />
            );
          })}
          {group.prefix === "email" ? (
            <>
              <Row
                title={t("m.settings.notifications.digest")}
                right={
                  <Switch
                    checked={prefs.email_daily_digest}
                    onCheckedChange={() => toggle("email_daily_digest")}
                  />
                }
              />
              <Row
                title={t("m.settings.notifications.news")}
                right={
                  <Switch
                    checked={prefs.email_product_news}
                    onCheckedChange={() => toggle("email_product_news")}
                  />
                }
              />
            </>
          ) : null}
        </Group>
      ))}
    </>
  );
}

function AppearanceSettings() {
  const { t } = useI18n();
  const {
    theme,
    toggle,
    contrast,
    setContrast,
    fontScale,
    setFontScale,
    fontFamily,
    setFontFamily,
  } = useTheme();
  return (
    <>
      <Group title={t("m.settings.appearance.theme")}>
        <Row
          title={t("m.settings.appearance.dark")}
          subtitle={t("m.settings.appearance.darkHint")}
          icon={<Palette className="h-4 w-4" />}
          right={<Switch checked={theme === "dark"} onCheckedChange={toggle} />}
        />
        <Row
          title={t("m.settings.appearance.contrast")}
          subtitle={t("m.settings.appearance.contrastHint")}
          icon={<MonitorSmartphone className="h-4 w-4" />}
          right={
            <Switch
              checked={contrast === "high"}
              onCheckedChange={(checked) => setContrast(checked ? "high" : "normal")}
            />
          }
        />
      </Group>
      <Group title={t("m.settings.appearance.reading")}>
        <Row
          title={t("m.settings.appearance.fontSize")}
          right={
            <Select value={fontScale} onValueChange={(value) => setFontScale(value as FontScale)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SCALES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <Row
          title={t("m.settings.appearance.font")}
          right={
            <Select
              value={fontFamily}
              onValueChange={(value) => setFontFamily(value as FontFamily)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </Group>
    </>
  );
}

function LanguageSettings() {
  const { t, lang, setLang } = useI18n();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  return (
    <>
      <Group title={t("m.settings.language.display")}>
        {LANGS.map((option) => (
          <Row
            key={option.code}
            title={option.label}
            right={
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full"
                onClick={() => setLang(option.code as Lang)}
                aria-label={option.label}
              >
                {lang === option.code ? <Check className="h-5 w-5 text-primary" /> : null}
              </Button>
            }
          />
        ))}
      </Group>
      <Group title={t("m.settings.language.region")}>
        <Row
          title={t("m.settings.language.timezone")}
          subtitle={timezone}
          icon={<Globe2 className="h-4 w-4" />}
        />
        <Row
          title={t("m.settings.language.preview")}
          subtitle={new Intl.DateTimeFormat(localeTag(lang), {
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date())}
        />
      </Group>
    </>
  );
}

function IntegrationSettings() {
  const { t } = useI18n();
  const account = useQuery({
    queryKey: ["mobile-settings", "providers"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const providers = (account.data?.app_metadata?.providers as string[] | undefined) ?? [];
  return (
    <>
      <Group title={t("m.settings.integrations.connected")}>
        {providers.length ? (
          providers.map((provider) => (
            <Row
              key={provider}
              title={provider}
              subtitle={t("m.settings.integrations.identity")}
              icon={<Plug className="h-4 w-4" />}
              right={<Check className="h-4 w-4 text-success" />}
            />
          ))
        ) : (
          <Row
            title={t("m.settings.integrations.none")}
            subtitle={t("m.settings.integrations.noneHint")}
            icon={<Plug className="h-4 w-4" />}
          />
        )}
      </Group>
      <p className="px-1 text-xs text-muted-foreground">{t("m.settings.integrations.note")}</p>
    </>
  );
}

function TeamSettings() {
  const { t } = useI18n();
  const people = usePeople();
  if (people.isLoading) return <LoadingRows />;
  if (!people.data?.people.length) return <EmptyState text={t("m.settings.team.empty")} />;
  return (
    <Group title={t("m.settings.team.count").replace("{n}", String(people.data.people.length))}>
      {people.data.people.map((person) => (
        <MemberRow key={person.id} person={person} />
      ))}
    </Group>
  );
}

function MemberRow({ person }: { person: PersonDTO }) {
  const { t } = useI18n();
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <Row
      title={person.name}
      subtitle={[person.title, person.email].filter(Boolean).join(" · ")}
      icon={<span className="text-xs font-semibold">{initials}</span>}
      right={
        <span className="max-w-24 truncate text-xs text-muted-foreground">
          {person.isSelf ? t("m.settings.team.you") : person.role}
        </span>
      }
    />
  );
}

function SecuritySettings() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const account = useQuery({
    queryKey: ["mobile-settings", "security"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const signOut = async () => {
    await performSignOut(qc);
    await navigate({ to: "/auth" });
  };
  return (
    <>
      <Group title={t("m.settings.security.session")}>
        <Row
          title={t("m.settings.security.current")}
          subtitle={
            account.data?.last_sign_in_at
              ? new Intl.DateTimeFormat(localeTag(lang), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(account.data.last_sign_in_at))
              : t("m.settings.notAvailable")
          }
          icon={<Smartphone className="h-4 w-4" />}
          right={<span className="text-xs text-success">{t("m.settings.security.active")}</span>}
        />
        <Row
          title={t("m.settings.security.provider")}
          subtitle={account.data?.app_metadata?.provider ?? t("m.settings.notAvailable")}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </Group>
      <Button
        variant="outline"
        className="h-12 w-full text-destructive"
        onClick={() => void signOut()}
      >
        <LogOut className="h-4 w-4" />
        {t("m.settings.signOut")}
      </Button>
    </>
  );
}

function BillingSettings() {
  const { t, lang } = useI18n();
  const active = useActiveTenant();
  const tenantId = active.data?.tenantId;
  const getSubscription = useServerFn(getActiveSubscription);
  const getInvoices = useServerFn(listInvoices);
  const subscription = useQuery({
    queryKey: ["billing", "subscription", tenantId],
    queryFn: () => getSubscription({ data: { tenantId: tenantId ?? "" } }),
    enabled: Boolean(tenantId),
  });
  const invoices = useQuery({
    queryKey: ["billing", "invoices", tenantId],
    queryFn: () => getInvoices({ data: { tenantId: tenantId ?? "", limit: 12 } }),
    enabled: Boolean(tenantId),
  });
  if (subscription.isLoading || invoices.isLoading) return <LoadingRows />;
  return (
    <>
      <Group title={t("m.settings.billing.current")}>
        <Row
          title={subscription.data?.planName || t("m.settings.billing.noPlan")}
          subtitle={
            subscription.data?.periodEnd
              ? `${t("m.settings.billing.renews")} ${new Intl.DateTimeFormat(localeTag(lang)).format(new Date(subscription.data.periodEnd))}`
              : (subscription.data?.status ?? t("m.settings.notAvailable"))
          }
          icon={<CreditCard className="h-4 w-4" />}
          right={
            subscription.data?.status ? (
              <span className="text-xs text-muted-foreground">{subscription.data.status}</span>
            ) : undefined
          }
        />
      </Group>
      <Group title={t("m.settings.billing.invoices")}>
        {(invoices.data ?? []).length ? (
          invoices.data?.map((invoice) => (
            <Row
              key={invoice.id}
              title={invoice.invoiceNumber}
              subtitle={new Intl.DateTimeFormat(localeTag(lang)).format(new Date(invoice.issuedAt))}
              right={
                <span className="text-right text-xs">
                  <span className="block font-semibold">
                    {new Intl.NumberFormat(localeTag(lang), {
                      style: "currency",
                      currency: invoice.currency,
                      maximumFractionDigits: 0,
                    }).format(invoice.amount)}
                  </span>
                  <span className="text-muted-foreground">{invoice.status}</span>
                </span>
              }
            />
          ))
        ) : (
          <Row title={t("m.settings.billing.noInvoices")} icon={<FileDown className="h-4 w-4" />} />
        )}
      </Group>
    </>
  );
}

function DataSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then((value) => setStorage({ usage: value.usage ?? 0, quota: value.quota ?? 0 }));
  }, []);
  const clear = async () => {
    await clearCache();
    qc.clear();
    toast.success(t("m.settings.data.cleared"));
  };
  const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <Group title={t("m.settings.data.offline")}>
      <Row
        title={t("m.settings.data.storage")}
        subtitle={
          storage
            ? `${formatMb(storage.usage)} / ${formatMb(storage.quota)}`
            : t("m.settings.data.calculating")
        }
        icon={<Database className="h-4 w-4" />}
      />
      <Row
        title={t("m.settings.data.clear")}
        subtitle={t("m.settings.data.clearHint")}
        icon={<Trash2 className="h-4 w-4 text-destructive" />}
        right={
          <Button variant="outline" className="min-h-11" onClick={() => void clear()}>
            {t("m.settings.data.clearAction")}
          </Button>
        }
      />
    </Group>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
