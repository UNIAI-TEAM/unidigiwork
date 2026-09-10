/** Browser helpers for web-push subscription (messaging service worker only). */

const SW_URL = "/sw-push.js";
/** Phạm vi riêng để không tranh chấp với service worker ngoại tuyến ở "/". */
const SW_SCOPE = "/push/";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Ưu tiên service worker chính của ứng dụng (đã nhúng xử lý thông báo đẩy).
 * Chỉ khi không có (bản xem trước/dev) mới dùng worker đẩy riêng ở "/push/".
 */
async function resolveRegistration(create: boolean): Promise<ServiceWorkerRegistration | null> {
  const root = await navigator.serviceWorker.getRegistration("/");
  if (root) return root;
  const scoped = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (scoped) return scoped;
  if (!create) return null;
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

export async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  return resolveRegistration(true);
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await resolveRegistration(false);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export interface SerializedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

function serialize(sub: PushSubscription): SerializedSubscription {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent.slice(0, 400),
  };
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SerializedSubscription> {
  if (!isPushSupported()) throw new Error("Trình duyệt này không hỗ trợ thông báo đẩy");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Bạn cần cho phép quyền thông báo trong trình duyệt");
  const reg = (await resolveRegistration(true))!;
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing ?? reg.waiting;
      if (!sw) return resolve();
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") resolve();
      });
    });
  }
  const existing = await reg.pushManager.getSubscription();
  if (existing) return serialize(existing);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  return serialize(sub);
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await getExistingSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
