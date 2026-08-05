import { init, startResourceMonitor } from "@tracerability/monitor/electron-main";

/**
 * Initialize Traceability monitoring in the Electron main process.
 * The DSN is loaded from `TRACEABILITY_DSN` (see app/.env); its public key
 * is the only credential the SDK needs. Call once on startup, before any
 * windows are created.
 */
export function initMonitor(): void {
  const dsn = import.meta.env.MAIN_VITE_TRACEABILITY_DSN;
  if (!dsn) {
    console.warn("[traceability] TRACEABILITY_DSN not set; monitoring disabled");
    return;
  }

  init({ dsn });
  startResourceMonitor({ sampleInterval: 30_000, memoryThreshold: 0.85, cpuThreshold: 0.9 });
}
