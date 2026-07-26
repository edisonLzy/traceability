import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  browserTracingIntegration,
  replayIntegration,
} from "@sentry/electron/renderer";

import { corsDiagnosticIntegration } from "../integrations/corsDiagnostic.js";
import { whiteScreenIntegration } from "../integrations/whiteScreen.js";

export function init(options: any): void {
  initFromSentry({
    ...options,
    integrations: (defaults: any[]) => [
      corsDiagnosticIntegration(),
      whiteScreenIntegration(),
      browserTracingIntegration(),
      replayIntegration(),
      ...defaults,
      ...(typeof options.integrations === "function"
        ? options.integrations(defaults)
        : (options.integrations ?? [])),
    ],
  });
}

export { captureException, captureMessage, setUser, setTag, setContext, addBreadcrumb, withScope };
