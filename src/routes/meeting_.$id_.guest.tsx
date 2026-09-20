// Phòng họp cho khách ngoài — người không có tài khoản nền tảng.
//
// Đây là bề mặt công khai duy nhất của sản phẩm: người mở trang này có thể chưa
// từng nghe tên UNIWORK. Nên trang cố ý KHÔNG dùng AppSidebar/AppTopbar và
// không gọi một server fn có auth nào — khách không có phiên Supabase, mọi thứ
// chỉ được đi qua hai server fn công khai trong meeting-guest.functions.ts.
// Thêm bất cứ truy vấn nào khác vào đây là làm vỡ ranh giới đó.
//
// Ngôn ngữ thiết kế:
//   · Bố cục chia đôi, không canh giữa: khung xem trước camera là visual thật
//     của trang, không phải ảnh trang trí.
//   · Accent duy nhất là `primary` của thương hiệu, dùng nguyên trang.
//   · Bo góc theo một luật: panel lớn `rounded-xl`, ô nhập/nút `rounded-lg`,
//     nút bật tắt thiết bị `rounded-full`.
//   · Chuyển động chỉ để phản hồi thao tác và dẫn mắt lúc vào trang; tôn trọng
//     `prefers-reduced-motion`.
//
// Xem docs/superpowers/specs/2026-09-20-meeting-guest-link-design.md.
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Loader2,
  LogOut,
  Mic,
  MicOff,
  ShieldCheck,
  TriangleAlert,
  Video,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinMeetingAsGuest, refreshGuestJoinToken } from "@/lib/api/meeting-guest.functions";
import {
  GUEST_NAME_MAX,
  guestNameError,
  guestRedeemMessage,
  guestSessionKey,
  normalizeGuestName,
  type GuestRedeemStatus,
} from "@/lib/meeting-guest";
import { useI18n, type Key } from "@/lib/i18n";

const LiveKitStage = lazy(() => import("@/components/meeting/livekit-stage"));

/** Vé sống 15 phút; xin lại sớm 2 phút để không rơi phòng giữa chừng. */
const TICKET_REFRESH_LEAD_MS = 2 * 60_000;

type Ticket = {
  serverUrl: string;
  token: string;
  roomName: string;
  displayName: string;
  expiresAt: string;
  title: string;
};

const REDEEM_MESSAGE_KEY: Record<string, Key> = {
  invalid: "mtg.guest.err.invalid",
  invalid_name: "mtg.guest.err.name",
  revoked: "mtg.guest.err.revoked",
  expired: "mtg.guest.err.expired",
  exhausted: "mtg.guest.err.exhausted",
  not_joinable: "mtg.guest.err.notJoinable",
};

function readSession(meetingId: string): string | null {
  try {
    return window.sessionStorage.getItem(guestSessionKey(meetingId));
  } catch {
    return null;
  }
}

function writeSession(meetingId: string, token: string | null) {
  try {
    if (token === null) window.sessionStorage.removeItem(guestSessionKey(meetingId));
    else window.sessionStorage.setItem(guestSessionKey(meetingId), token);
  } catch {
    /* chế độ riêng tư chặn storage — khách vẫn họp được, chỉ là F5 phải nhập lại tên */
  }
}

