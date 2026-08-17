/**
 * Phản hồi chung cho các hành động UI chưa có backend thật.
 * Dùng thay cho nút bấm không làm gì (dead button).
 */
import { toast } from "sonner";

const MESSAGES = {
  vi: {
    title: "Tính năng đang được phát triển",
    description: "Chúng tôi sẽ thông báo khi tính năng này sẵn sàng.",
  },
  en: {
    title: "This feature is under development",
    description: "We'll let you know as soon as it's ready.",
  },
} as const;

function currentLang(): "vi" | "en" {
  try {
    const saved = localStorage.getItem("uniwork-lang");
    if (saved === "en") return "en";
  } catch {
    /* ignore */
  }
  return "vi";
}

export function notifyComingSoon(label?: string) {
  const m = MESSAGES[currentLang()];
  toast.info(label ? `${label}: ${m.title}` : m.title, { description: m.description });
}
