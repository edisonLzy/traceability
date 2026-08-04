import { init } from "@tracerability/monitor/electron-renderer";

/**
 * Initialize Traceability monitoring in the renderer.
 * Sentry's Electron integration pulls the DSN from the main process, so no
 * DSN is repeated here. Call at the renderer entry before any UI code that
 * might throw.
 */
export function initRendererMonitor(): void {
  init({});
}
