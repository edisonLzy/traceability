import * as os from "node:os";

import {
  serializeEnvelope,
  type Envelope,
  type Transport,
  type TransportMakeRequestResponse,
} from "@sentry/core";
import * as SentryMain from "@sentry/electron/main";
import type { InitOptions } from "@traceability/core";
import { app, crashReporter, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";

export interface MainInitOptions extends InitOptions {
  app?: { name?: string; version?: string };
  system?: {
    sampleInterval?: number;
    memoryThreshold?: number;
    cpuThreshold?: number;
  };
}

export interface ElectronSystemSnapshot {
  totalMemory: number;
  freeMemory: number;
  processMemory: number;
  memoryRatio: number;
  cpuLoad: number;
  networkOnline: boolean;
}

export interface ElectronEnvironment {
  platform: "electron-main";
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromiumVersion: string;
  os: { platform: string; release: string; arch: string };
  hardware: { cpuCount: number; cpuModel: string };
  system: ElectronSystemSnapshot;
}

export interface MainMonitor {
  report(type: string, payload?: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
  sampleResources(): ElectronSystemSnapshot;
  getEnvironment(): ElectronEnvironment;
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void;
}

let activeMonitor: MainMonitor | undefined;

/**
 * Initializes Electron's main-process collector. It records crash/uncaught
 * errors, process and system health, renderer exits, and errors thrown by IPC
 * handlers registered through `monitor.handle`.
 */
export function initMain(opts: MainInitOptions): MainMonitor {
  if (activeMonitor) return activeMonitor;

  const ingestUrl = `${opts.dsn.replace(/\/$/, "")}/api/ingest/envelope/${opts.appId}`;
  const productName = opts.app?.name ?? safeAppName();
  const appVersion = opts.app?.version ?? safeAppVersion();
  let previousCpu = process.cpuUsage();
  let previousSampleAt = Date.now();

  SentryMain.init({
    dsn: `https://dummy@local/${opts.appId}`,
    release: opts.release,
    environment: opts.environment,
    transport: () => createMainTransport(ingestUrl, opts.token),
    beforeSend(event) {
      event.tags = { ...(event.tags ?? {}), appId: opts.appId, platform: "electron-main" };
      event.contexts = {
        ...(event.contexts ?? {}),
        electron: getEnvironment() as unknown as Record<string, unknown>,
      };
      return event;
    },
  });

  const sampleResources = (): ElectronSystemSnapshot => {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - previousSampleAt);
    const cpu = process.cpuUsage(previousCpu);
    previousCpu = process.cpuUsage();
    previousSampleAt = now;
    const cpuCount = Math.max(1, os.cpus().length);
    const cpuLoad = Math.min(
      1,
      Math.max(0, (cpu.user + cpu.system) / (elapsedMs * 1000 * cpuCount)),
    );
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const processMemory = process.memoryUsage().rss;
    return {
      totalMemory,
      freeMemory,
      processMemory,
      memoryRatio: totalMemory > 0 ? processMemory / totalMemory : 0,
      cpuLoad,
      networkOnline: Object.values(os.networkInterfaces()).some((entries) =>
        entries?.some((entry) => !entry.internal),
      ),
    };
  };

  const getEnvironment = (): ElectronEnvironment => {
    const cpus = os.cpus();
    return {
      platform: "electron-main",
      appVersion,
      electronVersion: process.versions.electron ?? "unknown",
      nodeVersion: process.versions.node,
      chromiumVersion: process.versions.chrome ?? "unknown",
      os: { platform: process.platform, release: os.release(), arch: process.arch },
      hardware: { cpuCount: cpus.length, cpuModel: cpus[0]?.model ?? "unknown" },
      system: sampleResources(),
    };
  };

  const report = (type: string, payload: Record<string, unknown> = {}) => {
    SentryMain.captureMessage(type, {
      tags: { event_type: type, platform: "electron-main" },
      extra: { ...payload, electron: getEnvironment() },
    });
  };

  const captureException = (error: unknown, context: Record<string, unknown> = {}) => {
    SentryMain.withScope((scope) => {
      scope.setTags({
        platform: "electron-main",
        event_type: String(context.event_type ?? "electron-main-error"),
      });
      scope.setExtras({ ...context, electron: getEnvironment() });
      SentryMain.captureException(error);
    });
  };

  const monitor: MainMonitor = {
    report,
    captureException,
    sampleResources: () => {
      const snapshot = sampleResources();
      report("electron-system-resource", { ...snapshot });
      const memoryThreshold = opts.system?.memoryThreshold ?? 0.85;
      const cpuThreshold = opts.system?.cpuThreshold ?? 0.9;
      if (snapshot.memoryRatio >= memoryThreshold || snapshot.cpuLoad >= cpuThreshold) {
        report("electron-resource-threshold", { ...snapshot, memoryThreshold, cpuThreshold });
      }
      return snapshot;
    },
    getEnvironment,
    handle(channel, listener) {
      ipcMain.handle(channel, async (event, ...args) => {
        try {
          return await listener(event, ...args);
        } catch (error) {
          captureException(error, { event_type: "electron-ipc-error", channel });
          throw error;
        }
      });
    },
  };
  activeMonitor = monitor;

  try {
    crashReporter.start({ productName, uploadToServer: false });
  } catch {
    // Crash reporting is unavailable in a few test and development shells.
  }

  process.on("uncaughtException", (error) => {
    captureException(error, { event_type: "electron-main-crash", crash: "uncaughtException" });
    report("electron-main-crash", { reason: "uncaughtException", message: error.message });
  });
  process.on("unhandledRejection", (reason) => {
    captureException(reason, { event_type: "electron-main-unhandled-rejection" });
  });
  app.on("render-process-gone", (_event, webContents, details) => {
    report("electron-render-process-gone", { webContentsId: webContents.id, ...details });
  });
  app.on("child-process-gone", (_event, details) => {
    report("electron-child-process-gone", details as unknown as Record<string, unknown>);
  });

  monitor.handle("traceability:environment", () => monitor.getEnvironment());
  monitor.handle("traceability:sample-resources", () => monitor.sampleResources());
  monitor.handle("traceability:config", () => ({
    dsn: opts.dsn,
    appId: opts.appId,
    token: opts.token,
    release: opts.release,
    environment: opts.environment,
  }));
  ipcMain.on("traceability:report", (_event, event: unknown) => {
    if (isRecord(event) && typeof event.type === "string")
      report(event.type, event.payload as Record<string, unknown> | undefined);
  });

  const interval = Math.max(5_000, opts.system?.sampleInterval ?? 60_000);
  setInterval(() => monitor.sampleResources(), interval).unref();
  return monitor;
}

function safeAppName(): string {
  try {
    return app.getName();
  } catch {
    return "traceability-electron";
  }
}

function safeAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createMainTransport(url: string, token: string): Transport {
  return {
    async send(request: Envelope): Promise<TransportMakeRequestResponse> {
      const serialized = serializeEnvelope(request);
      const body =
        typeof serialized === "string" ? serialized : new TextDecoder().decode(serialized);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${token}` },
          body,
        });
        return { statusCode: response.status };
      } catch {
        return { statusCode: 0 };
      }
    },
    flush: () => Promise.resolve(true),
  };
}
