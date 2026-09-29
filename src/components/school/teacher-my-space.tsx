import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CalendarDays, Camera, ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { getMyTeacherSpace, updateMyTeacherProfile, type MyPlan } from "@/lib/api/school-my-space.functions";

function range() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 7);
  const to = new Date(now);
  to.setDate(now.getDate() + 21);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Khu giáo viên trong Không gian của tôi — chỉ hiện khi tenant bật gói Trường học. */
export function TeacherMySpace() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const load = useServerFn(getMyTeacherSpace);
  const save = useServerFn(updateMyTeacherProfile);
  const r = useMemo(range, []);
  const q = useQuery({ queryKey: ["school-my-space", r.from], queryFn: () => load({ data: r }) });
  const [form, setForm] = useState({ displayName: "", phone: "", title: "", subject: "" });
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const p = q.data?.enabled ? q.data.profile : null;
  useEffect(() => {
    if (p) setForm({ displayName: p.display_name ?? "", phone: p.phone ?? "", title: p.title ?? "", subject: p.subject ?? "" });
  }, [p]);

  const m = useMutation({
    mutationFn: () => save({ data: { ...form, avatarObjectKey: avatarKey, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(t("mys.saved"));
      setAvatarKey(null);
      qc.invalidateQueries({ queryKey: ["school-my-space"] });
    },
    onError: () => toast.error(t("mys.saveFailed")),
  });

  if (q.isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!q.data?.enabled || !p) return null;
  const tenantId = q.data.tenantId;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) return toast.error(t("mys.avatarInvalid"));
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${tenantId}/${u.user?.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("member-avatars").upload(key, f, { contentType: f.type });
    setUploading(false);
    if (error) return toast.error(t("mys.avatarInvalid"));
    setAvatarKey(key);
    setPreview(URL.createObjectURL(f));
  }

  const lessons = q.data.plans.filter((x) => x.kind === "lesson");
  const assignments = q.data.plans.filter((x) => x.kind === "assignment");
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const img = preview ?? p.avatar_url;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]" aria-label={t("mys.title")}>
      <form
        className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <h2 className="font-heading text-base font-semibold">{t("mys.profile")}</h2>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted"
            aria-label={t("mys.changeAvatar")}
          >
            {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-semibold">{(form.displayName || "?").charAt(0)}</span>}
            <span className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{p.email}</p>
            <p className="text-muted-foreground">{p.department ?? t("mys.noDept")}</p>
            {uploading && <p className="text-xs text-muted-foreground">{t("mys.uploading")}</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <Field id="mys-name" label={t("mys.name")} value={form.displayName} onChange={set("displayName")} required />
          <Field id="mys-phone" label={t("mys.phone")} value={form.phone} onChange={set("phone")} type="tel" />
          <Field id="mys-title" label={t("mys.jobTitle")} value={form.title} onChange={set("title")} />
          <Field id="mys-subject" label={t("mys.subject")} value={form.subject} onChange={set("subject")} />
        </div>
        <Button type="submit" className="mt-4 min-h-11 w-full" disabled={m.isPending || uploading || !form.displayName.trim()}>
          {t("mys.save")}
        </Button>
      </form>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <PlanList icon={<CalendarDays className="h-4 w-4" />} title={t("mys.lessons")} empty={t("mys.noLessons")} items={lessons} fmt={(x) => fmt(x.starts_at)} t={t} />
        <PlanList icon={<ClipboardList className="h-4 w-4" />} title={t("mys.assignments")} empty={t("mys.noAssignments")} items={assignments} fmt={(x) => fmt(x.starts_at ?? x.ends_at)} t={t} />
        <Link
          to="/school-dept-plans"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent md:col-span-2"
        >
          <Plus className="h-4 w-4" /> {t("mys.post")}
        </Link>
      </div>
    </section>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; required?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} className="min-h-11" value={props.value} onChange={props.onChange} type={props.type} required={props.required} />
    </div>
  );
}

function PlanList(props: { icon: React.ReactNode; title: string; empty: string; items: MyPlan[]; fmt: (x: MyPlan) => string; t: (k: any) => string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
        {props.icon} {props.title} <span className="text-muted-foreground">· {props.items.length}</span>
      </h3>
      {props.items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" /> {props.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {props.items.map((x) => (
            <li key={x.id} className="flex min-w-0 items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{x.title}{x.class_name ? ` · ${x.class_name}` : ""}</p>
                <p className="text-xs text-muted-foreground">{props.fmt(x)}</p>
              </div>
              {x.task_status === "done" && <span className="shrink-0 text-xs font-medium text-success">{props.t("mys.done")}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