function GuestMeetingPage() {
  const { id } = Route.useParams();
  const { invite } = Route.useSearch();
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [fatal, setFatal] = useState<Key | null>(null);
  const [left, setLeft] = useState(false);
  const sessionRef = useRef<string | null>(null);

  // Lựa chọn thiết bị ở tiền sảnh được mang thẳng vào phòng, nên khách không
  // phải bật/tắt lại lần nữa sau khi đã vào.
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camBlocked, setCamBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inRoom = ticket !== null;

  // ---- Xem trước thiết bị -------------------------------------------------
  // Chạy khi còn ở tiền sảnh. Vào phòng rồi thì nhả thiết bị ngay, nếu không
  // LiveKit và khung xem trước tranh nhau camera trên máy Windows.
  useEffect(() => {
    let cancelled = false;

    function stop() {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamBlocked(false);
      } catch {
        // Khách chặn quyền vẫn phải vào họp được, chỉ là không có hình.
        if (!cancelled) setCamBlocked(true);
      }
    }

    if (!inRoom && !left && !fatal && camOn) void start();
    else stop();

    return () => {
      cancelled = true;
      stop();
    };
  }, [inRoom, left, fatal, camOn]);

  // ---- Vé vào phòng -------------------------------------------------------
  const fetchTicket = useCallback(
    async (sessionToken: string): Promise<boolean> => {
      try {
        const res = await refreshGuestJoinToken({ data: { sessionToken } });
        setTicket(res);
        return true;
      } catch (err) {
        const msg = String((err as { message?: string })?.message ?? "");
        // Chủ toạ mời ra, phiên hết hạn, hoặc cuộc họp đã kết thúc: phiên cũ vô
        // dụng, xoá đi để lần sau khách phải đổi link lại từ đầu.
        writeSession(id, null);
        sessionRef.current = null;
        setFatal(
          /REVOKED/.test(msg)
            ? "mtg.guest.err.revoked"
            : /NOT_JOINABLE/.test(msg)
              ? "mtg.guest.err.notJoinable"
              : /EXPIRED/.test(msg)
                ? "mtg.guest.err.sessionExpired"
                : "mtg.guest.err.invalid",
        );
        return false;
      }
    },
    [id],
  );

  // Quay lại tab cũ / F5 giữa cuộc họp: còn phiên thì vào thẳng, không tiêu
  // thêm một lượt dùng của link.
  useEffect(() => {
    const existing = readSession(id);
    if (!existing) return;
    sessionRef.current = existing;
    let cancelled = false;
    void (async () => {
      const ok = await fetchTicket(existing);
      // Rời trang giữa lúc đang xin vé: bỏ kết quả, đừng đụng vào state nữa.
      if (cancelled && ok) setTicket(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchTicket]);

  // Vé chỉ sống 15 phút, cuộc họp thì dài hơn — hẹn giờ xin lại trước khi hết.
  useEffect(() => {
    if (!ticket || left) return;
    const due = Date.parse(ticket.expiresAt) - Date.now() - TICKET_REFRESH_LEAD_MS;
    const timer = window.setTimeout(
      () => {
        const s = sessionRef.current;
        if (s) void fetchTicket(s);
      },
      Math.max(due, 10_000),
    );
    return () => window.clearTimeout(timer);
  }, [ticket, left, fetchTicket]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) {
      setFatal("mtg.guest.err.noInvite");
      return;
    }
    const nameErr = guestNameError(name);
    if (nameErr) {
      toast.error(
        t(nameErr === "too_short" ? "mtg.guest.err.nameShort" : "mtg.guest.err.nameLong"),
      );
      return;
    }

    setJoining(true);
    try {
      const res = await joinMeetingAsGuest({
        data: { token: invite, displayName: normalizeGuestName(name) },
      });
      const message = guestRedeemMessage(res.status as GuestRedeemStatus);
      if (message || !res.session_token) {
        setFatal(REDEEM_MESSAGE_KEY[message ?? "invalid"] ?? "mtg.guest.err.invalid");
        return;
      }
      writeSession(id, res.session_token);
      sessionRef.current = res.session_token;
      await fetchTicket(res.session_token);
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? "");
      setFatal(/RATE_LIMITED/.test(msg) ? "mtg.guest.err.rateLimited" : "mtg.guest.err.invalid");
    } finally {
      setJoining(false);
    }
  };

  if (fatal)
    return <GuestNotice tone="error" title={t("mtg.guest.cannotJoin")} detail={t(fatal)} />;
  if (left)
    return (
      <GuestNotice tone="calm" title={t("mtg.guest.leftTitle")} detail={t("mtg.guest.leftDesc")} />
    );

  if (ticket) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground sm:grid"
            >
              <Video className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">{ticket.title}</p>
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {ticket.displayName} · {t("mtg.guest.badge")}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLeft(true)}>
            <LogOut /> <span className="hidden sm:inline">{t("mtg.guest.leave")}</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <ClientOnly fallback={<StageFallback />}>
            <Suspense fallback={<StageFallback />}>
              <LiveKitStage
                serverUrl={ticket.serverUrl}
                token={ticket.token}
                micEnabled={micOn}
                camEnabled={camOn && !camBlocked}
                onDisconnected={() => setLeft(true)}
                onConnectError={() => setFatal("mtg.guest.err.connect")}
              />
            </Suspense>
          </ClientOnly>
        </div>
      </div>
    );
  }

  // ---- Tiền sảnh ----------------------------------------------------------
  // Chia đôi: trái là khung xem trước (visual thật của trang), phải là danh
  // tính. Dưới 1024px xếp dọc, xem trước lên trên.
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1400px] items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:gap-14 lg:px-10 lg:py-12">
        {/* Xem trước thiết bị */}
        <motion.div {...enter(0)} className="order-1 w-full">
          <div className="relative overflow-hidden rounded-xl border border-border bg-surface-3 shadow-sm">
            <div className="relative aspect-video w-full">
              {camOn && !camBlocked ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label={t("mtg.guest.preview")}
                  // Lật gương: người ta quen thấy mình trong gương, không lật
                  // thì chữ trên áo và tay trái/phải đều ngược.
                  className="h-full w-full -scale-x-100 object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                  <VideoOff className="h-9 w-9" aria-hidden />
                  <span className="text-sm">{t("mtg.guest.camOff")}</span>
                </div>
              )}

              {name.trim() && camOn && !camBlocked && (
                <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-lg bg-overlay px-2.5 py-1 text-xs text-overlay-foreground">
                  {normalizeGuestName(name)}
                </span>
              )}
            </div>

            <div
              role="group"
              aria-label={t("mtg.room.controls")}
              className="flex items-center justify-center gap-3 border-t border-border bg-surface p-3"
            >
              <DeviceToggle
                on={micOn}
                disabled={camBlocked}
                onClick={() => setMicOn((v) => !v)}
                label={micOn ? t("mtg.guest.micOff") : t("mtg.guest.micOn")}
                OnIcon={Mic}
                OffIcon={MicOff}
              />
              <DeviceToggle
                on={camOn && !camBlocked}
                disabled={camBlocked}
                onClick={() => setCamOn((v) => !v)}
                label={camOn ? t("mtg.guest.camOffAction") : t("mtg.guest.camOn")}
                OnIcon={Video}
                OffIcon={VideoOff}
              />
            </div>
          </div>

          {camBlocked && (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {t("mtg.guest.camBlocked")}
            </p>
          )}
        </motion.div>

        {/* Danh tính */}
        <motion.form {...enter(0.08)} onSubmit={submit} className="order-2 w-full space-y-7">
          <div className="space-y-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground"
            >
              <Video className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
              {t("mtg.guest.title")}
            </h1>
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              {t("mtg.guest.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-name">{t("mtg.guest.nameLabel")}</Label>
            <Input
              id="guest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("mtg.guest.namePlaceholder")}
              maxLength={GUEST_NAME_MAX}
              aria-describedby="guest-name-hint"
              autoFocus
              required
              className="h-11 text-base"
            />
            <p id="guest-name-hint" className="text-xs text-muted-foreground">
              {t("mtg.guest.nameHint")}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full transition-transform active:scale-[0.98]"
              disabled={joining || !invite}
            >
              {joining ? <Loader2 className="animate-spin" /> : <Video />}
              {joining ? t("mtg.guest.joining") : t("mtg.guest.join")}
            </Button>

            {invite ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("mtg.guest.noAccount")} {t("mtg.guest.privacy")}
              </p>
            ) : (
              <p role="alert" className="text-xs text-destructive">
                {t("mtg.guest.err.noInvite")}
              </p>
            )}
          </div>
        </motion.form>
      </div>
    </div>
  );
}

