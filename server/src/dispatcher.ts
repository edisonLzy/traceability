import "dotenv/config";
import { createDispatcherRuntime } from "./bootstrap/dispatcher-runtime.js";
import { registerShutdownSignals } from "./bootstrap/shutdown.js";
import { loadRuntimeConfig } from "./config/index.js";
import { isMainModule } from "./shared/isMainModule.js";

export async function startDispatcher(): Promise<void> {
  const runtime = createDispatcherRuntime(loadRuntimeConfig());
  let stopping = false;
  const stop = async () => {
    stopping = true;
    await runtime.close();
  };
  registerShutdownSignals(stop);

  while (!stopping) {
    await runtime.dispatcher.dispatchAvailable();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

if (isMainModule(import.meta.url)) await startDispatcher();
