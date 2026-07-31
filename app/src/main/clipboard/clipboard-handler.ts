import { clipboard } from "electron";
import type { BrowserWindow } from "electron";

import type { ClipboardIPC } from "../../shared/clipboard-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";

/**
 * Writes text to the OS clipboard from the renderer. The renderer has no Node
 * access (contextIsolation on), so clipboard writes must go through main.
 */
export class ClipboardHandler
  extends AbstractAgentIPCHandler<ClipboardIPC>
  implements ClipboardIPC
{
  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = ["clipboardWriteText"] as const;
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

  public clipboardWriteText: ClipboardIPC["clipboardWriteText"] = async (
    text: string,
  ): Promise<void> => {
    clipboard.writeText(text);
  };

  public destroyAll() {
    this.unbind?.();
  }
}
