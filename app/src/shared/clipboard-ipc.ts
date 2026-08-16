export interface ClipboardIPC {
  /** 将文本写入系统剪贴板（主进程 clipboard 模块，不依赖渲染进程焦点/权限）。 */
  writeClipboardText: (text: string) => Promise<void>;
}
