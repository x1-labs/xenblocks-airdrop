/// <reference types="vite/client" />

import { Buffer } from 'buffer';

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

interface ImportMetaEnv {
  readonly VITE_RPC_ENDPOINT: string;
  readonly VITE_PROGRAM_ID: string;
  readonly VITE_EXPLORER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
