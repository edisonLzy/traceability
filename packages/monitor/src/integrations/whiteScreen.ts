import * as Sentry from "@sentry/browser";
import type { Integration } from "@sentry/core";
const captureMessage = Sentry.captureMessage;

export interface WhiteScreenOptions {
  rootSelector?: string;
  stableWindowMs?: number;
  minContentNodes?: number;
  enableScreenshot?: boolean;
}

interface PendingTracker {
  pending: number;
  inc(): void;
  dec(): void;
}

function patchFetch(tracker: PendingTracker): void {
  if (typeof window === "undefined" || (window as any).__WS_FETCH_PATCHED__) return;
  (window as any).__WS_FETCH_PATCHED__ = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((...args: Parameters<typeof fetch>) => {
    tracker.inc();
    return orig(...args).finally(() => tracker.dec());
  }) as typeof fetch;
}

function countVisibleContent(root: Element, minNodes: number): number {
  let n = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "img" || (tag === "div" && (el.textContent?.trim().length ?? 0) > 0)) {
      n++;
      if (n >= minNodes) break;
    }
  }
  return n;
}

export function whiteScreenIntegration(opts: WhiteScreenOptions = {}): Integration {
  const rootSelector = opts.rootSelector ?? "#root,#app,[data-monitor-root]";
  const stableWindowMs = opts.stableWindowMs ?? 500;
  const minContentNodes = opts.minContentNodes ?? 3;

  const tracker: PendingTracker = {
    pending: 0,
    inc() {
      this.pending++;
    },
    dec() {
      this.pending--;
    },
  };

  return {
    name: "WhiteScreen",
    setupOnce(): void {
      if (typeof document === "undefined") return;
      patchFetch(tracker);

      const evaluate = () => {
        const root = document.querySelector(rootSelector);
        if (!root) return;
        if (root.childElementCount === 0) {
          reportWhiteScreen("empty-root");
          return;
        }
        if (root.querySelector(".dt-white-screen, .error-boundary")) {
          reportWhiteScreen("error-screen");
          return;
        }
        const visible = countVisibleContent(root, minContentNodes);
        if (visible < minContentNodes) {
          reportWhiteScreen("low-content", { visibleNodes: visible });
        }
      };

      const scheduleCheck = () => {
        let lastMutation = Date.now();
        const mo = new MutationObserver(() => {
          lastMutation = Date.now();
        });
        const root = document.querySelector(rootSelector);
        if (root) mo.observe(root, { childList: true, subtree: true });

        const tick = () => {
          const stable = Date.now() - lastMutation >= stableWindowMs && tracker.pending <= 0;
          if (stable) {
            mo.disconnect();
            evaluate();
          } else {
            setTimeout(tick, stableWindowMs);
          }
        };
        setTimeout(tick, stableWindowMs);
      };

      // re-run on SPA navigation
      const origPush = history.pushState.bind(history);
      history.pushState = function (...args: Parameters<typeof history.pushState>) {
        const r = origPush(...args);
        scheduleCheck();
        return r;
      };
      window.addEventListener("popstate", scheduleCheck);
      window.addEventListener("load", scheduleCheck);
    },
  };

  function reportWhiteScreen(reason: string, extra?: Record<string, unknown>): void {
    captureMessage("white-screen", {
      tags: { type: "white-screen" },
      extra: { reason, ...extra },
    });
  }
}
