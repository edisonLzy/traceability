/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

declare module "*.lottie" {
  const source: string;
  export default source;
}
