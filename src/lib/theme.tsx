import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUiPrefs, saveUiPrefs } from "@/lib/api/user-ui-prefs.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark";
export type Tone = "violet" | "blue" | "teal" | "emerald" | "amber" | "rose";

export const TONES: { id: Tone; label: string; swatch: string }[] = [
  { id: "violet", label: "Tím Uni", swatch: "oklch(0.60 0.17 285)" },
  { id: "blue", label: "Xanh dương", swatch: "oklch(0.60 0.17 255)" },
  { id: "teal", label: "Xanh ngọc", swatch: "oklch(0.62 0.15 195)" },
  { id: "emerald", label: "Xanh lá", swatch: "oklch(0.62 0.15 155)" },
  { id: "amber", label: "Hổ phách", swatch: "oklch(0.72 0.15 75)" },
  { id: "rose", label: "Hồng đỏ", swatch: "oklch(0.62 0.18 15)" },
];

const TONE_KEY = "uniwork-tone";

const ThemeCtx = createContext<{
  theme: Theme;
  toggle: () => void;
  tone: Tone;
  setTone: (t: Tone) => void;
}>({
  theme: "dark",
  toggle: () => {},
  tone: "violet",
  setTone: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [tone, setTone] = useState<Tone>("violet");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" &&
      localStorage.getItem("uniwork-theme")) as Theme | null;
    const initial: Theme = saved ?? "dark";
    setTheme(initial);
    const savedTone = (typeof localStorage !== "undefined" &&
      localStorage.getItem(TONE_KEY)) as Tone | null;
    if (savedTone && TONES.some((t) => t.id === savedTone)) setTone(savedTone);
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

  const persist = (patch: { theme?: Theme; tone?: Tone }) => {
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
  const { tone, setTone } = useTheme();
  const active = TONES.find((t) => t.id === tone) ?? TONES[0];
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
