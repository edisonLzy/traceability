import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import electronUpdater, { type AppUpdater, type UpdateInfo } from "electron-updater";
import { clean, gt } from "semver";

import { APP_RELEASE_URL } from "../shared/update-ipc.js";
import type { AppUpdateIPC, AppUpdateState, UpdateDownloadProgress } from "../shared/update-ipc.js";

const { autoUpdater } = electronUpdater;

const IPC_CHANNELS: readonly (keyof AppUpdateIPC)[] = [
  "getAppUpdateState",
  "checkForAppUpdate",
  "downloadAppUpdate",
  "installAppUpdate",
  "openAppReleasePage",
];

const UPDATE_PLATFORMS = new Set<NodeJS.Platform>(["darwin", "win32"]);
const AUTOMATIC_UPDATE_PLATFORMS = new Set<NodeJS.Platform>(["win32"]);
const GITHUB_LATEST_MAC_MANIFEST_URL =
  "https://github.com/edisonLzy/traceability/releases/latest/download/latest-mac.yml";

interface MacUpdateAsset {
  name: string;
  browserDownloadUrl: string;
  sha512: string;
}

interface MacUpdateRelease {
  version: string;
  name: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  releaseUrl: string;
  assets: MacUpdateAsset[];
}

interface DownloadedMacUpdate {
  archivePath: string;
  stagingDirectory: string;
}

/**
 * Owns the desktop update lifecycle. The renderer only receives a small,
 * serializable state snapshot and cannot select an arbitrary update URL.
 *
 * Updates are deliberately opt-in after discovery: checking is automatic,
 * downloading requires a user action, and installing requires an explicit
 * restart action. This avoids restarting a user's investigation unexpectedly.
 */
export class AppUpdateService implements AppUpdateIPC {
  private browserWindow: BrowserWindow | null;
  private state: AppUpdateState = createInitialState();
  private checkPromise: Promise<AppUpdateState> | null = null;
  private downloadPromise: Promise<AppUpdateState> | null = null;
  private activeCheckUserInitiated = false;
  private activeDownloadUserInitiated = false;
  private autoCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private removeUpdaterListeners: VoidFunction = () => undefined;
  private macRelease: MacUpdateRelease | null = null;
  private downloadedMacUpdate: DownloadedMacUpdate | null = null;

  public constructor(browserWindow: BrowserWindow) {
    this.browserWindow = browserWindow;
    this.state = createInitialState();
    this.bindIPC();

    if (this.canAutomaticUpdate) this.bindUpdater();
  }

  private get canCheckForUpdate(): boolean {
    return app.isPackaged && UPDATE_PLATFORMS.has(process.platform);
  }

  private get canAutomaticUpdate(): boolean {
    return app.isPackaged && AUTOMATIC_UPDATE_PLATFORMS.has(process.platform);
  }

  public start(): void {
    if (!this.canCheckForUpdate) return;

    // Do not delay app startup on a network request. A short delay also lets
    // the initial window and renderer settle before the first check begins.
    this.autoCheckTimer = setTimeout(() => {
      this.autoCheckTimer = null;
      void this.check(false);
    }, 2_500);
    this.autoCheckTimer.unref?.();
  }

  public updateBrowserWindow(browserWindow: BrowserWindow): void {
    this.browserWindow = browserWindow;
    this.publishState();
  }

  public getAppUpdateState = async (): Promise<AppUpdateState> => this.state;

  public checkForAppUpdate = async (): Promise<AppUpdateState> => {
    return this.check(true);
  };

  public downloadAppUpdate = async (): Promise<AppUpdateState> => {
    if (!this.canCheckForUpdate || this.state.status !== "available") return this.state;

    if (this.downloadPromise) return this.downloadPromise;

    if (!this.canAutomaticUpdate) {
      this.activeDownloadUserInitiated = true;
      const downloadPromise = this.downloadMacUpdate()
        .then(() => this.state)
        .finally(() => {
          this.downloadPromise = null;
          this.activeDownloadUserInitiated = false;
        });
      this.downloadPromise = downloadPromise;
      return downloadPromise;
    }

    this.activeDownloadUserInitiated = true;
    this.setState({
      status: "downloading",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      error: null,
      userInitiated: true,
    });

    const downloadPromise = autoUpdater
      .downloadUpdate()
      .then(() => this.state)
      .catch((error: unknown) => {
        this.setState({
          status: "error",
          error: toErrorMessage(error),
          userInitiated: this.activeDownloadUserInitiated,
        });
        return this.state;
      })
      .finally(() => {
        this.downloadPromise = null;
        this.activeDownloadUserInitiated = false;
      });

    this.downloadPromise = downloadPromise;
    return downloadPromise;
  };

