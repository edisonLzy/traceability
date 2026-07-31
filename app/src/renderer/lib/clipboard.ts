/**
 * Write text to the system clipboard via the IPC bridge. The renderer cannot
 * reach the Electron clipboard module directly (contextIsolation on), so this
 * invokes the allowlisted `clipboard.writeText` channel registered in main.
 *
 * Callers outside the React provider tree (e.g. the global error boundary,
 * which sits above ElectronIPCProvider) call this directly rather than via the
 * `useElectronIPC()` hook, which only resolves inside the provider subtree.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await window.electronAPI.invoke("clipboardWriteText", text);
}
