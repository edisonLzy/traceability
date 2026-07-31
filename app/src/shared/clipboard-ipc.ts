export interface ClipboardIPC {
  /** Write text to the system clipboard. */
  clipboardWriteText: (text: string) => Promise<void>;
}
