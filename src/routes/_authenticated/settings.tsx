import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  getMyNotifPrefs,
  updateMyNotifPrefs,
  PREF_KEYS,
  type NotifPrefs,
  type PrefKey,
} from "@/lib/api/notif-prefs.functions";
import {
  User,
  Lock,
  Bell,
  Palette,
  Globe,
  Plug,
  Users as UsersIcon,
  ShieldCheck,
  CreditCard,
  Database,
  ChevronRight,
  Camera,
  Check,
  Trash2,
  Plus,
  Smartphone,
  Monitor,
  LogOut,
  KeyRound,
  Mail,
  Languages,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { PushDevicesPanel } from "@/components/push-devices-panel";

const searchSchema = z.object({
  tab: z
    .enum([
      "profile",
      "account",
      "password",
      "notifications",
      "appearance",
      "language",
      "integrations",
      "team",
      "security",
      "billing",
      "data",
    ])
    .optional(),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Cài đặt — UNIWORK" },
      { name: "description", content: "Cấu hình tài khoản, bảo mật và tích hợp." },
    ],
  }),
  component: SettingsPage,
});

type SectionKey =
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

const SECTIONS: { key: SectionKey; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "profile", label: "Hồ sơ cá nhân", desc: "Tên, ảnh đại diện, chức danh", icon: User },
  { key: "account", label: "Tài khoản", desc: "Email, tên đăng nhập", icon: KeyRound },
  { key: "password", label: "Đổi mật khẩu", desc: "Mật khẩu, xác thực 2 lớp", icon: Lock },
  { key: "notifications", label: "Thông báo", desc: "Email, in-app, push", icon: Bell },
  { key: "appearance", label: "Giao diện", desc: "Chủ đề sáng/tối, mật độ", icon: Palette },
  { key: "language", label: "Ngôn ngữ & múi giờ", desc: "Tiếng Việt, GMT+7", icon: Languages },
  { key: "integrations", label: "Tích hợp", desc: "Google, Slack, GitHub", icon: Plug },
  { key: "team", label: "Thành viên & vai trò", desc: "Quản lý quyền truy cập", icon: UsersIcon },
  { key: "security", label: "Bảo mật", desc: "2FA, phiên đăng nhập", icon: ShieldCheck },
  { key: "billing", label: "Gói & thanh toán", desc: "Gói hiện tại, hóa đơn", icon: CreditCard },
  { key: "data", label: "Dữ liệu", desc: "Sao lưu, xuất, xóa", icon: Database },
];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none ${props.className ?? ""}`}
    />
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-surface-2"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function Toggle({ title, desc, defaultOn }: { title: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-surface-2/40 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={on} onChange={() => setOn((v) => !v)} />
    </div>
  );
}

function ProfileSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-2/40 p-4">
        <div className="relative">
          <img
            src={avatar("nguyen-van-a-1")}
            alt=""
            className="h-16 w-16 rounded-xl bg-surface object-cover ring-1 ring-border"
          />
          <button className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Camera className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Nguyễn Văn A</div>
          <div className="text-xs text-muted-foreground">
            Ảnh đại diện hiển thị trên hồ sơ và các bình luận
          </div>
        </div>
        <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2">
          Tải lên
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ và tên">
          <Input defaultValue="Nguyễn Văn A" />
        </Field>
        <Field label="Chức danh">
          <Input defaultValue="Giám đốc Điều hành" />
        </Field>
        <Field label="Phòng ban">
          <Input defaultValue="Ban Lãnh đạo" />
        </Field>
        <Field label="Số điện thoại">
          <Input defaultValue="+84 90 123 45 67" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tiểu sử ngắn" hint="Tối đa 240 ký tự, hiển thị công khai trong workspace.">
            <textarea
              defaultValue="CEO Unicom — xây dựng nền tảng làm việc số cho doanh nghiệp Việt."
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">nguyenvana@unicom.vn</span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              Đã xác minh
            </span>
          </div>
        </Field>
        <Field label="Tên đăng nhập">
          <Input defaultValue="nguyenvana" />
        </Field>
      </div>
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="text-sm font-semibold text-destructive">Vùng nguy hiểm</div>
        <p className="text-xs text-muted-foreground">
          Xóa tài khoản sẽ gỡ toàn bộ dữ liệu cá nhân khỏi workspace.
        </p>
        <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-destructive/60 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> Xóa tài khoản
        </button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const openConfirm = () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      toast.error("Vui lòng điền đầy đủ các trường mật khẩu.");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Mật khẩu mới và xác nhận không khớp.");
      return;
    }
    setDialogOpen(true);
  };

  // Đổi mật khẩu thật qua API xác thực, sau đó đồng bộ lại phiên đăng nhập.
  const handleUpdate = async () => {
    setDialogOpen(false);
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (userErr || !email) throw new Error("Không xác định được tài khoản hiện tại.");

      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPwd,
      });
      if (reauthErr) throw new Error("Mật khẩu hiện tại không đúng.");

      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) throw new Error(updErr.message);

      await supabase.auth.refreshSession();
      await supabase.auth.getUser();
      toast.success("Cập nhật mật khẩu thành công!");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e) {
      toast.error((e as Error).message || "Cập nhật mật khẩu thất bại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-4">
        <div className="text-sm font-semibold">Đổi mật khẩu</div>
        <p className="text-xs text-muted-foreground">Khuyến nghị đổi mật khẩu 90 ngày một lần.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input
            type="password"
            placeholder="Mật khẩu hiện tại"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Mật khẩu mới"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Xác nhận mật khẩu"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
        </div>
        <button
          onClick={openConfirm}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Lock className="h-3.5 w-3.5" /> {loading ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
        </button>
      </div>
      <Toggle
        title="Xác thực 2 lớp (2FA)"
        desc="Bắt buộc nhập mã từ ứng dụng Authenticator khi đăng nhập"
        defaultOn
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận đổi mật khẩu</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn cập nhật mật khẩu? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-2">
            <button
              onClick={() => setDialogOpen(false)}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              Hủy
            </button>
            <button
              onClick={handleUpdate}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Xác nhận
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-8">
      <PushDevicesPanel />
      <NotificationsPrefsPanel />
    </div>
  );
}

const CAT_LABELS: { key: "mention" | "task" | "meeting" | "document" | "workflow" | "system"; label: string; desc: string }[] = [
  { key: "mention", label: "Đề cập (@mention)", desc: "Khi ai đó nhắc tên bạn trong chat hoặc bình luận" },
  { key: "task", label: "Nhiệm vụ", desc: "Nhiệm vụ được gán, đến hạn hoặc hoàn thành" },
  { key: "meeting", label: "Cuộc họp", desc: "Lịch họp mới, lời mời và nhắc trước giờ họp" },
  { key: "document", label: "Tài liệu", desc: "Tài liệu được chia sẻ hoặc cập nhật" },
  { key: "workflow", label: "Quy trình", desc: "Trạng thái workflow thay đổi hoặc chờ phê duyệt" },
  { key: "system", label: "Hệ thống", desc: "Cảnh báo bảo mật, bảo trì và thông báo quản trị" },
];

function NotificationsPrefsPanel() {
  const qc = useQueryClient();
  const fetchPrefs = useServerFn(getMyNotifPrefs);
  const savePrefs = useServerFn(updateMyNotifPrefs);
  const q = useQuery({ queryKey: ["notif-prefs"], queryFn: () => fetchPrefs() });
  const [local, setLocal] = useState<NotifPrefs | null>(null);

  useEffect(() => {
    if (q.data && !local) setLocal(q.data);
  }, [q.data, local]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => savePrefs({ data: patch }),
    onSuccess: (data) => {
      setLocal(data);
      qc.setQueryData(["notif-prefs"], data);
      toast.success("Đã lưu tùy chọn thông báo");
    },
    onError: (err: Error) => toast.error(err.message || "Không thể lưu"),
  });

  const toggle = (k: PrefKey) => {
    if (!local) return;
    const next = { ...local, [k]: !local[k] };
    setLocal(next);
    mutation.mutate({ [k]: next[k] } as Partial<NotifPrefs>);
  };

  const setAll = (kind: "in_app" | "email", value: boolean) => {
    if (!local) return;
    const patch: Partial<NotifPrefs> = {};
    for (const k of PREF_KEYS) {
      if (k.startsWith(`${kind}_`) && k !== "email_daily_digest" && k !== "email_product_news") {
        patch[k] = value;
      }
    }
    setLocal({ ...local, ...patch });
    mutation.mutate(patch);
  };

  if (q.isLoading || !local) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 py-12 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin opacity-60" /> Đang tải tùy chọn…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Không tải được tùy chọn: {(q.error as Error).message}
      </div>
    );
  }

  const prefs = local;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Thông báo trong ứng dụng</h3>
            <p className="text-xs text-muted-foreground">Hiển thị trong chuông thông báo và trang /notifications</p>
          </div>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setAll("in_app", true)}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >Bật tất cả</button>
            <button
              type="button"
              onClick={() => setAll("in_app", false)}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >Tắt tất cả</button>
          </div>
        </div>
        <div className="space-y-2">
          {CAT_LABELS.map((c) => {
            const key = `in_app_${c.key}` as PrefKey;
            return (
              <PrefRow
                key={key}
                title={c.label}
                desc={c.desc}
                checked={prefs[key]}
                onChange={() => toggle(key)}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Thông báo qua email</h3>
            <p className="text-xs text-muted-foreground">Gửi tới email đăng ký của bạn</p>
          </div>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setAll("email", true)}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >Bật tất cả</button>
            <button
              type="button"
              onClick={() => setAll("email", false)}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >Tắt tất cả</button>
          </div>
        </div>
        <div className="space-y-2">
          {CAT_LABELS.map((c) => {
            const key = `email_${c.key}` as PrefKey;
            return (
              <PrefRow
                key={key}
                title={c.label}
                desc={`Gửi email khi có ${c.label.toLowerCase()} mới`}
                checked={prefs[key]}
                onChange={() => toggle(key)}
              />
            );
          })}
          <PrefRow
            title="Tóm tắt hàng ngày"
            desc="Email tóm tắt hoạt động vào 08:00 mỗi sáng"
            checked={prefs.email_daily_digest}
            onChange={() => toggle("email_daily_digest")}
          />
          <PrefRow
            title="Bản tin sản phẩm"
            desc="Tin tức về tính năng mới và mẹo sử dụng"
            checked={prefs.email_product_news}
            onChange={() => toggle("email_product_news")}
          />
        </div>
      </section>

      {mutation.isPending && (
        <div className="text-xs text-muted-foreground">Đang lưu…</div>
      )}
    </div>
  );
}

function PrefRow({
  title, desc, checked, onChange,
}: { title: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-surface-2/40 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState("compact");
  return (
    <div className="space-y-5">
      <Field label="Chủ đề">
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: "light", l: "Sáng", c: "bg-white" },
            { k: "dark", l: "Tối", c: "bg-slate-900" },
            { k: "system", l: "Theo hệ thống", c: "bg-gradient-to-br from-white to-slate-900" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setTheme(o.k)}
              className={`rounded-xl border p-3 text-left transition-colors ${theme === o.k ? "border-primary bg-primary/10" : "border-border bg-surface-2/40 hover:border-primary/40"}`}
            >
              <div className={`h-14 w-full rounded-lg ${o.c} ring-1 ring-border`} />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span>{o.l}</span>
                {theme === o.k && <Check className="h-4 w-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Mật độ giao diện">
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1 text-sm">
          {[
            { k: "comfortable", l: "Thoải mái" },
            { k: "compact", l: "Gọn" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setDensity(o.k)}
              className={`rounded-md px-3 py-1.5 ${density === o.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function LanguageSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ngôn ngữ hiển thị">
        <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option>Tiếng Việt</option>
          <option>English</option>
        </select>
      </Field>
      <Field label="Múi giờ">
        <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option>(GMT+7) Hà Nội, Bangkok</option>
          <option>(GMT+8) Singapore</option>
          <option>(GMT+0) UTC</option>
        </select>
      </Field>
      <Field label="Định dạng ngày">
        <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option>DD/MM/YYYY</option>
          <option>MM/DD/YYYY</option>
          <option>YYYY-MM-DD</option>
        </select>
      </Field>
      <Field label="Ngày đầu tuần">
        <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option>Thứ Hai</option>
          <option>Chủ Nhật</option>
        </select>
      </Field>
    </div>
  );
}

