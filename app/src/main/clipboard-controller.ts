import { clipboard, ipcMain } from "electron";

import type { ClipboardIPC } from "../shared/clipboard-ipc.js";

const IPC_CHANNELS = ["writeClipboardText"] as const;

/** 主进程剪贴板写入，renderer 复制按钮经此通道（不依赖渲染进程焦点/权限）。 */
export class ClipboardController implements ClipboardIPC {
  public writeClipboardText = async (text: string): Promise<void> => {
    clipboard.writeText(text);
  };

  public destroyAll() {
    for (const channel of IPC_CHANNELS) ipcMain.removeHandler(channel);
  }

  private bindIPC() {
    ipcMain.handle("writeClipboardText", (_event, text: string) => this.writeClipboardText(text));
  }

  public constructor() {
    this.bindIPC();
  }
}
