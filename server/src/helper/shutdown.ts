export function createShutdown(closers: Array<() => Promise<unknown>>): () => Promise<void> {
  let shutdown: Promise<void> | undefined;
  return () => {
    shutdown ??= Promise.allSettled(closers.map((close) => close())).then(() => undefined);
    return shutdown;
  };
}

export function registerShutdownSignals(shutdown: () => Promise<void>): void {
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}