function IntegrationsSection() {
  const items = [
    { n: "Google Workspace", d: "Lịch, Drive, Meet", on: true, c: "bg-rose-500/20 text-rose-300" },
    {
      n: "Microsoft 365",
      d: "Outlook, Teams, OneDrive",
      on: false,
      c: "bg-sky-500/20 text-sky-300",
    },
    {
      n: "Slack",
      d: "Đồng bộ tin nhắn và thông báo",
      on: false,
      c: "bg-violet-500/20 text-violet-300",
    },
    { n: "GitHub", d: "Liên kết commit với nhiệm vụ", on: true, c: "bg-zinc-500/20 text-zinc-300" },
    {
      n: "Zapier",
      d: "Tự động hóa với 5000+ ứng dụng",
      on: false,
      c: "bg-amber-500/20 text-amber-300",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((i) => (
        <div
          key={i.n}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3"
        >
          <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${i.c}`}>
            <Plug className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{i.n}</div>
            <div className="truncate text-xs text-muted-foreground">{i.d}</div>
          </div>
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${i.on ? "border border-border bg-surface text-foreground hover:bg-surface-2" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {i.on ? "Đã kết nối" : "Kết nối"}
          </button>
        </div>
      ))}
    </div>
  );
}

function TeamSection() {
  const members = [
    { n: "Nguyễn Văn A", r: "Owner", e: "nguyenvana@unicom.vn" },
    { n: "Trần Thị B", r: "Admin", e: "tranthib@unicom.vn" },
    { n: "Phạm Minh C", r: "Member", e: "phamminhc@unicom.vn" },
    { n: "Lê Hoàng D", r: "Member", e: "lehoangd@unicom.vn" },
    { n: "Nguyễn Hương", r: "Guest", e: "nguyenh@partner.vn" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          5 thành viên · 12 chỗ còn lại trong gói Business
        </p>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" /> Mời thành viên
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {members.map((m, i) => (
          <div
            key={m.e}
            className={`flex items-center gap-3 p-3 ${i ? "border-t border-border" : ""}`}
          >
            <img src={avatar(m.n)} alt="" className="h-9 w-9 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.n}</div>
              <div className="truncate text-xs text-muted-foreground">{m.e}</div>
            </div>
            <select
              defaultValue={m.r}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option>Owner</option>
              <option>Admin</option>
              <option>Member</option>
              <option>Guest</option>
            </select>
            <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-4">
      <Toggle
        title="Xác thực 2 lớp (2FA)"
        desc="Bắt buộc nhập mã từ ứng dụng Authenticator khi đăng nhập"
        defaultOn
      />
      <Toggle
        title="Đăng xuất các thiết bị không hoạt động"
        desc="Tự động đăng xuất sau 30 ngày không hoạt động"
        defaultOn
      />
      <div className="rounded-xl border border-border bg-surface-2/40 p-4">
        <div className="text-sm font-semibold">Phiên đăng nhập đang hoạt động</div>
        <div className="mt-3 space-y-2">
          {[
            { i: Monitor, n: "Chrome trên macOS", l: "Hà Nội, Việt Nam · Hiện tại", cur: true },
            { i: Smartphone, n: "UNIWORK iOS", l: "Hà Nội · 2 giờ trước" },
            { i: Monitor, n: "Safari trên iPad", l: "TP.HCM · Hôm qua" },
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5"
            >
              <s.i className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {s.n}{" "}
                  {s.cur && (
                    <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      Hiện tại
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{s.l}</div>
              </div>
              {!s.cur && (
                <button className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-destructive">
                  Đăng xuất
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="mt-3 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline">
          <LogOut className="h-3.5 w-3.5" /> Đăng xuất khỏi tất cả thiết bị khác
        </button>
      </div>
    </div>
  );
}

function BillingSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div>
          <div className="text-xs text-primary">Gói hiện tại</div>
          <div className="text-xl font-semibold">Business</div>
          <div className="text-xs text-muted-foreground">17 thành viên · gia hạn 30/11/2026</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">
            9.900.000 ₫<span className="text-xs text-muted-foreground">/tháng</span>
          </div>
          <button className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            Nâng cấp Enterprise
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border">
        <div className="border-b border-border p-3 text-sm font-semibold">Lịch sử hóa đơn</div>
        {[
          { d: "01/11/2026", a: "9.900.000 ₫", s: "Đã thanh toán" },
          { d: "01/10/2026", a: "9.900.000 ₫", s: "Đã thanh toán" },
          { d: "01/09/2026", a: "8.400.000 ₫", s: "Đã thanh toán" },
        ].map((r, i) => (
          <div
            key={i}
            className={`flex items-center justify-between p-3 text-sm ${i ? "border-t border-border" : ""}`}
          >
            <span>{r.d}</span>
            <span className="tabular-nums">{r.a}</span>
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
              {r.s}
            </span>
            <button className="text-xs text-primary hover:underline">Tải PDF</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataSection() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/40 p-4">
        <div>
          <div className="text-sm font-medium">Xuất dữ liệu</div>
          <div className="text-xs text-muted-foreground">
            Tải xuống toàn bộ dữ liệu workspace dạng ZIP
          </div>
        </div>
        <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2">
          Tạo bản xuất
        </button>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/40 p-4">
        <div>
          <div className="text-sm font-medium">Sao lưu tự động</div>
          <div className="text-xs text-muted-foreground">Hằng ngày lúc 02:00 (GMT+7)</div>
        </div>
        <Switch checked onChange={() => {}} />
      </div>
    </div>
  );
}

const RENDERS: Record<SectionKey, React.FC> = {
  profile: ProfileSection,
  account: AccountSection,
  password: PasswordSection,
  notifications: NotificationsSection,
  appearance: AppearanceSection,
  language: LanguageSection,
  integrations: IntegrationsSection,
  team: TeamSection,
  security: SecuritySection,
  billing: BillingSection,
  data: DataSection,
};

function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const section: SectionKey = search.tab ?? "profile";
  const current = SECTIONS.find((s) => s.key === section)!;
  const Body = RENDERS[section];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="mx-auto w-full max-w-none flex-1 px-4 py-6 sm:px-6">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cài đặt</h1>
            <p className="text-sm text-muted-foreground">
              Quản lý tài khoản, thông báo, tích hợp và bảo mật
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <nav className="space-y-1 rounded-2xl border border-border bg-surface p-2">
              {SECTIONS.map((s) => {
                const active = s.key === section;
                return (
                  <button
                    key={s.key}
                    onClick={() => navigate({ search: { tab: s.key } })}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                  >
                    <s.icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{s.desc}</div>
                    </div>
                    <ChevronRight className={`h-4 w-4 ${active ? "text-primary" : "opacity-50"}`} />
                  </button>
                );
              })}
            </nav>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-5 flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{current.label}</h2>
                  <p className="text-xs text-muted-foreground">{current.desc}</p>
                </div>
                <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  Lưu thay đổi
                </button>
              </div>
              <Body />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
