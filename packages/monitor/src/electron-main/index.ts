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
  ElectronMainOptions,
} from "@sentry/electron/main";

import { startResourceMonitor, sampleResources, getEnvironment } from "./environment.js";
import type {
  ElectronEnvironment,
  ElectronSystemSnapshot,
  ResourceMonitorOptions,
} from "./environment.js";

export function init(options: ElectronMainOptions): void {
  initFromSentry(options);
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
