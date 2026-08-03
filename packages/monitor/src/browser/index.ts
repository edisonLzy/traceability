import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  replayIntegration,
  getActiveSpan,
  metrics,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from "@sentry/browser";
import type { BrowserOptions, SeverityLevel, User, Breadcrumb, Scope } from "@sentry/browser";
import type { Span, StartSpanOptions, Transport } from "@sentry/core";

import { corsDiagnosticIntegration } from "../integrations/corsDiagnostic.js";
import { whiteScreenIntegration } from "../integrations/whiteScreen.js";

export function init(options: BrowserOptions): void {
  initFromSentry({
    ...options,
    integrations: (defaults) => [
      corsDiagnosticIntegration(),
      whiteScreenIntegration(),
      replayIntegration(),
      ...defaults,
      ...(typeof options.integrations === "function"
        ? options.integrations(defaults)
        : (options.integrations ?? [])),
    ],
  });
}

export type {
  BrowserOptions as InitOptions,
  SeverityLevel,
  User,
  Breadcrumb,
  Scope,
  Span,
  StartSpanOptions,
  Transport,
};

export {
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
  getActiveSpan,
  metrics,
  startInactiveSpan,
  startSpan,
  startSpanManual,
};
