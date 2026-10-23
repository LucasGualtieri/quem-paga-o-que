import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const env = import.meta.env;

/**
 * Emuladores: com VITE_USE_EMULATORS=true, ou no `vite dev` sem projeto configurado.
 * O app nunca fala com produção a partir do ambiente de desenvolvimento.
 */
export const usesEmulators = env.VITE_USE_EMULATORS === 'true' || (env.DEV && !env.VITE_FIREBASE_PROJECT_ID);

const config: FirebaseOptions | null = usesEmulators
  ? { projectId: 'demo-qpq', apiKey: 'demo-key', authDomain: 'demo-qpq.firebaseapp.com' }
  : env.VITE_FIREBASE_PROJECT_ID
    ? {
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        apiKey: env.VITE_FIREBASE_API_KEY ?? '',
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
        appId: env.VITE_FIREBASE_APP_ID ?? '',
      }
    : null;

/** Há um back-end (emuladores ou projeto) para as telas do produto. */
export const hasBackend = config !== null;

interface Services {
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: Services | null = null;

/** Firebase inicializado sob demanda (as telas de revisão e os testes de unidade não precisam dele). */
export function firebase(): Services {
  if (services) return services;
  if (!config) throw new Error('Firebase sem configuração');
  const app = initializeApp(config);
  const auth = getAuth(app);
  // Cache local: a escrita aparece na hora e sincroniza depois (UX otimista).
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const functions = getFunctions(app, 'us-east1');
  if (usesEmulators) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
  }
  services = { auth, db, functions };
  return services;
}
