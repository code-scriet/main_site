/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PLAYGROUND_URL?: string;
  /** Execute-server origin (codescriet-playground-api) hosting the /competition relay. */
  readonly VITE_PLAYGROUND_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
