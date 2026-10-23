/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" liga as telas de desenvolvimento (Folha de estilo, Paleta) no build. */
  readonly VITE_DEV_TOOLS?: string;
}

interface ImportMetaEnv {
  /** "true" usa os emuladores do Firebase (dev e e2e). */
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
