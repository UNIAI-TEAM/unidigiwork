// Ghi nhớ phạm vi dự án/workspace của Universal Search giữa các lần truy cập.
const KEY = "uniwork:search:scope";
const EVENT = "uniwork:search-scope-changed";

/** `undefined` = chưa từng chọn; `null` = "Mọi dự án"; string = workspace id. */
export function readSearchScope(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return undefined;
    return raw === "" ? null : raw;
  } catch {
    return undefined;
  }
}

export function writeSearchScope(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id ?? "");
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* bỏ qua lỗi storage */
  }
}