  public installAppUpdate = async (): Promise<void> => {
    if (!this.canCheckForUpdate || this.state.status !== "downloaded") return;

    if (!this.canAutomaticUpdate) {
      try {
        await this.installMacUpdate();
      } catch (error: unknown) {
        this.setState({
          status: "error",
          progress: null,
          error: toErrorMessage(error),
          userInitiated: true,
        });
      }
      return;
    }

    // Installation is only reached after an explicit renderer action. Keep
    // autoInstallOnAppQuit disabled so a normal quit cannot surprise the user.
    autoUpdater.quitAndInstall(false, true);
  };

  public openAppReleasePage = async (): Promise<void> => {
    await shell.openExternal(this.state.releaseUrl);
  };

  public destroyAll(): void {
    if (this.autoCheckTimer) clearTimeout(this.autoCheckTimer);
    this.autoCheckTimer = null;
    this.removeUpdaterListeners();
    this.removeUpdaterListeners = () => undefined;
    this.browserWindow = null;
    this.macRelease = null;
    this.downloadedMacUpdate = null;

    for (const channel of IPC_CHANNELS) ipcMain.removeHandler(channel);
  }

  private bindIPC(): void {
    ipcMain.handle("getAppUpdateState", this.getAppUpdateState);
    ipcMain.handle("checkForAppUpdate", this.checkForAppUpdate);
    ipcMain.handle("downloadAppUpdate", this.downloadAppUpdate);
    ipcMain.handle("installAppUpdate", this.installAppUpdate);
    ipcMain.handle("openAppReleasePage", this.openAppReleasePage);
  }

  private bindUpdater(): void {
    const updater: AppUpdater = autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableWebInstaller = true;
    updater.allowDowngrade = false;

    const onCheckingForUpdate = () => {
      this.setState({
        status: "checking",
        progress: null,
        error: null,
        userInitiated: this.activeCheckUserInitiated,
      });
    };
    const onUpdateAvailable = (info: UpdateInfo) => {
      this.setAvailable(info, this.activeCheckUserInitiated);
    };
    const onUpdateNotAvailable = () => {
      this.setNotAvailable(this.activeCheckUserInitiated);
    };
    const onDownloadProgress = (progress: UpdateDownloadProgress) => {
      this.setState({
        status: "downloading",
        progress: normalizeProgress(progress),
        error: null,
        userInitiated: this.activeDownloadUserInitiated,
      });
    };
    const onUpdateDownloaded = (info: UpdateInfo) => {
      this.setAvailable(info, this.activeDownloadUserInitiated, "downloaded");
    };
    const onUpdateCancelled = () => {
      this.setState({
        status: "available",
        progress: null,
        error: null,
        userInitiated: this.activeDownloadUserInitiated,
      });
    };
    const onError = (error: Error) => {
      this.setState({
        status: "error",
        progress: null,
        error: toErrorMessage(error),
        userInitiated: this.activeDownloadUserInitiated || this.activeCheckUserInitiated,
      });
    };

    updater.on("checking-for-update", onCheckingForUpdate);
    updater.on("update-available", onUpdateAvailable);
    updater.on("update-not-available", onUpdateNotAvailable);
    updater.on("download-progress", onDownloadProgress);
    updater.on("update-downloaded", onUpdateDownloaded);
    updater.on("update-cancelled", onUpdateCancelled);
    updater.on("error", onError);

    this.removeUpdaterListeners = () => {
      updater.removeListener("checking-for-update", onCheckingForUpdate);
      updater.removeListener("update-available", onUpdateAvailable);
      updater.removeListener("update-not-available", onUpdateNotAvailable);
      updater.removeListener("download-progress", onDownloadProgress);
      updater.removeListener("update-downloaded", onUpdateDownloaded);
      updater.removeListener("update-cancelled", onUpdateCancelled);
      updater.removeListener("error", onError);
    };
  }

