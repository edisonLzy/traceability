import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, nativeTheme } from "electron";
import type { BrowserWindow } from "electron";

import type { NativeThemeUpdatedEvent, ThemeIPC, ThemeSource } from "../shared/theme-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";

const THEME_SOURCES: readonly ThemeSource[] = ["light", "dark", "system"];

/** Apply a previously-persisted theme source before the window is created so
    the titlebar/vibrancy are correct from first paint. */
export function applyPersistedThemeSource() {
  const source = readPersistedSource();
  if (source) nativeTheme.themeSource = source;
}

function readPersistedSource(): ThemeSource | null {
  const filePath = join(app.getPath("userData"), "theme-source.json");
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { themeSource?: unknown };
    return THEME_SOURCES.includes(parsed.themeSource as ThemeSource)
      ? (parsed.themeSource as ThemeSource)
      : null;
  } catch {
    return null;
  }
}

/** Owns the native theme source: keeps Electron's nativeTheme in sync with the
    renderer's chosen theme and persists the choice across launches so the
    titlebar/vibrancy are correct from first paint. */
export class ThemeController extends AbstractAgentIPCHandler<ThemeIPC> implements ThemeIPC {
  private readonly filePath = join(app.getPath("userData"), "theme-source.json");

  public constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();

    // Push the resolved theme whenever the OS/system source changes so the
    // renderer can follow live even in System mode.
    nativeTheme.on("updated", () => {
      this.sendMessageToRenderer("native_theme_updated", this.buildEvent());
    });
  }

  protected override bind(): VoidFunction {
    const channels = ["setThemeSource", "getThemeSource"] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) this.typedIpcMain.removeHandler(channel);
    };
  }

  public setThemeSource: ThemeIPC["setThemeSource"] = async (
    source: ThemeSource,
  ): Promise<void> => {
    nativeTheme.themeSource = source;
    writeFileSync(this.filePath, JSON.stringify({ themeSource: source }), { mode: 0o600 });
  };

  public getThemeSource: ThemeIPC["getThemeSource"] = async (): Promise<ThemeSource | null> => {
    return readPersistedSource();
  };

  private buildEvent(): NativeThemeUpdatedEvent {
    return {
      themeSource: nativeTheme.themeSource as ThemeSource,
      resolved: nativeTheme.shouldUseDarkColors ? "dark" : "light",
    };
  }

  public destroyAll() {
    nativeTheme.removeAllListeners("updated");
    this.unbind?.();
  }
}
