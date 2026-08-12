import { join } from "path";

import { app, BrowserWindow, nativeImage, nativeTheme } from "electron";

import { AgentPool } from "./agent-pool.js";
import { AuthSession } from "./auth/auth-session.js";
import { initMonitor } from "./monitor.js";
import { SessionPersistence } from "./sessions/index.js";
import { applyPersistedThemeSource, ThemeController } from "./theme.js";
import { WindowController } from "./window-controller.js";

const developmentIconPath = join(__dirname, "../../resources/icon-fingerprint.png");

void initMonitor();

void app
  .whenReady()
  .then(() => {
    applyPersistedThemeSource();
    applyDevelopmentAppIcon();

    let browserWindow: BrowserWindow | null = createWindow();

    const agentPool = new AgentPool(browserWindow);
    const sessionPersistence = new SessionPersistence(browserWindow);
    const authSession = new AuthSession(browserWindow);
    const themeController = new ThemeController(browserWindow);
    const windowController = new WindowController(browserWindow);

    app.on("activate", () => {
      if (!browserWindow || browserWindow.isDestroyed()) {
        browserWindow = createWindow();
        agentPool.updateBrowserWindow(browserWindow);
        sessionPersistence.updateBrowserWindow(browserWindow);
        authSession.updateBrowserWindow(browserWindow);
        themeController.updateBrowserWindow(browserWindow);
        windowController.updateBrowserWindow(browserWindow);
      }
    });

    app.on("quit", () => {
      void agentPool.destroyAll();
      void sessionPersistence.destroyAll();
      void authSession.destroyAll();
      themeController.destroyAll();
      windowController.destroyAll();
    });
  })
  .catch((error: unknown) => {
    console.error("Failed to initialize Traceability main process:", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Traceability main process started!");

/** Track the native theme so the titlebar overlay icon color stays legible. */
nativeTheme.on("updated", () => {
  const overlayColor = nativeTheme.shouldUseDarkColors ? "#f5f5f7" : "#1a1a1f";
  BrowserWindow.getAllWindows().forEach((window) => {
    window.setTitleBarOverlay?.({ symbolColor: overlayColor });
  });
});

function createWindow() {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const mainWindow = new BrowserWindow({
    ...(!app.isPackaged && !isMac ? { icon: developmentIconPath } : {}),
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac
      ? { roundedCorners: true, trafficLightPosition: { x: 14, y: 14 } }
      : {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: nativeTheme.shouldUseDarkColors ? "#f5f5f7" : "#1a1a1f",
            height: 40,
          },
        }),
    ...(isMac ? { vibrancy: "under-window", visualEffectState: "active" } : {}),
    ...(isWindows ? { backgroundMaterial: "acrylic", thickFrame: true } : {}),
    backgroundColor: "#00000000",
    minWidth: 880,
    minHeight: 620,
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    title: "Traceability",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

/** electron-builder applies the packaged icon; development runs from Electron.app. */
function applyDevelopmentAppIcon() {
  if (app.isPackaged || process.platform !== "darwin") return;

  const icon = nativeImage.createFromPath(developmentIconPath);
  if (icon.isEmpty()) {
    console.warn(`Unable to load development app icon: ${developmentIconPath}`);
    return;
  }

  app.dock?.setIcon(icon);
}
