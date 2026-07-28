import "dotenv/config";
import { registerShutdownSignals } from "./bootstrap/shutdown.js";
import { createWorkerRuntime } from "./bootstrap/worker-runtime.js";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./shared/isMainModule.js";

export async function startWorker(): Promise<void> {
  const runtime = createWorkerRuntime(loadRuntimeConfig());
  registerShutdownSignals(runtime.close);
  await runtime.ready();
}

if (isMainModule(import.meta.url)) await startWorker();
