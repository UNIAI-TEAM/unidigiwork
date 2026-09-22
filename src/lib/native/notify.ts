/**
 * Ví dụ dùng contract capabilities: binary cũ chưa có push native
 * thì web tự fallback sang Web Notification, không gọi API không tồn tại.
 */
import { hasNativeCapability } from "@/lib/native/capabilities";

export type NotifyInput = { title: string; body?: string; link?: string };

export async function notifyUser(input: NotifyInput): Promise<"native" | "web" | "none"> {
  if (hasNativeCapability("push")) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 2147483647,
            title: input.title,
            body: input.body ?? "",
            extra: input.link ? { link: input.link } : undefined,
          },
        ],
      });
      return "native";
    } catch {
      /* roi xuong fallback web */
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) return "none";
  try {
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") return "none";
    const n = new Notification(input.title, { body: input.body });
    if (input.link) n.onclick = () => window.open(input.link, "_self");
    return "web";
  } catch {
    return "none";
  }
}
