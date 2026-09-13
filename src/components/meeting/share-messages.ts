// Chuỗi dịch dùng chung cho chia sẻ màn hình (màn chờ + LiveKit stage).
import { toast } from "sonner";
import type { Key } from "@/lib/i18n";
import {
  describeDisplayMediaError,
  type DisplayMediaErrorCode,
  type ShareQualityKey,
  type ShareSourceKey,
} from "@/lib/screen-share-quality";

export const SHARE_QUALITY_KEY: Record<ShareQualityKey, Key> = {
  auto: "mtg.share.quality.auto",
  high: "mtg.share.quality.high",
  balanced: "mtg.share.quality.balanced",
  text: "mtg.share.quality.text",
};

export const SHARE_SOURCE_KEY: Record<ShareSourceKey, Key> = {
  any: "mtg.share.source.any",
  monitor: "mtg.share.source.monitor",
  window: "mtg.share.source.window",
  browser: "mtg.share.source.browser",
};

const ERROR_KEY: Record<DisplayMediaErrorCode, { title: Key; hint: Key }> = {
  denied: { title: "mtg.share.err.denied", hint: "mtg.share.err.deniedHint" },
  cancelled: { title: "mtg.share.err.cancelled", hint: "mtg.share.err.cancelledHint" },
  notFound: { title: "mtg.share.err.notFound", hint: "mtg.share.err.notFoundHint" },
  notReadable: { title: "mtg.share.err.notReadable", hint: "mtg.share.err.notReadableHint" },
  unsupported: { title: "mtg.share.err.unsupported", hint: "mtg.share.err.unsupportedHint" },
  unknown: { title: "mtg.share.err.unknown", hint: "mtg.share.err.unknownHint" },
};

/** Hiện toast lỗi getDisplayMedia theo ngôn ngữ đang chọn. */
export function toastDisplayMediaError(e: unknown, t: (k: Key) => string) {
  const info = describeDisplayMediaError(e);
  const keys = ERROR_KEY[info.code];
  if (info.cancelled) toast.info(t(keys.title), { description: t(keys.hint) });
  else toast.error(t(keys.title), { description: t(keys.hint), duration: 8000 });
}
