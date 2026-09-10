// Bảng tuỳ chỉnh Home: kéo thả thứ tự khối, bật/tắt khối, kích thước, mật độ, tone màu, preset.
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, useTheme } from "@/lib/theme";
import {
  HOME_LAYOUTS,
  HOME_PRESETS,
  HOME_SECTION_META,
  HOME_SIZES,
  moveSection,
  type HomeSize,
  type HomeLayout,
  type HomePrefs,
  type HomeSectionKey,
} from "@/lib/home-prefs";

function reorder(order: HomeSectionKey[], from: number, to: number): HomeSectionKey[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const copy = [...order];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

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
  const { tone, setTone } = useTheme();
  const [dragKey, setDragKey] = useState<HomeSectionKey | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const setLayout = (layout: HomeLayout) => onChange({ ...prefs, layout });
  const toggle = (key: HomeSectionKey) =>
    onChange({ ...prefs, enabled: { ...prefs.enabled, [key]: !prefs.enabled[key] } });
  const move = (key: HomeSectionKey, dir: -1 | 1) =>
    onChange({ ...prefs, order: moveSection(prefs.order, key, dir) });
  const setSize = (key: HomeSectionKey, size: HomeSize) =>
    onChange({ ...prefs, sizes: { ...prefs.sizes, [key]: size } });

  // Kéo thả bằng con trỏ/chạm: hoạt động cả trên điện thoại.
  const onHandleDown = (key: HomeSectionKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragKey(key);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let current = key;

    const handleMove = (ev: PointerEvent) => {
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-home-key]");
      const overKey = el?.dataset["homeKey"] as HomeSectionKey | undefined;
      if (!overKey || overKey === current) return;
      const from = prefs.order.indexOf(current);
      const to = prefs.order.indexOf(overKey);
      const next = reorder(prefs.order, from, to);
      if (next !== prefs.order) {
        current = overKey === current ? current : current;
        onChange({ ...prefs, order: next });
      }
    };
    const handleUp = () => {
      setDragKey(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  return (
    <section
      aria-label="Tuỳ chỉnh trang chủ"
      className="overflow-hidden rounded-xl border border-border bg-surface p-3 sm:p-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Tuỳ chỉnh trang chủ</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Kéo thả để đổi thứ tự khối, bật/tắt, chỉnh kích thước và chọn màu chủ đề. Lưu theo tài
            khoản.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {saving ? <span className="hidden text-xs text-muted-foreground sm:inline">Đang lưu…</span> : null}
          <button
            type="button"
            onClick={onReset}
            aria-label="Đặt lại tuỳ chỉnh"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Đặt lại</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng tuỳ chỉnh"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Khối hiển thị
          </div>
          <ul
            ref={listRef}
            className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border"
          >
            {prefs.order.map((key, idx) => {
              const meta = HOME_SECTION_META[key];
              return (
                <li
                  key={key}
                  data-home-key={key}
                  className={cn(
                    "px-2 py-2 sm:px-3 sm:py-2.5",
                    dragKey === key && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Kéo để đổi vị trí ${meta.label}`}
                      onPointerDown={onHandleDown(key)}
                      className="inline-flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
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
                        <span className="hidden truncate text-xs text-muted-foreground sm:block">
                          {meta.description}
                        </span>
                      </span>
                    </label>
                    <div className="hidden shrink-0 items-center gap-1 sm:flex">
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
                  </div>
                  {prefs.enabled[key] ? (
                    <div className="mt-2 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:pl-7">
                      <span className="col-span-4 text-xs text-muted-foreground sm:col-auto">
                        Kích thước
                      </span>
                      {HOME_SIZES.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setSize(key, s.key)}
                          aria-pressed={prefs.sizes[key] === s.key}
                          title={s.hint}
                          className={cn(
                            "min-h-11 rounded-md border px-1.5 text-xs transition-colors sm:min-h-9 sm:px-2.5",
                            prefs.sizes[key] === s.key
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:bg-surface-2",
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Màu chủ đề
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  aria-pressed={tone === t.id}
                  aria-label={`Màu chủ đề ${t.label}`}
                  title={t.label}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors",
                    tone === t.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-full border border-border"
                    style={{ background: t.swatch }}
                  />
                  <span className="truncate">{t.label}</span>
                  {tone === t.id ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </button>
              ))}
            </div>
          </div>

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
                    "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors",
                    prefs.layout === l.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="truncate text-sm font-medium">{l.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{l.hint}</div>
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
                  className="min-h-11 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="truncate text-sm font-medium">{p.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
