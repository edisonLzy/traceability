/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_TRACEABILITY_DSN: string;
  readonly MAIN_VITE_SERVER_URL?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
