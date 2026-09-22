/**
 * Lưu ảnh chụp dữ liệu đọc vào IndexedDB để PWA mở được khi ngoại tuyến,
 * và nạp lại vào bộ nhớ truy vấn khi khởi động.
 */
import type { QueryClient } from "@tanstack/react-query";
import { putCache, readCache } from "./db";

/** Chỉ lưu các nhóm dữ liệu công việc, góp ý và Work Graph. */
const PERSISTED_PREFIXES = [
  "task-ops-board",
  "work-graph-board",
  "work-deliverable",
  "work-deliverables",
  "work-product-revision-feedback",
  "tasks",
  "task-detail",
  "notifications",
];

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function shouldPersist(key: readonly unknown[]) {
  const head = key[0];
  return typeof head === "string" && PERSISTED_PREFIXES.includes(head);
}

export function setupOfflinePersistence(queryClient: QueryClient) {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return () => {};

  // Nạp lại dữ liệu đã lưu (không ghi đè dữ liệu mới hơn đang có trong bộ nhớ).
  void readCache().then((entries) => {
    const now = Date.now();
    for (const entry of entries) {
      if (now - entry.updatedAt > MAX_AGE_MS) continue;
      const key = entry.key as readonly unknown[];
      if (!shouldPersist(key)) continue;
      const state = queryClient.getQueryState(key);
      if (state?.data !== undefined) continue;
      queryClient.setQueryData(key, entry.data, { updatedAt: entry.updatedAt });
    }
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const dirty = new Map<string, { key: readonly unknown[]; data: unknown; updatedAt: number }>();

  const flush = () => {
    timer = null;
    const items = [...dirty.entries()];
    dirty.clear();
    for (const [hash, item] of items) {
      void putCache({
        hash,
        key: [...item.key],
        data: item.data,
        updatedAt: item.updatedAt,
      }).catch(() => {});
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const query = event.query;
    if (query.state.status !== "success" || query.state.data === undefined) return;
    if (!shouldPersist(query.queryKey)) return;
    dirty.set(query.queryHash, {
      key: query.queryKey,
      data: query.state.data,
      updatedAt: query.state.dataUpdatedAt,
    });
    if (!timer) timer = setTimeout(flush, 1500);
  });

  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    flush();
  };
}
