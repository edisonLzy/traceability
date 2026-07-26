import * as Sentry from "@sentry/browser";
import type { Integration } from "@sentry/core";
const captureMessage = Sentry.captureMessage;

interface ScriptElement {
  src: string;
  crossorigin: string | null;
}

function getCrossOriginScripts(doc: Document): ScriptElement[] {
  const scripts = Array.from(doc.querySelectorAll("script[src]")) as HTMLScriptElement[];
  return scripts
    .map((s) => ({ src: s.src, crossorigin: s.getAttribute("crossorigin") }))
    .filter((s) => {
      try {
        const url = new URL(s.src, doc.location.href);
        return url.origin !== doc.location.origin && s.crossorigin === null;
      } catch {
        return false;
      }
    });
}

export function corsDiagnosticIntegration(): Integration {
  return {
    name: "CorsDiagnostic",
    setupOnce(): void {
      if (typeof document === "undefined") return;
      // defer until scripts are present
      const check = () => {
        const offenders = getCrossOriginScripts(document);
        if (offenders.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[traceability] ${offenders.length} cross-origin <script> without crossorigin attribute. ` +
              `This causes "Script error." and lost stacktraces. Add crossorigin="anonymous" + CORS headers.`,
          );
          captureMessage("cors-config-warning", {
            level: "warning",
            tags: { type: "cors-config-warning" },
            extra: { offenders: offenders.map((o) => o.src) },
          });
        }
      };
      if (document.readyState === "complete") {
        check();
      } else {
        window.addEventListener("load", check);
      }
    },
  };
}
