// Lịch sử sắp xếp bố cục My Space: xem lại và khôi phục các bố cục đã dùng.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, RotateCcw } from "lucide-react";
import { listLayoutHistory } from "@/lib/api/layout-history.functions";
import { DEFAULT_HOME_PREFS, HOME_SECTION_META, type HomePrefs } from "@/lib/home-prefs";

export const HOME_HISTORY_KEY = ["layout-history", "home"] as const;

function parsePrefs(raw: string): HomePrefs | null {
  try {
    const v = JSON.parse(raw) as Partial<HomePrefs>;
    if (!v || !Array.isArray(v.order) || !v.sizes || !v.enabled) return null;
    return { ...DEFAULT_HOME_PREFS, ...v } as HomePrefs;
  } catch {
    return null;
  }
}

function describe(p: HomePrefs): string {
  const visible = p.order.filter((k) => p.enabled[k]);
  return visible.map((k) => HOME_SECTION_META[k]?.label ?? k).join(" › ") || "Không có khối nào";
}

export function HomeLayoutHistory({ onRestore }: { onRestore: (prefs: HomePrefs) => void }) {
  const load = useServerFn(listLayoutHistory);
  const query = useQuery({
    queryKey: HOME_HISTORY_KEY,
    queryFn: () => load({ data: { scope: "home" as const, limit: 10 } }),
    staleTime: 30_000,
  });

  const items = useMemo(
    () =>
      (query.data ?? [])
        .map((e) => ({ ...e, parsed: parsePrefs(e.prefs) }))
        .filter((e): e is typeof e & { parsed: HomePrefs } => e.parsed !== null),
    [query.data],
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="size-3.5" aria-hidden />
        Lịch sử sắp xếp
      </div>
      {query.isLoading ? (
        <div className="mt-2 text-sm text-muted-foreground">Đang tải…</div>
      ) : items.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">
          Chưa có bố cục cũ. Mỗi lần bạn đổi vị trí hoặc kích thước card, hệ thống sẽ lưu lại một
          mốc để khôi phục.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {new Date(e.createdAt).toLocaleString("vi-VN")}
                </div>
                <div className="truncate text-xs text-muted-foreground">{describe(e.parsed)}</div>
              </div>
              <button
                type="button"
                onClick={() => onRestore(e.parsed)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                <RotateCcw className="size-4" aria-hidden />
                Khôi phục
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
