/**
 * Electron preload bridge for @sentry/electron.
 *
 * Sentry's Electron renderer SDK prefers to talk to the main process over IPC
 * (`ipcRenderer.send`) and only falls back to fetching the `sentry-ipc://`
 * custom protocol when `window.__SENTRY_IPC__` is not exposed. Importing this
 * module from an app's preload script exposes that bridge, so the renderer
 * never attempts a `fetch("sentry-ipc://…")` (which Chromium rejects with
 * "URL scheme is not supported").
 *
 * Usage (app preload):
 *   import "@traceability/monitor/electron-preload";
 */
import "@sentry/electron/preload";
