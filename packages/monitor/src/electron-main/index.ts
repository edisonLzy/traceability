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

export type { ElectronEnvironment, ElectronSystemSnapshot, ResourceMonitorOptions };

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
};
