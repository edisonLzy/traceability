import { join } from "path";

import { app, BrowserWindow, Menu, nativeImage, nativeTheme } from "electron";
import type { MenuItemConstructorOptions } from "electron";

import { AgentPool } from "./agent-pool.js";
import { AuthSession } from "./auth/auth-session.js";
import { BrowserRuntimeController } from "./browser/index.js";
import { initMonitor } from "./monitor.js";
import { SessionPersistence } from "./sessions/index.js";
import { applyPersistedThemeSource, ThemeController } from "./theme.js";
import { AppUpdateService } from "./update-service.js";
import { WindowController } from "./window-controller.js";

const developmentIconPath = join(__dirname, "../../resources/icon-fingerprint.png");

void initMonitor();
app.enableSandbox();

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
    const appUpdateService = new AppUpdateService(browserWindow);
    const browserRuntimeController = new BrowserRuntimeController(() => browserWindow);
    createApplicationMenu(appUpdateService);
    appUpdateService.start();

    app.on("activate", () => {
      if (!browserWindow || browserWindow.isDestroyed()) {
        browserWindow = createWindow();
        agentPool.updateBrowserWindow(browserWindow);
        sessionPersistence.updateBrowserWindow(browserWindow);
        authSession.updateBrowserWindow(browserWindow);
        themeController.updateBrowserWindow(browserWindow);
        windowController.updateBrowserWindow(browserWindow);
        appUpdateService.updateBrowserWindow(browserWindow);
        browserRuntimeController.updateBrowserWindow(browserWindow);
      }
    });

    app.on("quit", () => {
      void agentPool.destroyAll();
      void sessionPersistence.destroyAll();
      void authSession.destroyAll();
      themeController.destroyAll();
      windowController.destroyAll();
      appUpdateService.destroyAll();
      browserRuntimeController.destroyAll();
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

function createApplicationMenu(appUpdateService: AppUpdateService): void {
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "检查更新…",
    click: () => {
      void appUpdateService.checkForAppUpdate();
    },
  };

  const template: MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: "Traceability",
            submenu: [
              { label: "关于 Traceability", role: "about" },
              { type: "separator" },
              checkForUpdatesItem,
              { type: "separator" },
              { role: "services", submenu: [] },
              { type: "separator" },
              { label: "隐藏 Traceability", role: "hide" },
              { label: "隐藏其他", role: "hideOthers" },
              { label: "显示全部", role: "unhide" },
              { type: "separator" },
              { label: "退出 Traceability", role: "quit" },
            ],
          },
          {
            label: "编辑",
            submenu: [
              { label: "撤销", role: "undo" },
              { label: "重做", role: "redo" },
              { type: "separator" },
              { label: "剪切", role: "cut" },
              { label: "复制", role: "copy" },
              { label: "粘贴", role: "paste" },
              { label: "粘贴并匹配样式", role: "pasteAndMatchStyle" },
              { label: "删除", role: "delete" },
              { label: "全选", role: "selectAll" },
            ],
          },
          { label: "视图", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
          { role: "windowMenu" },
        ]
      : [
          { label: "文件", submenu: [{ label: "退出 Traceability", role: "quit" }] },
          {
            label: "编辑",
            submenu: [
              { label: "撤销", role: "undo" },
              { label: "重做", role: "redo" },
              { type: "separator" },
              { label: "剪切", role: "cut" },
              { label: "复制", role: "copy" },
              { label: "粘贴", role: "paste" },
              { label: "粘贴并匹配样式", role: "pasteAndMatchStyle" },
              { label: "删除", role: "delete" },
              { label: "全选", role: "selectAll" },
            ],
          },
          { label: "帮助", submenu: [checkForUpdatesItem] },
        ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

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
      webviewTag: true,
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
