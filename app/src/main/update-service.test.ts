import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: never[]) => void>>();
  const updater = Object.assign(
    {
      on(event: string, listener: (...args: never[]) => void) {
        const eventListeners = listeners.get(event) ?? [];
        eventListeners.push(listener);
        listeners.set(event, eventListeners);
        return updater;
      },
      removeListener(event: string, listener: (...args: never[]) => void) {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((registered) => registered !== listener),
        );
        return updater;
      },
      removeAllListeners() {
        listeners.clear();
        return updater;
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) listener(...(args as never[]));
        return true;
      },
    },
    {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      disableWebInstaller: false,
      allowDowngrade: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    },
  );

  return {
    app: {
      isPackaged: true,
      getVersion: vi.fn(() => "1.0.0"),
      getPath: vi.fn(() => "/tmp"),
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
    },
    updater,
  };
});

vi.mock("electron", () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  shell: mocks.shell,
}));

vi.mock("electron-updater", () => ({
  default: { autoUpdater: mocks.updater },
}));

import { AppUpdateService } from "./update-service.js";

describe("AppUpdateService", () => {
  const originalPlatform = process.platform;
  const browserWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(),
    },
  } as never;

  let service: AppUpdateService;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    mocks.app.isPackaged = true;
    mocks.app.getVersion.mockReturnValue("1.0.0");
    mocks.updater.removeAllListeners();
    mocks.updater.checkForUpdates.mockReset();
    mocks.updater.downloadUpdate.mockReset();
    mocks.updater.quitAndInstall.mockReset();
    vi.clearAllMocks();
    service = new AppUpdateService(browserWindow);
  });

  afterEach(() => {
    service.destroyAll();
    vi.unstubAllGlobals();
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("checks without downloading and exposes an available update", async () => {
    const info = {
      version: "1.1.0",
      releaseDate: "2026-08-20T00:00:00.000Z",
      releaseName: "Traceability 1.1.0",
      releaseNotes: "Faster investigations",
    };
    mocks.updater.checkForUpdates.mockImplementation(async () => {
      mocks.updater.emit("update-available", info);
      return { isUpdateAvailable: true, updateInfo: info, versionInfo: info };
    });

    const state = await service.checkForAppUpdate();

    expect(state).toMatchObject({
      status: "available",
      currentVersion: "1.0.0",
      version: "1.1.0",
      releaseName: "Traceability 1.1.0",
      releaseNotes: "Faster investigations",
      userInitiated: true,
    });
    expect(mocks.updater.autoDownload).toBe(false);
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false);
    expect(mocks.updater.disableWebInstaller).toBe(true);
  });

  it("deduplicates concurrent checks", async () => {
    let resolveCheck!: (result: unknown) => void;
    mocks.updater.checkForUpdates.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );

    const first = service.checkForAppUpdate();
    const second = service.checkForAppUpdate();
    resolveCheck({ isUpdateAvailable: false, updateInfo: {}, versionInfo: {} });

    const [firstState, secondState] = await Promise.all([first, second]);
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(firstState.status).toBe("not-available");
    expect(secondState.status).toBe("not-available");
  });

  it("downloads first and installs only after the explicit restart action", async () => {
    const info = {
      version: "1.1.0",
      releaseDate: "2026-08-20T00:00:00.000Z",
      releaseName: null,
      releaseNotes: null,
    };
    mocks.updater.checkForUpdates.mockImplementation(async () => {
      mocks.updater.emit("update-available", info);
      return { isUpdateAvailable: true, updateInfo: info, versionInfo: info };
    });
    await service.checkForAppUpdate();

    mocks.updater.downloadUpdate.mockImplementation(async () => {
      mocks.updater.emit("download-progress", {
        percent: 42,
        transferred: 42,
        total: 100,
        bytesPerSecond: 10,
      });
      mocks.updater.emit("update-downloaded", info);
      return ["/tmp/Traceability-update.zip"];
    });

    const downloaded = await service.downloadAppUpdate();
    expect(downloaded.status).toBe("downloaded");
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();

    await service.installAppUpdate();
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("checks desktop GitHub releases on macOS and downloads the matching ZIP", async () => {
    service.destroyAll();
    Object.defineProperty(process, "platform", { configurable: true, value: "darwin" });
    service = new AppUpdateService(browserWindow);

    const releaseUrl = "https://github.com/edisonLzy/traceability/releases/tag/v1.1.0";
    const architecture = process.arch === "arm64" ? "arm64" : "x64";
    const assetName = `Traceability-1.1.0-${architecture}.zip`;
    const assetUrl = `https://github.com/edisonLzy/traceability/releases/download/v1.1.0/${assetName}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: null,
        json: async () => [
          {
            tag_name: "v1.1.0",
            name: "Traceability 1.1.0",
            published_at: "2026-08-20T00:00:00.000Z",
            body: "Manual macOS update",
            html_url: releaseUrl,
            assets: [
              {
                name: assetName,
                browser_download_url: assetUrl,
                digest: "sha256:c9ef77cdc211a9e6c2a32876ef36d52cfa61c7a42193d9c2198be8957d60de81",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce(new Response("test archive", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const state = await service.checkForAppUpdate();

    expect(state).toMatchObject({
      status: "available",
      version: "1.1.0",
      releaseUrl,
    });
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();

    const downloaded = await service.downloadAppUpdate();

    expect(downloaded).toMatchObject({
      status: "downloaded",
      version: "1.1.0",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