  private async check(userInitiated: boolean): Promise<AppUpdateState> {
    if (!this.canCheckForUpdate) {
      this.setState({ status: "unsupported", userInitiated });
      return this.state;
    }

    if (this.checkPromise) {
      this.activeCheckUserInitiated ||= userInitiated;
      if (userInitiated) this.setState({ userInitiated: true });
      return this.checkPromise;
    }

    this.activeCheckUserInitiated = userInitiated;
    this.setState({ status: "checking", progress: null, error: null, userInitiated });

    const checkPromise = (
      this.canAutomaticUpdate ? this.checkWithElectronUpdater() : this.checkMacManifest()
    )
      .catch((error: unknown) => {
        this.setState({
          status: "error",
          progress: null,
          error: toErrorMessage(error),
          userInitiated: this.activeCheckUserInitiated,
        });
        return this.state;
      })
      .finally(() => {
        this.checkPromise = null;
        this.activeCheckUserInitiated = false;
      });

    this.checkPromise = checkPromise;
    return checkPromise;
  }

  private async checkWithElectronUpdater(): Promise<AppUpdateState> {
    const result = await autoUpdater.checkForUpdates();

    // The event normally sets the state first. Keep this fallback for
    // providers/test doubles that resolve without emitting an event.
    if (this.state.status === "checking") {
      if (result?.isUpdateAvailable) {
        this.setAvailable(result.updateInfo, this.activeCheckUserInitiated);
      } else {
        this.setNotAvailable(this.activeCheckUserInitiated);
      }
    }

    return this.state;
  }

  private async checkMacManifest(): Promise<AppUpdateState> {
    const response = await fetch(GITHUB_LATEST_MAC_MANIFEST_URL, {
      headers: {
        Accept: "text/yaml, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": `Traceability/${app.getVersion()}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub Release manifest 请求失败（HTTP ${response.status}）。`);
    }

    const release = parseMacUpdateManifest(
      await response.text(),
      process.arch === "arm64" ? "arm64" : "x64",
    );
    if (!release) {
      this.setNotAvailable(this.activeCheckUserInitiated);
      return this.state;
    }

    const currentVersion = normalizeVersion(app.getVersion());
    if (!currentVersion || !gt(release.version, currentVersion)) {
      this.setNotAvailable(this.activeCheckUserInitiated);
      return this.state;
    }

    this.macRelease = release;
    this.setState({
      status: "available",
      version: release.version,
      releaseName: release.name,
      releaseDate: release.releaseDate,
      releaseNotes: release.releaseNotes,
      releaseUrl: release.releaseUrl,
      progress: null,
      error: null,
      userInitiated: this.activeCheckUserInitiated,
    });
    return this.state;
  }

  private async downloadMacUpdate(): Promise<void> {
    const release = this.macRelease;
    if (!release) {
      this.setState({
        status: "error",
        progress: null,
        error: "没有可下载的 macOS 更新。请重新检查更新。",
        userInitiated: true,
      });
      return;
    }

    const architecture = process.arch === "arm64" ? "arm64" : "x64";
    const asset = release.assets.find((candidate) =>
      candidate.name.endsWith(`-${architecture}.zip`),
    );
    if (!asset) {
      this.setState({
        status: "error",
        progress: null,
        error: `GitHub Release 中没有当前架构的 macOS ZIP（${architecture}）。`,
        userInitiated: true,
      });
      return;
    }

    const stagingDirectory = join(app.getPath("temp"), `traceability-update-${randomUUID()}`);
    const archivePath = join(stagingDirectory, asset.name);
    this.setState({
      status: "downloading",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      error: null,
      userInitiated: true,
    });

    try {
      await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
      await downloadFile(
        asset.browserDownloadUrl,
        archivePath,
        (progress) => {
          this.setState({
            status: "downloading",
            progress,
            error: null,
            userInitiated: true,
          });
        },
        asset.sha512,
      );
      this.downloadedMacUpdate = { archivePath, stagingDirectory };
      this.setState({
        status: "downloaded",
        progress: null,
        error: null,
        userInitiated: true,
      });
    } catch (error: unknown) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
      this.setState({
        status: "error",
        progress: null,
        error: toErrorMessage(error),
        userInitiated: true,
      });
    }
  }

