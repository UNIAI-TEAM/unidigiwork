import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  evaluateHealth,
  fetchAppHealth,
  invalidateStaleBundle,
  type GuardState,
} from "@/lib/native/health";

const POLL_MS = 5 * 60 * 1000;

/**
 * Guardrail phía web: kiểm tra sức khoẻ máy chủ định kỳ, chặn khi kill-switch bật,
 * yêu cầu cập nhật khi vỏ app cũ hơn mức tối thiểu, và tự làm mới khi gói web đã cũ.
 */
export function NativeGuard() {
  const { t } = useI18n();
  const [state, setState] = useState<GuardState>({ kind: "ok" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      const health = await fetchAppHealth(controller.signal);
      if (cancelled || !health) return;
      if (await invalidateStaleBundle(health.webVersion)) return;
      setState(evaluateHealth(health));
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("uniwork-native-ready", onFocus);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("uniwork-native-ready", onFocus);
    };
  }, []);

  if (state.kind === "ok") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-6 backdrop-blur">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {state.kind === "blocked" ? t("guard.maintenanceTitle") : t("guard.upgradeTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.kind === "blocked"
            ? state.message
            : t("guard.upgradeBody")
                .replace("{required}", state.required)
                .replace("{current}", state.current)}
        </p>
        <Button className="mt-6 h-11 w-full" onClick={() => window.location.reload()}>
          {t("guard.retry")}
        </Button>
      </div>
    </div>
  );
}
