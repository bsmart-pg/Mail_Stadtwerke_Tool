/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MSAL_CLIENT_ID: string;
  readonly VITE_MSAL_TENANT_ID: string;
  readonly [key: string]: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 