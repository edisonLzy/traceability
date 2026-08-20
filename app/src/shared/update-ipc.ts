export const APP_RELEASE_URL = "https://github.com/edisonLzy/traceability/releases";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "unsupported"
  | "error";

export interface UpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  version: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  /** Validated GitHub URL; never comes from renderer input. */
  releaseUrl: string;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  /** Whether the last transition came from an explicit user action. */
  userInitiated: boolean;
}

export interface AppUpdateIPC {
  getAppUpdateState: () => Promise<AppUpdateState>;
  checkForAppUpdate: () => Promise<AppUpdateState>;
  downloadAppUpdate: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<void>;
  openAppReleasePage: () => Promise<void>;
}
