/**
 * Write text to the system clipboard. Electron's Chromium renderer exposes
 * {@link https://developer.mozilla.org/docs/Web/API/Clipboard/writeText | navigator.clipboard.writeText}
 * directly, so no IPC bridge is needed.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
