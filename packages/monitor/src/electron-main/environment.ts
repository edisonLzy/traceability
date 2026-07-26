import * as os from "node:os";

export interface ElectronSystemSnapshot {
  totalMemory: number;
  freeMemory: number;
  processMemory: number;
  memoryRatio: number;
  cpuLoad: number;
  networkOnline: boolean;
}

export interface ElectronEnvironment {
  platform: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromiumVersion: string;
  os: { platform: string; release: string; arch: string };
  hardware: { cpuCount: number; cpuModel: string };
  system: ElectronSystemSnapshot;
}

export function sampleResources(): ElectronSystemSnapshot {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const processMemory = process.memoryUsage().rss;
  return {
    totalMemory,
    freeMemory,
    processMemory,
    memoryRatio: totalMemory > 0 ? processMemory / totalMemory : 0,
    cpuLoad: 0,
    networkOnline: Object.values(os.networkInterfaces()).some((interfaces) =>
      interfaces?.some((iface) => !iface.internal),
    ),
  };
}

export function getEnvironment(): ElectronEnvironment {
  const cpus = os.cpus();
  return {
    platform: "electron-main",
    appVersion: safeAppVersion(),
    electronVersion: process.versions.electron ?? "unknown",
    nodeVersion: process.versions.node,
    chromiumVersion: process.versions.chrome ?? "unknown",
    os: { platform: process.platform, release: os.release(), arch: process.arch },
    hardware: { cpuCount: cpus.length, cpuModel: cpus[0]?.model ?? "unknown" },
    system: sampleResources(),
  };
}

export interface ResourceMonitorOptions {
  sampleInterval?: number;
  memoryThreshold?: number;
  cpuThreshold?: number;
  onThreshold?: (snapshot: ElectronSystemSnapshot) => void;
}

export function startResourceMonitor(opts: ResourceMonitorOptions = {}): () => void {
  const sampleInterval = Math.max(5_000, opts.sampleInterval ?? 60_000);
  const memoryThreshold = opts.memoryThreshold ?? 0.85;
  const cpuThreshold = opts.cpuThreshold ?? 0.9;

  let previousCpu = process.cpuUsage();
  let previousSampleAt = Date.now();

  const timer = setInterval(() => {
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

    const snapshot: ElectronSystemSnapshot = { ...sampleResources(), cpuLoad };

    if (snapshot.memoryRatio >= memoryThreshold || snapshot.cpuLoad >= cpuThreshold) {
      opts.onThreshold?.(snapshot);
    }
  }, sampleInterval).unref();

  return () => clearInterval(timer);
}

function safeAppVersion(): string {
  try {
    const { app } = require("electron");
    return app.getVersion();
  } catch {
    return "unknown";
  }
}
