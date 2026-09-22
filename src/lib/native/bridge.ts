/**
 * Cầu nối khi UniWork chạy trong vỏ app điện thoại (Capacitor).
 * Web thường: các hàm này không làm gì.
 */

let started = false;

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Bật các hành vi native: nút Back của Android, ẩn splash, thanh trạng thái,
 * và phát lại sự kiện online/offline theo trạng thái mạng thật của thiết bị
 * để hàng đợi ngoại tuyến tự đồng bộ.
 */
export function setupNativeShell(onResume?: () => void): () => void {
  if (started || !isNativeApp()) return () => {};
  started = true;

  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      const [{ App }, { Network }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/network"),
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
      ]);

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
