import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, Loader2, Send, Smartphone, Trash2 } from "lucide-react";
import {
  getPushConfig,
  savePushSubscription,
  deletePushSubscription,
  listMyPushDevices,
  sendTestPush,
} from "@/lib/api/push.functions";
import {
  isPushSupported,
  pushPermission,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

function shortDevice(ua: string | null): string {
  if (!ua) return "Thiết bị không xác định";
  if (/iphone|ipad/i.test(ua)) return "iOS · Safari";
  if (/android/i.test(ua)) return "Android";
  if (/edg\//i.test(ua)) return "Edge · Máy tính";
  if (/chrome/i.test(ua)) return "Chrome · Máy tính";
  if (/firefox/i.test(ua)) return "Firefox · Máy tính";
  if (/safari/i.test(ua)) return "Safari · Máy tính";
  return "Trình duyệt khác";
}

export function PushDevicesPanel() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(getPushConfig);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);
  const fetchDevices = useServerFn(listMyPushDevices);
  const testPush = useServerFn(sendTestPush);

  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const supported = isPushSupported();

  const configQ = useQuery({ queryKey: ["push-config"], queryFn: () => fetchConfig() });
  const devicesQ = useQuery({ queryKey: ["push-devices"], queryFn: () => fetchDevices() });

  useEffect(() => {
    void getExistingSubscription().then((s) => setCurrentEndpoint(s?.endpoint ?? null));
  }, []);

  const enableM = useMutation({
    mutationFn: async () => {
      const cfg = await configQ.refetch();
      const key = cfg.data?.publicKey;
      if (!key) throw new Error("Máy chủ chưa cấu hình khóa thông báo đẩy");
      const sub = await subscribeToPush(key);
      await saveSub({ data: sub });
      return sub.endpoint;
    },
    onSuccess: (endpoint) => {
      setCurrentEndpoint(endpoint);
      void qc.invalidateQueries({ queryKey: ["push-devices"] });
      toast.success("Đã bật thông báo đẩy trên thiết bị này");
    },
    onError: (e: Error) => toast.error(e.message || "Không bật được thông báo đẩy"),
  });

  const disableM = useMutation({
    mutationFn: async () => {
      const endpoint = (await unsubscribeFromPush()) ?? currentEndpoint;
      if (endpoint) await deleteSub({ data: { endpoint } });
    },
    onSuccess: () => {
      setCurrentEndpoint(null);
      void qc.invalidateQueries({ queryKey: ["push-devices"] });
      toast.success("Đã tắt thông báo đẩy trên thiết bị này");
    },
    onError: (e: Error) => toast.error(e.message || "Không tắt được"),
  });

  const removeM = useMutation({
    mutationFn: (endpoint: string) => deleteSub({ data: { endpoint } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["push-devices"] });
      toast.success("Đã gỡ thiết bị");
    },
    onError: (e: Error) => toast.error(e.message || "Không gỡ được thiết bị"),
  });

  const testM = useMutation({
    mutationFn: () => testPush({ data: undefined }),
    onSuccess: (r) => toast.success(`Đã gửi thử tới ${r.sent} thiết bị`),
    onError: (e: Error) => toast.error(e.message || "Gửi thử thất bại"),
  });

  const devices = devicesQ.data ?? [];
  const enabledHere = Boolean(currentEndpoint && devices.some((d) => d.endpoint === currentEndpoint));
  const permission = supported ? pushPermission() : "unsupported";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Thông báo đẩy (Push)</h3>
          <p className="text-xs text-muted-foreground">
            Nhận thông báo ngay trên thiết bị kể cả khi đóng tab UNIWORK
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enabledHere && (
            <button
              type="button"
              onClick={() => testM.mutate()}
              disabled={testM.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
            >
              {testM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Gửi thử
            </button>
          )}
          <button
            type="button"
            onClick={() => (enabledHere ? disableM.mutate() : enableM.mutate())}
            disabled={!supported || enableM.isPending || disableM.isPending || configQ.data?.configured === false}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {enableM.isPending || disableM.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BellRing className="h-3.5 w-3.5" />
            )}
            {enabledHere ? "Tắt trên thiết bị này" : "Bật trên thiết bị này"}
          </button>
        </div>
      </div>

      {!supported && (
        <p className="rounded-lg border border-border/60 bg-surface-2/40 p-3 text-xs text-muted-foreground">
          Trình duyệt hiện tại không hỗ trợ thông báo đẩy. Trên iPhone, hãy thêm UNIWORK vào Màn hình chính rồi mở lại.
        </p>
      )}
      {supported && permission === "denied" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Quyền thông báo đang bị chặn. Hãy mở cài đặt trình duyệt và cho phép thông báo cho trang này.
        </p>
      )}
      {configQ.data && !configQ.data.configured && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Máy chủ chưa cấu hình khóa VAPID nên chưa thể gửi thông báo đẩy.
        </p>
      )}

      <div className="space-y-2">
        {devicesQ.isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải danh sách thiết bị…
          </div>
        )}
        {!devicesQ.isLoading && devices.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Chưa có thiết bị nào đăng ký nhận thông báo đẩy.
          </div>
        )}
        {devices.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface-2/30 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {shortDevice(d.user_agent)}
                  {d.endpoint === currentEndpoint && (
                    <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Thiết bị này
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Đăng ký {new Date(d.created_at).toLocaleDateString("vi-VN")}
                  {d.last_used_at ? ` · Gửi gần nhất ${new Date(d.last_used_at).toLocaleString("vi-VN")}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeM.mutate(d.endpoint)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Gỡ thiết bị"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
