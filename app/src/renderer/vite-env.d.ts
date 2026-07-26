/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_MANAGEMENT_TOKEN?: string;
}

declare module "*.lottie" {
  const source: string;
  export default source;
}
