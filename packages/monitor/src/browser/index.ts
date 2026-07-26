import {
  init as initFromSentry,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  addBreadcrumb,
  withScope,
} from "@sentry/browser";
import type { BrowserOptions, SeverityLevel, User, Breadcrumb, Scope } from "@sentry/browser";
import type { Transport } from "@sentry/core";

import { corsDiagnosticIntegration } from "../integrations/corsDiagnostic.js";
import { whiteScreenIntegration } from "../integrations/whiteScreen.js";

export function init(options: BrowserOptions): void {
  initFromSentry({
    ...options,
    integrations: (defaults) => [
      corsDiagnosticIntegration(),
      whiteScreenIntegration(),
      ...defaults,
      ...(typeof options.integrations === "function"
        ? options.integrations(defaults)
        : (options.integrations ?? [])),
    ],
  });
}

export type { BrowserOptions as InitOptions, SeverityLevel, User, Breadcrumb, Scope, Transport };

export { captureException, captureMessage, setUser, setTag, setContext, addBreadcrumb, withScope };
