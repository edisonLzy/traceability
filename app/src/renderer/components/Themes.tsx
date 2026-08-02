import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "traceability:theme";
const DEFAULT_THEME: Theme = "dark";

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

/** Toggle the theme class on <html>. `light` is the CSS default so it is only
    added when the FOUC-guard or system resolution already left `dark` on. */
function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolveTheme(theme));
}

interface ThemeProviderValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeProviderValue | null>(null);

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = STORAGE_KEY,
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
      // storage unavailable (e.g. private mode) - fall back to default
    }
    return defaultTheme;
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  useEffect(() => {
    applyThemeClass(theme);
    setResolvedTheme(resolveTheme(theme));
  }, [theme]);

  // While in system mode, live-follow OS theme changes.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyThemeClass(theme);
      setResolvedTheme(resolveTheme(theme));
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo<ThemeProviderValue>(() => {
    const setTheme = (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // storage unavailable - keep the in-memory value for this session
      }
      setThemeState(next);
    };
    return { theme, resolvedTheme, setTheme };
  }, [theme, resolvedTheme, storageKey]);

  // Bridge the React theme to Electron's nativeTheme so the titlebar overlay,
  // vibrancy and OS window chrome follow the selected theme. Pure renderer code
  // must not reach the preload bridge directly, so this only touches
  // `window.electronAPI` through the allowed IPC context.
  const { invoke, on } = useElectronIPC();

  // Push the theme source to main so native chrome matches. Only when the
  // bridge is available (inside the desktop app) - browser previews no-op.
  useEffect(() => {
    void invoke("setThemeSource", theme).catch(() => {
      // Bridge unavailable (browser preview) - native chrome is out of scope.
    });
  }, [invoke, theme]);

  // Follow OS-level changes pushed from main (System mode) so the DOM class
  // stays in sync even when the OS switches theme while the app is running.
  useEffect(() => {
    return on("native_theme_updated", (payload) => {
      applyThemeClass(payload.themeSource);
      setThemeState(payload.themeSource);
    });
  }, [on, setThemeState]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeProviderValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const CurrentIcon = THEME_OPTIONS.find((option) => option.value === theme)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Switch theme"
            aria-label="Switch theme"
            className="grid size-8 place-items-center rounded-lg text-tertiary transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <CurrentIcon size={15} />
          </button>
        }
      />
      <DropdownMenuContent side="right" sideOffset={8} align="start" className="w-[168px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={active ? "bg-primary/15 font-[610] text-ink" : undefined}
              >
                <Icon size={14} />
                <span>{option.label}</span>
                {active ? <Check size={13} className="ml-auto text-primary-hover" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
