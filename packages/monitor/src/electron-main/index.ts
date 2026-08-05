import type { Span, StartSpanOptions } from "@sentry/core";
import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  flush,
  getActiveSpan,
  metrics,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  makeElectronOfflineTransport,
  ElectronMainOptions,
} from "@sentry/electron/main";

import { startResourceMonitor, sampleResources, getEnvironment } from "./environment.js";
import type {
  ElectronEnvironment,
  ElectronSystemSnapshot,
  ResourceMonitorOptions,
} from "./environment.js";

const defaultTransport = makeElectronOfflineTransport();

export function init(options: ElectronMainOptions): void {
  initFromSentry({
    ...options,
    transport:
      options.transport ??
      ((transportOptions) => {
        const base = defaultTransport(transportOptions);
        return {
          ...base,
          send: async (envelope) => {
            const response = await base.send(envelope);
            const status = response.statusCode;
            if (status !== undefined && status >= 400) {
              console.error(
                `[@tracerability/monitor] envelope rejected by server (HTTP ${status}) — ` +
                  "check that the DSN points to a valid, enabled project key",
              );
            }
            return response;
          },
        };
      }),
  });
}

export type {
  ElectronEnvironment,
  ElectronSystemSnapshot,
  ResourceMonitorOptions,
  Span,
  StartSpanOptions,
};

export {
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  flush,
  startResourceMonitor,
  sampleResources,
  getEnvironment,
  getActiveSpan,
  metrics,
  startInactiveSpan,
  startSpan,
  startSpanManual,
};
