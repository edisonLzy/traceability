export type ThemeSource = "light" | "dark" | "system";

/** Main -> renderer push when the resolved OS/native theme changes. */
export interface NativeThemeUpdatedEvent {
  themeSource: ThemeSource;
  /** The theme the UI should render right now. */
  resolved: "light" | "dark";
}

export interface ThemeIPC {
  setThemeSource: (source: ThemeSource) => Promise<void>;
  getThemeSource: () => Promise<ThemeSource | null>;
}
