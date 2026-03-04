/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PISTON_API_URL: string;
  readonly VITE_JUDGE0_API_URL?: string;
  readonly VITE_JUDGE0_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
