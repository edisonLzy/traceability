/// <reference types="electron-vite/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    TRACEABILITY_SERVER_URL?: string;
    TRACEABILITY_MANAGEMENT_TOKEN?: string;
  }
}
