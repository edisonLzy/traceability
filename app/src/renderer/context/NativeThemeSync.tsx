import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useTheme } from "@renderer/context/theme";
import { useEffect } from "react";

/**
 * Bridges the React theme to Electron's nativeTheme so the titlebar overlay,
 * vibrancy and OS window chrome follow the selected theme. Pure renderer code
 * must not reach the preload bridge directly, so this lives here and only
 * touches `window.electronAPI` through the allowed IPC context.
 */
export function NativeThemeSync() {
  const { theme, setTheme } = useTheme();
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
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(payload.resolved);
      setTheme(payload.themeSource);
    });
  }, [on, setTheme]);

  return null;
}
