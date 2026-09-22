/**
 * Handshake web <-> máy chủ <-> vỏ native.
 * - kill-switch từ xa
 * - phiên bản vỏ app tối thiểu
 * - phát hiện gói web cũ (cache/version invalidation)
 */
import { APP_WEB_VERSION, compareVersions } from "@/lib/app-version";
import { nativeBridge } from "@/lib/native/capabilities";

export type AppHealth = {
  ok: boolean;
  webVersion: string;
  minNativeVersion: string;
  killSwitch: boolean;
  message: string | null;
};

export type GuardState =
  | { kind: "ok" }
  | { kind: "blocked"; message: string }
  | { kind: "upgrade"; required: string; current: string };

const RELOAD_FLAG = "uniwork-version-reloaded";

export async function fetchAppHealth(signal?: AbortSignal): Promise<AppHealth | null> {
  try {
    const res = await fetch("/api/public/app-health", { cache: "no-store", signal });
    if (!res.ok) return null;
    return (await res.json()) as AppHealth;
  } catch {
    return null;
  }
}

/** Gói web đang chạy khác bản trên máy chủ -> xoá cache, gỡ service worker, nạp lại 1 lần. */
export async function invalidateStaleBundle(serverVersion: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!serverVersion || serverVersion === APP_WEB_VERSION) {
    sessionStorage.removeItem(RELOAD_FLAG);
    return false;
  }
  if (sessionStorage.getItem(RELOAD_FLAG) === serverVersion) return false;
  sessionStorage.setItem(RELOAD_FLAG, serverVersion);

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.update()));
    }
  } catch {
    /* khong can thiet */
  }
  window.location.reload();
  return true;
}

export function evaluateHealth(health: AppHealth): GuardState {
  if (health.killSwitch) {
    return { kind: "blocked", message: health.message ?? "UniWork đang tạm dừng phục vụ." };
  }
  const bridge = nativeBridge();
  if (bridge && bridge.platform !== "web") {
    if (compareVersions(bridge.nativeVersion, health.minNativeVersion) < 0) {
      return { kind: "upgrade", required: health.minNativeVersion, current: bridge.nativeVersion };
    }
  }
  return { kind: "ok" };
}
