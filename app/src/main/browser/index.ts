import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

import { BrowserRuntimeManager } from "./browser-runtime-manager.js";
import type {
  BrowserRuntimeApplyProjectionInput,
  BrowserRuntimeAttachInput,
  BrowserRuntimeDetachInput,
  BrowserRuntimeFocusAnchorInput,
  BrowserRuntimeSetModeInput,
  BrowserRuntimeUpdateBoundsInput,
} from "./types.js";

export * from "./types.js";
export * from "./browser-runtime.js";
export * from "./browser-runtime-manager.js";
export * from "./providers/provider-registry.js";

export class BrowserRuntimeController {
  readonly manager: BrowserRuntimeManager;

  constructor(private getBrowserWindow: () => BrowserWindow | null) {
    this.manager = new BrowserRuntimeManager(getBrowserWindow);
    this.registerIpcHandlers();
  }

  updateBrowserWindow(_browserWindow: BrowserWindow): void {
    // getBrowserWindow getter dynamically returns current window
  }

  destroyAll(): void {
    this.manager.destroyAll();
    this.removeIpcHandlers();
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("browser-runtime:attach", async (_event, input: BrowserRuntimeAttachInput) => {
      await this.manager.acquire(input);
      return { success: true };
    });

    ipcMain.handle(
      "browser-runtime:updateBounds",
      (_event, input: BrowserRuntimeUpdateBoundsInput) => {
        this.manager.updateBounds(input.nodeId, input.bounds);
        return { success: true };
      },
    );

    ipcMain.handle("browser-runtime:detach", (_event, input: BrowserRuntimeDetachInput) => {
      this.manager.detach(input.nodeId, input.viewState);
      return { success: true };
    });

    ipcMain.handle("browser-runtime:setMode", (_event, input: BrowserRuntimeSetModeInput) => {
      this.manager.setMode(input.nodeId, input.mode);
      return { success: true };
    });

    ipcMain.handle(
      "browser-runtime:applyProjection",
      (_event, input: BrowserRuntimeApplyProjectionInput) => {
        this.manager.applyProjection(input.nodeId, input.rules, input.revealed);
        return { success: true };
      },
    );

    ipcMain.handle(
      "browser-runtime:focusAnchor",
      (_event, input: BrowserRuntimeFocusAnchorInput) => {
        this.manager.focusAnchor(input.nodeId, input.anchorId, input.locators);
        return { success: true };
      },
    );

    ipcMain.handle("browser-runtime:reload", (_event, nodeId: string) => {
      this.manager.reload(nodeId);
      return { success: true };
    });
  }

  private removeIpcHandlers(): void {
    ipcMain.removeHandler("browser-runtime:attach");
    ipcMain.removeHandler("browser-runtime:updateBounds");
    ipcMain.removeHandler("browser-runtime:detach");
    ipcMain.removeHandler("browser-runtime:setMode");
    ipcMain.removeHandler("browser-runtime:applyProjection");
    ipcMain.removeHandler("browser-runtime:focusAnchor");
    ipcMain.removeHandler("browser-runtime:reload");
  }
}
