/**
 * Đăng ký service worker cho chế độ ngoại tuyến.
 * Chỉ chạy ở bản đã phát hành, ngoài iframe và ngoài môi trường xem thử.
 * `sw-push.js` (thông báo đẩy) do push-client quản lý riêng, không liên quan file này.
 */
const APP_SW_URL = "/sw.js";

function isPreviewHost(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").endsWith(APP_SW_URL))
      .map((r) => r.unregister()),
  );
}

export function setupOfflineSupport() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const killSwitch = new URLSearchParams(window.location.search).has("sw")
    ? new URLSearchParams(window.location.search).get("sw") === "off"
    : false;

  if (!import.meta.env.PROD || inIframe || isPreviewHost(host) || killSwitch) {
    void unregisterAppServiceWorker();
    return;
  }

  void navigator.serviceWorker.register(APP_SW_URL, { scope: "/" }).catch(() => {
    // Không cản trở ứng dụng nếu trình duyệt từ chối đăng ký.
  });
}
