import type { WebContents } from "electron";

import type { BrowserProviderAdapter } from "./providers/provider-registry.js";

export class NavigationPolicy {
  static configureWebContents(
    webContents: WebContents,
    adapter: BrowserProviderAdapter,
    initialUrl: string,
  ): void {
    const fromUrl = new URL(initialUrl);

    // Deny all popup windows and new window targets
    webContents.setWindowOpenHandler(() => {
      return { action: "deny" };
    });

    // Default deny permission requests (geolocation, camera, microphone, notifications)
    webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    webContents.session.setPermissionCheckHandler(() => {
      return false;
    });

    // Source-lock navigation policy
    webContents.on("will-navigate", (event, targetUrl) => {
      try {
        const toUrl = new URL(targetUrl);
        const allowed = adapter.isAllowedNavigation(fromUrl, toUrl, "locked");
        if (!allowed) {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });
  }
}
