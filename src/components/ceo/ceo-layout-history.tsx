// Lịch sử sắp xếp bố cục CEO Command Center: xem lại và khôi phục bố cục cũ.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, RotateCcw } from "lucide-react";
import { listLayoutHistory } from "@/lib/api/layout-history.functions";
import { CEO_SECTION_LABEL, DEFAULT_CEO_PREFS, type CeoLayoutPrefs } from "@/lib/ceo-layout-prefs";
import { CEO_HISTORY_KEY } from "@/components/ceo/use-ceo-layout";

function parsePrefs(raw: string): CeoLayoutPrefs | null {
  try {
    const v = JSON.parse(raw) as Partial<CeoLayoutPrefs>;
    if (!v || !Array.isArray(v.order) || !v.sizes) return null;
    return { ...DEFAULT_CEO_PREFS, ...v } as CeoLayoutPrefs;
  } catch {
    return null;
  }
}

function describe(p: CeoLayoutPrefs): string {
  return p.order
    .slice(0, 4)
    .map((k) => CEO_SECTION_LABEL[k] ?? k)
    .join(" › ");
}

export function CeoLayoutHistory({
  onRestore,
  onReset,
}: {
  onRestore: (prefs: CeoLayoutPrefs) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(listLayoutHistory);
  const query = useQuery({
    queryKey: CEO_HISTORY_KEY,
    queryFn: () => load({ data: { scope: "ceo" as const, limit: 10 } }),
    staleTime: 30_000,
    enabled: open,
  });

  const items = useMemo(
    () =>
      (query.data ?? [])
        .map((e) => ({ ...e, parsed: parsePrefs(e.prefs) }))
        .filter((e): e is typeof e & { parsed: CeoLayoutPrefs } => e.parsed !== null),
    [query.data],
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
        >
          <History className="h-3.5 w-3.5" /> Lịch sử sắp xếp
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Bố cục mặc định
        </button>
        <span className="text-xs text-muted-foreground">
          Kéo tay cầm ở góc mỗi khối để đổi vị trí, kéo cạnh phải để đổi kích thước — tự lưu theo
          tài khoản.
        </span>
      </div>

      {open ? (
        query.isLoading ? (
          <div className="mt-3 text-sm text-muted-foreground">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Chưa có bố cục cũ. Mỗi lần bạn đổi vị trí hoặc kích thước khối, hệ thống lưu lại một
            mốc.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
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
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
                >
                  <RotateCcw className="h-4 w-4" /> Khôi phục
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