  private async installMacUpdate(): Promise<void> {
    const downloadedUpdate = this.downloadedMacUpdate;
    if (!downloadedUpdate) throw new Error("更新尚未下载完成。");

    const currentAppPath = dirname(dirname(dirname(app.getAppPath())));
    if (currentAppPath.startsWith("/Volumes/")) {
      throw new Error("请先将 Traceability.app 拖入“应用程序”文件夹后再安装更新。");
    }

    const scriptPath = join(downloadedUpdate.stagingDirectory, "install-update.sh");
    await writeFile(
      scriptPath,
      buildMacInstallScript({
        archivePath: downloadedUpdate.archivePath,
        stagingDirectory: downloadedUpdate.stagingDirectory,
        currentAppPath,
        processId: process.pid,
      }),
      { mode: 0o700 },
    );

    const installer = spawn("/bin/sh", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    installer.unref();
    app.quit();
  }

  private setAvailable(
    info: UpdateInfo,
    userInitiated: boolean,
    status: "available" | "downloaded" = "available",
  ): void {
    this.setState({
      status,
      version: info.version,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate ?? null,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      progress: null,
      error: null,
      userInitiated,
    });
  }

  private setNotAvailable(userInitiated: boolean): void {
    this.macRelease = null;
    this.setState({
      status: "not-available",
      version: null,
      releaseName: null,
      releaseDate: null,
      releaseNotes: null,
      releaseUrl: APP_RELEASE_URL,
      progress: null,
      error: null,
      userInitiated,
    });
  }

  private setState(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch, currentVersion: app.getVersion() };
    this.publishState();
  }

  private publishState(): void {
    const browserWindow = this.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      return;
    }

    browserWindow.webContents.send("update_state_changed", this.state);
  }
}

function createInitialState(): AppUpdateState {
  const supported = app.isPackaged && UPDATE_PLATFORMS.has(process.platform);
  return {
    status: supported ? "idle" : "unsupported",
    currentVersion: app.getVersion(),
    version: null,
    releaseName: null,
    releaseDate: null,
    releaseNotes: null,
    releaseUrl: APP_RELEASE_URL,
    progress: null,
    error: null,
    userInitiated: false,
  };
}

function parseMacUpdateManifest(
  payload: string,
  architecture: "arm64" | "x64",
): MacUpdateRelease | null {
  const version = normalizeVersion(readManifestValue(payload, "version"));
  if (!version) throw new Error("GitHub Release manifest 中没有有效版本号。");

  const manifestAssets = [
    ...payload.matchAll(/^[ \t]*- url:[ \t]*([^\r\n]+)\r?\n[ \t]+sha512:[ \t]*([^\r\n]+)/gm),
  ]
    .map((match) => {
      const name = parseManifestScalar(match[1] ?? "");
      const sha512 = parseManifestScalar(match[2] ?? "");
      return /^[A-Za-z0-9._-]+\.zip$/.test(name) && isSha512Digest(sha512)
        ? { name, sha512 }
        : null;
    })
    .filter((asset): asset is Omit<MacUpdateAsset, "browserDownloadUrl"> => asset !== null);

  const assets: MacUpdateAsset[] = manifestAssets.map((asset) => ({
    ...asset,
    browserDownloadUrl: buildGithubReleaseDownloadUrl(version, asset.name),
  }));

  if (!assets.some((asset) => asset.name.endsWith(`-${architecture}.zip`))) return null;

  const releaseDateValue = readManifestValue(payload, "releaseDate");

  return {
    version,
    name: `Traceability v${version}`,
    releaseDate: releaseDateValue ? parseManifestScalar(releaseDateValue) : null,
    releaseNotes: null,
    releaseUrl: `https://github.com/edisonLzy/traceability/releases/tag/v${version}`,
    assets,
  };
}

