import { useEffect, useRef } from "react";

/**
 * Ghi nhớ bộ lọc trên URL của một trang để khi người dùng quay lại (từ dashboard,
 * từ trang khác hoặc mở lại tab) trạng thái lọc trước đó được khôi phục.
 */
export function useStickySearch<T extends Record<string, unknown>>(
  key: string,
  search: T,
  apply: (saved: Partial<T>) => void,
) {
  const storageKey = `uniwork:filters:${key}`;
  const restored = useRef(false);

  // Khôi phục 1 lần khi vào trang mà URL chưa có bộ lọc nào.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const hasAny = Object.values(search).some((v) => v !== undefined && v !== "");
    if (hasAny) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<T>;
      if (saved && Object.values(saved).some((v) => v !== undefined && v !== "")) apply(saved);
    } catch {
      /* bỏ qua lỗi storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lưu mỗi khi bộ lọc trên URL đổi.
  useEffect(() => {
    if (!restored.current) return;
    try {
      const clean = Object.fromEntries(
        Object.entries(search).filter(([, v]) => v !== undefined && v !== ""),
      );
      if (Object.keys(clean).length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(clean));
    } catch {
      /* bỏ qua lỗi storage */
    }
  }, [storageKey, search]);
}
