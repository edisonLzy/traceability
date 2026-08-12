import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

import type { WindowIPC, WindowState } from "../shared/window-ipc.js";

const IPC_CHANNELS = [
  "closeWindow",
  "getWindowState",
  "minimizeWindow",
  "toggleFullScreenWindow",
  "toggleMaximizeWindow",
] as const;

/** Owns the small renderer-facing window-control surface for the frameless shell. */
export class WindowController implements WindowIPC {
  private browserWindow: BrowserWindow;
  private removeWindowListeners: VoidFunction = () => undefined;

  public constructor(browserWindow: BrowserWindow) {
    this.browserWindow = browserWindow;
    this.bindIPC();
    this.bindWindow(browserWindow);
  }

  public updateBrowserWindow(browserWindow: BrowserWindow) {
    this.removeWindowListeners();
    this.browserWindow = browserWindow;
    this.bindWindow(browserWindow);
  }

  public getWindowState = async (): Promise<WindowState> => this.buildState();

  public minimizeWindow = async (): Promise<void> => {
    this.browserWindow.minimize();
  };

  public toggleMaximizeWindow = async (): Promise<WindowState> => {
    if (this.browserWindow.isMaximized()) this.browserWindow.unmaximize();
    else this.browserWindow.maximize();
    return this.buildState();
  };

  public toggleFullScreenWindow = async (): Promise<WindowState> => {
    const isFullScreen = !this.browserWindow.isFullScreen();
    this.browserWindow.setFullScreen(isFullScreen);
    return { ...this.buildState(), isFullScreen };
  };

  public closeWindow = async (): Promise<void> => {
    this.browserWindow.close();
  };

  public destroyAll() {
    this.removeWindowListeners();
    for (const channel of IPC_CHANNELS) ipcMain.removeHandler(channel);
  }

  private bindIPC() {
    ipcMain.handle("closeWindow", this.closeWindow);
    ipcMain.handle("getWindowState", this.getWindowState);
    ipcMain.handle("minimizeWindow", this.minimizeWindow);
    ipcMain.handle("toggleFullScreenWindow", this.toggleFullScreenWindow);
    ipcMain.handle("toggleMaximizeWindow", this.toggleMaximizeWindow);
  }

  private bindWindow(browserWindow: BrowserWindow) {
    const publishState = (overrides: Partial<WindowState> = {}) => {
      if (!browserWindow.isDestroyed() && !browserWindow.webContents.isDestroyed()) {
        browserWindow.webContents.send("window_state_updated", {
          ...this.buildState(),
          ...overrides,
        });
      }
    };

    const publishEnteredFullScreen = () => publishState({ isFullScreen: true });
    const publishLeftFullScreen = () => publishState({ isFullScreen: false });

    browserWindow.on("blur", publishState);
    browserWindow.on("enter-full-screen", publishEnteredFullScreen);
    browserWindow.on("focus", publishState);
    browserWindow.on("leave-full-screen", publishLeftFullScreen);
    browserWindow.on("maximize", publishState);
    browserWindow.on("unmaximize", publishState);
    this.removeWindowListeners = () => {
      browserWindow.removeListener("blur", publishState);
      browserWindow.removeListener("enter-full-screen", publishEnteredFullScreen);
      browserWindow.removeListener("focus", publishState);
      browserWindow.removeListener("leave-full-screen", publishLeftFullScreen);
      browserWindow.removeListener("maximize", publishState);
      browserWindow.removeListener("unmaximize", publishState);
    };
  }

  private buildState(): WindowState {
    return {
      isFocused: this.browserWindow.isFocused(),
      isFullScreen: this.browserWindow.isFullScreen(),
      isMaximized: this.browserWindow.isMaximized(),
    };
  }
}
