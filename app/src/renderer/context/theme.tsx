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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeProviderValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
