/** Thanh báo trạng thái ngoại tuyến và số thay đổi đang chờ đồng bộ. */
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { flushOfflineQueue, subscribeOfflineQueue } from "@/lib/offline/queue";

export function OfflineStatus() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOffline(navigator.onLine === false);
    const onOnline = async () => {
      setOffline(false);
      setSyncing(true);
      const res = await flushOfflineQueue();
      setSyncing(false);
      if (res.sent > 0) toast.success(t("offline.synced").replace("{n}", String(res.sent)));
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsubscribe = subscribeOfflineQueue(setPending);
    if (navigator.onLine) void flushOfflineQueue();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribe();
    };
  }, [t]);

  if (!offline && pending === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
      <div className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-xs shadow-lg backdrop-blur">
        {offline ? (
          <CloudOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${syncing ? "animate-spin" : ""}`} />
        )}
        <span className="text-muted-foreground">
          {offline ? t("offline.title") : t("offline.syncing")}
          {pending > 0 ? ` · ${t("offline.pending").replace("{n}", String(pending))}` : ""}
        </span>
      </div>
    </div>
  );
}
