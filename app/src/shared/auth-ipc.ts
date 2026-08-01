export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthIPC {
  getAuthSession: () => Promise<AuthTokens | null>;
  saveAuthSession: (tokens: AuthTokens) => Promise<void>;
  clearAuthSession: () => Promise<void>;
}
