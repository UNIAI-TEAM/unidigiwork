import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, CaseSensitive, Contrast, Minus, Moon, Palette, Plus, Sun, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUiPrefs, saveUiPrefs } from "@/lib/api/user-ui-prefs.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark";
export type Tone = "violet" | "blue" | "teal" | "emerald" | "amber" | "rose";
export type Contrast = "normal" | "high";
export type FontScale = "sm" | "md" | "lg" | "xl";
export type FontFamily = "sans" | "serif" | "mono";

export const FONT_FAMILIES: { id: FontFamily; label: string; sample: string }[] = [
  { id: "sans", label: "Sans (mặc định)", sample: "ui-sans-serif, system-ui, sans-serif" },
  { id: "serif", label: "Serif", sample: "ui-serif, Georgia, serif" },
  { id: "mono", label: "Mono", sample: "ui-monospace, Menlo, monospace" },
];

export const FONT_SCALES: { id: FontScale; label: string }[] = [
  { id: "sm", label: "Nhỏ" },
  { id: "md", label: "Mặc định" },
  { id: "lg", label: "Lớn" },
  { id: "xl", label: "Rất lớn" },
];

export const TONES: { id: Tone; label: string; swatch: string }[] = [
  { id: "violet", label: "Tím Uni", swatch: "oklch(0.60 0.17 285)" },
  { id: "blue", label: "Xanh dương", swatch: "oklch(0.60 0.17 255)" },
  { id: "teal", label: "Xanh ngọc", swatch: "oklch(0.62 0.15 195)" },
  { id: "emerald", label: "Xanh lá", swatch: "oklch(0.62 0.15 155)" },
  { id: "amber", label: "Hổ phách", swatch: "oklch(0.72 0.15 75)" },
  { id: "rose", label: "Hồng đỏ", swatch: "oklch(0.62 0.18 15)" },
];

const TONE_KEY = "uniwork-tone";
const CONTRAST_KEY = "uniwork-contrast";
const FONT_SCALE_KEY = "uniwork-font-scale";
const FONT_FAMILY_KEY = "uniwork-font-family";

