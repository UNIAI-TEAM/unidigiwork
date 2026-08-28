// Bảng tuỳ chỉnh Home: bật/tắt khối, đổi thứ tự, chọn mật độ bố cục, preset.
import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HOME_LAYOUTS,
  HOME_PRESETS,
  HOME_SECTION_META,
  moveSection,
  type HomeLayout,
  type HomePrefs,
  type HomeSectionKey,
} from "@/lib/home-prefs";

export function HomeCustomizePanel({
  prefs,
  saving,
  onChange,
  onReset,
  onClose,
}: {
  prefs: HomePrefs;
  saving: boolean;
  onChange: (next: HomePrefs) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const setLayout = (layout: HomeLayout) => onChange({ ...prefs, layout });
  const toggle = (key: HomeSectionKey) =>
    onChange({ ...prefs, enabled: { ...prefs.enabled, [key]: !prefs.enabled[key] } });
  const move = (key: HomeSectionKey, dir: -1 | 1) =>
    onChange({ ...prefs, order: moveSection(prefs.order, key, dir) });

  return (
    <section
      aria-label="Tuỳ chỉnh trang chủ"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Tuỳ chỉnh trang chủ</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bật/tắt khối, đổi thứ tự và chọn mật độ bố cục. Thay đổi được lưu theo tài khoản.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-muted-foreground">Đang lưu…</span> : null}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Đặt lại
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng tuỳ chỉnh"
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Khối hiển thị
          </div>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {prefs.order.map((key, idx) => {
              const meta = HOME_SECTION_META[key];
              return (
                <li key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      checked={prefs.enabled[key]}
                      onChange={() => toggle(key)}
                      aria-label={`Hiển thị khối ${meta.label}`}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          !prefs.enabled[key] && "text-muted-foreground",
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(key, -1)}
                      disabled={idx === 0}
                      aria-label={`Đưa ${meta.label} lên trên`}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(key, 1)}
                      disabled={idx === prefs.order.length - 1}
                      aria-label={`Đưa ${meta.label} xuống dưới`}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mật độ bố cục
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {HOME_LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLayout(l.key)}
                  aria-pressed={prefs.layout === l.key}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    prefs.layout === l.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="text-sm font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preset nhanh
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {HOME_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange(p.prefs)}
                  className="rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