function readManifestValue(payload: string, key: string): string {
  return payload.match(new RegExp(`^[ \\t]*${key}:[ \\t]*([^\\r\\n]+)`, "m"))?.[1] ?? "";
}

function parseManifestScalar(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isSha512Digest(value: string): boolean {
  return /^[A-Za-z0-9+/]{86}==$/.test(value);
}

function buildGithubReleaseDownloadUrl(version: string, assetName: string): string {
  return `https://github.com/edisonLzy/traceability/releases/download/v${encodeURIComponent(version)}/${encodeURIComponent(assetName)}`;
}

function normalizeVersion(value: unknown): string | null {
  return typeof value === "string" ? clean(value) : null;
}

async function downloadFile(
  url: string,
  destinationPath: string,
  onProgress: (progress: UpdateDownloadProgress) => void,
  expectedSha512: string | null = null,
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": `Traceability/${app.getVersion()}`,
    },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`下载更新失败（HTTP ${response.status}）。`);
  }

  const total = Number(response.headers.get("content-length") ?? 0) || 0;
  const file = await open(destinationPath, "w", 0o600);
  const startedAt = Date.now();
  let transferred = 0;
  const hash = expectedSha512 ? createHash("sha512") : null;

  try {
    const reader = response.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const data = Buffer.from(chunk.value);
      await file.write(data);
      hash?.update(data);
      transferred += data.byteLength;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1_000, 0.001);
      onProgress({
        percent: total > 0 ? Math.min((transferred / total) * 100, 100) : 0,
        transferred,
        total,
        bytesPerSecond: transferred / elapsedSeconds,
      });
    }

    if (hash && hash.digest("base64") !== expectedSha512) {
      throw new Error("更新文件完整性校验失败，请重新检查并下载。");
    }
  } finally {
    await file.close();
  }
}

function buildMacInstallScript(options: {
  archivePath: string;
  stagingDirectory: string;
  currentAppPath: string;
  processId: number;
}): string {
  const archivePath = shellQuote(options.archivePath);
  const stagingDirectory = shellQuote(options.stagingDirectory);
  const currentAppPath = shellQuote(options.currentAppPath);
  const backupPath = shellQuote(`${options.currentAppPath}.traceability-backup`);
  const scriptPath = shellQuote(join(options.stagingDirectory, "install-update.sh"));

  return `#!/bin/sh
set -eu

ARCHIVE=${archivePath}
STAGING=${stagingDirectory}
APP_PATH=${currentAppPath}
BACKUP_PATH=${backupPath}
SCRIPT_PATH=${scriptPath}
APP_PID=${options.processId}

tries=0
while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 1
  tries=$((tries + 1))
  if [ "$tries" -ge 120 ]; then exit 1; fi
done

/usr/bin/ditto -x -k "$ARCHIVE" "$STAGING"
NEW_APP=$(/usr/bin/find "$STAGING" -maxdepth 3 -type d -name '*.app' -print -quit)
if [ -z "$NEW_APP" ]; then exit 1; fi

/bin/rm -rf "$BACKUP_PATH"
/bin/mv "$APP_PATH" "$BACKUP_PATH"
if ! /usr/bin/ditto "$NEW_APP" "$APP_PATH"; then
  /bin/rm -rf "$APP_PATH"
  /bin/mv "$BACKUP_PATH" "$APP_PATH"
  exit 1
fi

/bin/rm -rf "$BACKUP_PATH"
/usr/bin/open "$APP_PATH"
/bin/rm -f "$SCRIPT_PATH"
/bin/rm -rf "$STAGING"
`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatReleaseNotes(notes: unknown): string | null {
  if (typeof notes === "string") return notes;
  if (!Array.isArray(notes)) return null;

  const formatted = notes
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object" || !("note" in entry)) return "";
      return typeof entry.note === "string" ? entry.note : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return formatted || null;
}

function normalizeProgress(progress: UpdateDownloadProgress): UpdateDownloadProgress {
  return {
    percent: Math.max(0, Math.min(100, progress.percent)),
    transferred: Math.max(0, progress.transferred),
    total: Math.max(0, progress.total),
    bytesPerSecond: Math.max(0, progress.bytesPerSecond),
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