const ThemeCtx = createContext<{
  theme: Theme;
  toggle: () => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  contrast: Contrast;
  setContrast: (c: Contrast) => void;
  fontScale: FontScale;
  setFontScale: (f: FontScale) => void;
  fontFamily: FontFamily;
  setFontFamily: (f: FontFamily) => void;
}>({
  theme: "dark",
  toggle: () => {},
  tone: "violet",
  setTone: () => {},
  contrast: "normal",
  setContrast: () => {},
  fontScale: "md",
  setFontScale: () => {},
  fontFamily: "sans",
  setFontFamily: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [tone, setTone] = useState<Tone>("violet");
  const [contrast, setContrast] = useState<Contrast>("normal");
  const [fontScale, setFontScale] = useState<FontScale>("md");
  const [fontFamily, setFontFamily] = useState<FontFamily>("sans");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" &&
      localStorage.getItem("uniwork-theme")) as Theme | null;
    const initial: Theme = saved ?? "dark";
    setTheme(initial);
    const savedTone = (typeof localStorage !== "undefined" &&
      localStorage.getItem(TONE_KEY)) as Tone | null;
    if (savedTone && TONES.some((t) => t.id === savedTone)) setTone(savedTone);
    const savedContrast = (typeof localStorage !== "undefined" &&
      localStorage.getItem(CONTRAST_KEY)) as Contrast | null;
    if (savedContrast === "high" || savedContrast === "normal") setContrast(savedContrast);
    const savedScale = (typeof localStorage !== "undefined" &&
      localStorage.getItem(FONT_SCALE_KEY)) as FontScale | null;
    if (savedScale && FONT_SCALES.some((f) => f.id === savedScale)) setFontScale(savedScale);
    const savedFamily = (typeof localStorage !== "undefined" &&
      localStorage.getItem(FONT_FAMILY_KEY)) as FontFamily | null;
    if (savedFamily && FONT_FAMILIES.some((f) => f.id === savedFamily)) setFontFamily(savedFamily);
  }, []);

  // Đồng bộ tuỳ chọn giao diện theo tài khoản (đa thiết bị).
  useEffect(() => {
    let cancelled = false;
    const load = async (hasSession: boolean) => {
      if (!hasSession) {
        if (!cancelled) setSynced(false);
        return;
      }
      try {
        const prefs = await getUiPrefs({ data: undefined as never });
        if (cancelled) return;
        if (prefs) {
          setTheme(prefs.theme);
          if (TONES.some((t) => t.id === prefs.tone)) setTone(prefs.tone);
          if (prefs.contrast === "high" || prefs.contrast === "normal")
            setContrast(prefs.contrast);
          if (prefs.fontScale && FONT_SCALES.some((f) => f.id === prefs.fontScale))
            setFontScale(prefs.fontScale);
          if (prefs.fontFamily && FONT_FAMILIES.some((f) => f.id === prefs.fontFamily))
            setFontFamily(prefs.fontFamily);
        }
        setSynced(true);
      } catch {
        /* offline hoặc chưa đăng nhập */
      }
    };
    supabase.auth.getSession().then(({ data }) => load(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(Boolean(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const persist = (patch: {
    theme?: Theme;
    tone?: Tone;
    contrast?: Contrast;
    fontScale?: FontScale;
    fontFamily?: FontFamily;
  }) => {
    if (!synced) return;
    void saveUiPrefs({ data: patch }).catch(() => {
      /* bỏ qua lỗi mạng, localStorage vẫn giữ */
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("uniwork-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-tone", tone);
    try {
      localStorage.setItem(TONE_KEY, tone);
    } catch {
      /* ignore */
    }
  }, [tone]);

  useEffect(() => {
    const root = document.documentElement;
    if (contrast === "high") root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");
    try {
      localStorage.setItem(CONTRAST_KEY, contrast);
    } catch {
      /* ignore */
    }
  }, [contrast]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font-scale", fontScale);
    try {
      localStorage.setItem(FONT_SCALE_KEY, fontScale);
    } catch {
      /* ignore */
    }
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font-family", fontFamily);
    try {
      localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
    } catch {
      /* ignore */
    }
  }, [fontFamily]);

  return (
    <ThemeCtx.Provider
      value={{
        theme,
        toggle: () =>
          setTheme((t) => {
            const next: Theme = t === "dark" ? "light" : "dark";
            persist({ theme: next });
            return next;
          }),
        tone,
        setTone: (t) => {
          setTone(t);
          persist({ tone: t });
        },
        contrast,
        setContrast: (c) => {
          setContrast(c);
          persist({ contrast: c });
        },
        fontScale,
        setFontScale: (f) => {
          setFontScale(f);
          persist({ fontScale: f });
        },
        fontFamily,
        setFontFamily: (f) => {
          setFontFamily(f);
          persist({ fontFamily: f });
        },
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={`rounded-lg p-2 hover:bg-surface-2 ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Moon className="h-5 w-5 text-muted-foreground" />
      )}
    </button>
  );
}

export function ToneToggle({ className = "" }: { className?: string }) {
  const { tone, setTone, contrast, setContrast, fontScale, setFontScale, fontFamily, setFontFamily } =
    useTheme();
  const active = TONES.find((t) => t.id === tone) ?? TONES[0];
  const scaleIndex = FONT_SCALES.findIndex((f) => f.id === fontScale);
  const step = (delta: number) => {
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, scaleIndex + delta))];
    if (next) setFontScale(next.id);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Chọn tone màu giao diện"
          title={`Tone màu: ${active.label}`}
          className={`relative rounded-lg p-2 hover:bg-surface-2 ${className}`}
        >
          <Palette className="h-5 w-5 text-muted-foreground" />
          <span
            aria-hidden
            className="absolute bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-background"
            style={{ background: active.swatch }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Tone màu giao diện</DropdownMenuLabel>
        {TONES.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => setTone(t.id)} className="gap-2">
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full border border-border"
              style={{ background: t.swatch }}
            />
            <span className="flex-1">{t.label}</span>
            {t.id === tone && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Khả năng đọc</DropdownMenuLabel>
        {FONT_FAMILIES.map((f) => (
          <DropdownMenuItem key={f.id} onSelect={() => setFontFamily(f.id)} className="gap-2">
            <CaseSensitive className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1" style={{ fontFamily: f.sample }}>
              {f.label}
            </span>
            {f.id === fontFamily && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="gap-2 focus:bg-transparent"
        >
          <Type className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">Cỡ chữ</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Giảm cỡ chữ"
              disabled={scaleIndex <= 0}
              onClick={() => step(-1)}
              className="rounded-md border border-border p-1 hover:bg-surface-2 disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-16 text-center text-xs text-muted-foreground">
              {FONT_SCALES[scaleIndex]?.label ?? "Mặc định"}
            </span>
            <button
              type="button"
              aria-label="Tăng cỡ chữ"
              disabled={scaleIndex >= FONT_SCALES.length - 1}
              onClick={() => step(1)}
              className="rounded-md border border-border p-1 hover:bg-surface-2 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setContrast(contrast === "high" ? "normal" : "high");
          }}
          className="gap-2"
        >
          <Contrast className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">Tương phản cao</span>
          {contrast === "high" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
