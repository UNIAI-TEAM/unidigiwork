/**
 * Cầu nối khi UniWork chạy trong vỏ app điện thoại (Capacitor).
 * Web thường: các hàm này không làm gì.
 */

import {
  installNativeBridge,
  type NativeCapability,
  NATIVE_CAPABILITIES,
} from "@/lib/native/capabilities";

let started = false;

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
};

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  return Boolean(capacitor()?.isNativePlatform?.());
}

const PLUGIN_BY_CAPABILITY: Record<NativeCapability, string> = {
  push: "PushNotifications",
  network: "Network",
  backButton: "App",
  statusBar: "StatusBar",
  splashScreen: "SplashScreen",
  camera: "Camera",
  filesystem: "Filesystem",
  biometrics: "BiometricAuth",
  share: "Share",
};

function detectCapabilities(): NativeCapability[] {
  const cap = capacitor();
  if (!cap?.isPluginAvailable) return [];
  return NATIVE_CAPABILITIES.filter((c) => {
    try {
      return Boolean(cap.isPluginAvailable?.(PLUGIN_BY_CAPABILITY[c]));
    } catch {
      return false;
    }
  });
}

/**
 * Bật các hành vi native: nút Back của Android, ẩn splash, thanh trạng thái,
 * và phát lại sự kiện online/offline theo trạng thái mạng thật của thiết bị
 * để hàng đợi ngoại tuyến tự đồng bộ.
 *
 * Đồng thời công bố `window.UniWorkNative` (contract capabilities) để web
 * hỏi shell hỗ trợ gì rồi mới dùng.
 */
export function setupNativeShell(onResume?: () => void): () => void {
  if (started) return () => {};
  started = true;

  const platform = (capacitor()?.getPlatform?.() ?? "web") as "ios" | "android" | "web";

  if (!isNativeApp()) {
    // Web thường vẫn công bố bridge rỗng để mã gọi chung không phải kiểm tra null.
    installNativeBridge({ nativeVersion: "0.0.0", platform: "web", capabilities: [] });
    started = false;
    return () => {};
  }

  installNativeBridge({ nativeVersion: "0.0.0", platform, capabilities: detectCapabilities() });

  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      const [{ App }, { Network }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/network"),
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
      ]);

      // Version handshake: lấy phiên bản binary thật rồi công bố lại bridge.
      try {
        const info = await App.getInfo();
        installNativeBridge({
          nativeVersion: info.version || "0.0.0",
          platform,
          capabilities: detectCapabilities(),
        });
        window.dispatchEvent(new Event("uniwork-native-ready"));
      } catch {
        /* web/simulator: giu nguyen bridge mac dinh */
      }

      try {
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* iOS simulator/khong ho tro */
      }
      try {
        await SplashScreen.hide();
      } catch {
        /* khong bat buoc */
      }

      const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      cleanups.push(() => void backHandle.remove());

      const resumeHandle = await App.addListener("resume", () => {
        window.dispatchEvent(new Event("online"));
        onResume?.();
      });
      cleanups.push(() => void resumeHandle.remove());

      const netHandle = await Network.addListener("networkStatusChange", (status) => {
        window.dispatchEvent(new Event(status.connected ? "online" : "offline"));
      });
      cleanups.push(() => void netHandle.remove());

      const current = await Network.getStatus();
      if (!current.connected) window.dispatchEvent(new Event("offline"));
    } catch {
      /* thieu plugin: bo qua */
    }
  })();

  return () => {
    started = false;
    for (const fn of cleanups) fn();
  };
}
