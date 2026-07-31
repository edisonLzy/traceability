import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, safeStorage } from "electron";
import type { BrowserWindow } from "electron";

import type { AuthIPC, AuthTokens } from "../../shared/auth-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";

export class AuthSession extends AbstractAgentIPCHandler<AuthIPC> implements AuthIPC {
  private readonly filePath = join(app.getPath("userData"), "auth-session.bin");

  public constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = ["getAuthSession", "saveAuthSession", "clearAuthSession"] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) this.typedIpcMain.removeHandler(channel);
    };
  }

  public async getAuthSession(): Promise<AuthTokens | null> {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(this.filePath)) return null;
    try {
      return JSON.parse(safeStorage.decryptString(readFileSync(this.filePath))) as AuthTokens;
    } catch {
      this.clearAuthSession();
      return null;
    }
  }

  public async saveAuthSession(tokens: AuthTokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) return;
    writeFileSync(this.filePath, safeStorage.encryptString(JSON.stringify(tokens)), {
      mode: 0o600,
    });
  }

  public async clearAuthSession(): Promise<void> {
    rmSync(this.filePath, { force: true });
  }

  public destroyAll() {
    this.unbind?.();
  }
}
