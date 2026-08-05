import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  MessageSquare,
  Users,
  Sparkles,
  Hand,
  MoreHorizontal,
  Send,
  FileText,
  Clock,
  Loader2,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { resolveMeetingApi } from "@/sdk/meetings";
import { ApiError } from "@/contracts/errors";
import type { MeetingId } from "@/contracts";

const LiveKitStage = lazy(() => import("@/components/meeting/livekit-stage"));

const JOIN_ERRORS: Record<string, string> = {
  MEETING_ACCESS_DENIED: "Bạn không có quyền tham gia cuộc họp này.",
  MEETING_NOT_FOUND: "Không tìm thấy cuộc họp.",
  MEETING_NOT_JOINABLE: "Cuộc họp đã kết thúc hoặc bị hủy.",
  ENTITLEMENT_DENIED: "Gói dịch vụ hiện tại chưa bật hội nghị trực tuyến.",
  QUOTA_EXCEEDED: "Đã vượt hạn mức phút họp của tổ chức.",
  CONFERENCE_PROVIDER_UNAVAILABLE: "Hệ thống hội nghị chưa được cấu hình.",
  MEETING_TOKEN_ISSUE_FAILED: "Không cấp được vé vào phòng. Vui lòng thử lại.",
  TENANT_ACCESS_DENIED: "Phòng họp này thuộc tổ chức khác với tổ chức bạn đang chọn.",
};

// Lý do chi tiết + gợi ý xử lý, hiển thị ngay trên trang thay vì chỉ toast.
const JOIN_ERROR_HINTS: Record<string, string> = {
  MEETING_ACCESS_DENIED:
    "Bạn chưa nằm trong danh sách người tham gia của phòng này, hoặc phòng thuộc workspace khác với workspace bạn đang mở. Hãy yêu cầu người tổ chức mời bạn, hoặc đổi sang đúng workspace rồi thử lại.",
  TENANT_ACCESS_DENIED:
    "Hãy dùng bộ chọn tổ chức ở thanh trên cùng để chuyển sang đúng tổ chức chứa phòng họp này, sau đó thử lại.",
  MEETING_NOT_FOUND: "Phòng có thể đã bị xóa. Kiểm tra lại đường dẫn hoặc mở danh sách phòng họp.",
  MEETING_NOT_JOINABLE: "Bạn có thể xem lại thông tin cuộc họp trong lịch sử cuộc họp.",
  ENTITLEMENT_DENIED: "Liên hệ quản trị tổ chức để nâng cấp gói có hội nghị trực tuyến.",
  QUOTA_EXCEEDED: "Liên hệ quản trị tổ chức để tăng hạn mức phút họp hoặc chờ chu kỳ kế tiếp.",
};

function StageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kết nối phòng họp…
    </div>
  );
}

