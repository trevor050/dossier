interface ImportMetaEnv {
  readonly VITE_TRACKER_ENDPOINT?: string;
  readonly VITE_TRACKER_PERSIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
