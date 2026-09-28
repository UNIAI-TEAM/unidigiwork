// Industry pack = lớp phủ cấu hình (nhãn, mẫu, skill). Không đổi hành vi lõi.
// Máy chủ quyết định pack; store này chỉ phản chiếu giá trị đã đọc về để i18n dùng.
import { useSyncExternalStore } from "react";

export const INDUSTRY_PACKS = ["business", "school"] as const;
export type IndustryPack = (typeof INDUSTRY_PACKS)[number];

let current: IndustryPack = "business";
const listeners = new Set<() => void>();

export function setIndustryPackSnapshot(pack: IndustryPack) {
  if (pack === current) return;
  current = pack;
  listeners.forEach((l) => l());
}

export function useIndustryPackSnapshot(): IndustryPack {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => "business",
  );
}

// Bộ từ ngữ do quản trị soạn (bản đang có hiệu lực), phủ lên bộ mặc định trong mã.
type Vocab = { vi: Record<string, string>; en: Record<string, string> };
let vocab: Vocab = { vi: {}, en: {} };
export function setPackVocabulary(v: Vocab | undefined) {
  vocab = v ?? { vi: {}, en: {} };
  listeners.forEach((l) => l());
}
export function getPackVocabulary(): Vocab {
  return vocab;
}