/** Nút bật/tắt thiết bị ở tiền sảnh. Tắt = nền đặc để thấy rõ trạng thái. */
function DeviceToggle({
  on,
  disabled,
  onClick,
  label,
  OnIcon,
  OffIcon,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  OnIcon: typeof Mic;
  OffIcon: typeof MicOff;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        on
          ? "border-border bg-surface-2 text-foreground hover:bg-surface-3"
          : "border-destructive/30 bg-destructive text-destructive-foreground hover:bg-destructive/90"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}

function GuestNotice({
  tone,
  title,
  detail,
}: {
  tone: "error" | "calm";
  title: string;
  detail: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <span
          aria-hidden
          className={`grid h-11 w-11 place-items-center rounded-lg ${
            tone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-surface-2 text-muted-foreground"
          }`}
        >
          {tone === "error" ? (
            <TriangleAlert className="h-5 w-5" />
          ) : (
            <LogOut className="h-5 w-5" />
          )}
        </span>
        <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
        <Button asChild variant="outline" className="mt-6">
          <a href="/">{t("mtg.guest.backHome")}</a>
        </Button>
      </div>
    </div>
  );
}

function StageFallback() {
  return (
    <div className="grid h-full place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export const Route = createFileRoute("/meeting_/$id_/guest")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    ...(typeof search["invite"] === "string" && search["invite"]
      ? { invite: search["invite"] as string }
      : {}),
  }),
  component: GuestMeetingPage,
});
