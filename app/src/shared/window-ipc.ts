export interface WindowState {
  isFocused: boolean;
  isFullScreen: boolean;
  isMaximized: boolean;
}

export interface WindowIPC {
  closeWindow: () => Promise<void>;
  getWindowState: () => Promise<WindowState>;
  minimizeWindow: () => Promise<void>;
  toggleFullScreenWindow: () => Promise<WindowState>;
  toggleMaximizeWindow: () => Promise<WindowState>;
}