export const Route = createFileRoute("/meeting_/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Phòng họp ${params.id} · UNIWORK` }],
  }),
  component: MeetingDetailPage,
});

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const isRealRoom = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<"chat" | "participants" | "transcript" | "ai">("ai");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [session, setSession] = useState<{ serverUrl: string; token: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<{ code: string; message: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Xem trước camera trước khi vào phòng — giúp phát hiện sớm lỗi quyền thiết bị.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "Error";
        toast.error(
          name === "NotAllowedError"
            ? "Trình duyệt đã chặn camera. Hãy cho phép quyền camera cho trang này."
            : name === "NotFoundError"
              ? "Không tìm thấy camera trên thiết bị."
              : "Không mở được camera.",
        );
        setCamOff(true);
      }
    }
    function stop() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    if (!session && !camOff) void start();
    else stop();
    return () => {
      cancelled = true;
      stop();
    };
  }, [camOff, session]);

  async function handleJoin() {
    if (!isRealRoom) {
      toast.error("Đây là phòng demo. Hãy tạo phòng họp thật từ trang Họp.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const res = await resolveMeetingApi().requestJoinToken(id as MeetingId, {
        participantIdentity: "",
        role: "participant",
      });
      setSession({ serverUrl: res.serverUrl, token: res.token });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
      const message = JOIN_ERRORS[code] ?? "Không thể vào phòng họp.";
      setJoinError({ code, message });
      toast.error(message);
    } finally {
      setJoining(false);
    }
  }

  async function handleRequestInvite() {
    const link = typeof window !== "undefined" ? window.location.href : `/meeting/${id}`;
    const text = `Xin quyền tham gia phòng họp UNIWORK: ${link} (mã phòng ${id})`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép lời nhắn xin mời — gửi cho người tổ chức để được thêm vào phòng.");
    } catch {
      toast.error("Không sao chép được. Hãy gửi mã phòng cho người tổ chức: " + id);
    }
  }

  const participants = [
    { name: "Minh Anh", seed: "minh-anh", speaking: true },
    { name: "Tuấn Nam", seed: "tuan-nam-ba", speaking: false },
    { name: "Hương Trần", seed: "huong-tran", speaking: false },
    { name: "Duy Anh", seed: "duy-anh", speaking: false },
    { name: "Bảo Ngọc", seed: "bao-ngoc", speaking: false },
    { name: "Phương Linh", seed: "phuong-linh", speaking: false },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="meeting" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden p-4 lg:p-6">
            <div className="mb-3">
              <Link to="/meeting" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Tất cả cuộc họp
              </Link>
              <h1 className="mt-1 text-lg font-semibold">
                Sprint Review · <span className="font-mono text-muted-foreground">{id}</span>
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" /> Trực tiếp
                </span>
                <Clock className="h-3 w-3" /> 32:14
                <span>·</span>
                <Users className="h-3 w-3" /> {participants.length} người
              </div>
            </div>

            {session ? (
              <div className="flex-1 overflow-hidden rounded-xl bg-surface-2">
                <ClientOnly fallback={<StageFallback />}>
                  <Suspense fallback={<StageFallback />}>
                    <LiveKitStage
                      serverUrl={session.serverUrl}
                      token={session.token}
                      onDisconnected={() => setSession(null)}
                    />
                  </Suspense>
                </ClientOnly>
              </div>
            ) : (
            <div className="grid flex-1 grid-cols-2 gap-2 overflow-hidden lg:grid-cols-3">
              <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-surface-2">
                {camOff ? (
                  <VideoOff className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                  Bạn (xem trước)
                </div>
              </div>
              {participants.slice(1).map((p) => (
                <div
                  key={p.seed}
                  className={`relative flex items-center justify-center rounded-xl bg-surface-2 ${p.speaking ? "ring-2 ring-success" : ""}`}
                >
                  <img src={avatar(p.seed)} className="h-20 w-20 rounded-full" alt="" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                    <span className="truncate">{p.name}</span>
                    {p.speaking && <Mic className="h-3 w-3 text-success" />}
                  </div>
                </div>
              ))}
            </div>
            )}

            {!session && joinError && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-destructive">{joinError.message}</p>
                {JOIN_ERROR_HINTS[joinError.code] && (
                  <p className="mt-1 text-xs text-muted-foreground">{JOIN_ERROR_HINTS[joinError.code]}</p>
                )}
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  Mã lỗi: {joinError.code} · Phòng: {id}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleRequestInvite}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Yêu cầu mời vào phòng
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                  >
                    Thử vào lại
                  </button>
                  <Link
                    to="/meeting"
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
                  >
                    Phòng họp của workspace này
                  </Link>
                </div>
              </div>
            )}

            {!session && !isRealRoom && (
              <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                Phòng <span className="font-mono">{id}</span> là dữ liệu mẫu nên không kết nối được
                máy chủ họp.{" "}
                <Link to="/meeting" className="text-primary hover:underline">
                  Tạo phòng họp thật
                </Link>{" "}
                để dùng camera và micro.
              </p>
            )}

            <div className="mt-4 flex items-center justify-center gap-2">
              {session ? (
                <button
                  onClick={() => setSession(null)}
                  className="flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  <PhoneOff className="h-4 w-4" /> Rời phòng
                </button>
              ) : (
                <>
                  <CtrlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? MicOff : Mic} />
                  <CtrlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={camOff ? VideoOff : Video} />
                  <CtrlBtn icon={ScreenShare} />
                  <CtrlBtn icon={Hand} />
                  <CtrlBtn icon={MoreHorizontal} />
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="ml-2 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                    Vào phòng họp
                  </button>
                </>
              )}
            </div>
          </main>

          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex">
            <div className="flex border-b border-border text-xs">
              {(
                [
                  { k: "ai", label: "AI", icon: Sparkles },
                  { k: "chat", label: "Chat", icon: MessageSquare },
                  { k: "participants", label: "Người", icon: Users },
                  { k: "transcript", label: "Biên bản", icon: FileText },
                ] as const
              ).map((it) => (
                <button
                  key={it.k}
                  onClick={() => setTab(it.k)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${tab === it.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <it.icon className="h-3.5 w-3.5" /> {it.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {tab === "ai" && <AICopilotPanel />}
              {tab === "chat" && <ChatPanel />}
              {tab === "participants" && (
                <ul className="space-y-2">
                  {participants.map((p) => (
                    <li key={p.seed} className="flex items-center gap-2">
                      <img src={avatar(p.seed)} className="h-7 w-7 rounded-full" alt="" />
                      <span className="flex-1">{p.name}</span>
                      {p.speaking && <Mic className="h-3 w-3 text-success" />}
                    </li>
                  ))}
                </ul>
              )}
              {tab === "transcript" && (
                <div className="space-y-3 text-xs">
                  {[
                    { who: "Minh Anh", time: "00:01:24", text: "Chào mọi người, bắt đầu sprint review." },
                    { who: "Tuấn Nam", time: "00:02:10", text: "Backend hoàn thành 8/10 user story." },
                    { who: "Hương Trần", time: "00:03:45", text: "Frontend còn 2 bug responsive trên mobile." },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] text-muted-foreground">
                        {m.who} · {m.time}
                      </div>
                      <div className="text-foreground">{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({
  icon: Icon,
  active = true,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-surface-2 hover:bg-surface-3" : "bg-destructive/20 text-destructive"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function AICopilotPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Tóm tắt tức thời
        </div>
        <p className="text-xs text-muted-foreground">
          Backend hoàn thành 8/10 user story. Frontend cần fix 2 bug responsive
          trước EOD. Sprint planning tiếp theo dự kiến thứ Hai.
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Action items
        </div>
        <ul className="space-y-2 text-xs">
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Hương Trần fix bug responsive trên Dashboard
              <div className="text-[10px] text-muted-foreground">Hạn: hôm nay</div>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Tuấn Nam gửi test report sprint 14
              <div className="text-[10px] text-muted-foreground">Hạn: 30/05</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ChatPanel() {
  const [msg, setMsg] = useState("");
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {[
          { who: "Minh Anh", text: "Mọi người đã sẵn sàng chưa?", time: "10:00" },
          { who: "Tuấn Nam", text: "Sẵn sàng nhé", time: "10:01" },
        ].map((m, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium">{m.who}</span>{" "}
            <span className="text-[10px] text-muted-foreground">{m.time}</span>
            <div className="text-muted-foreground">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Nhập tin nhắn…"
          className="flex-1 bg-transparent text-xs focus:outline-none"
        />
        <button className="rounded p-1 hover:bg-surface-3">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}