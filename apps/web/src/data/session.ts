import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { firebase } from '../firebase.ts';

// Convidado = login anônimo do Firebase; a identidade fica no aparelho (spec 03).
// Sem ninguém logado, o app mostra a tela de entrada (Google, e-mail ou sem conta).
export type Session =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'ready'; uid: string; isAnonymous: boolean; email: string | null; hasPassword: boolean };

let session: Session = { status: 'loading' };
let started = false;
const listeners = new Set<() => void>();

function set(next: Session) {
  session = next;
  for (const l of listeners) l();
}

function fromUser(user: User | null): Session {
  if (!user) return { status: 'signedOut' };
  return {
    status: 'ready',
    uid: user.uid,
    // Quem voltou pelo link de recuperação entra com token próprio: continua convidado.
    isAnonymous: user.isAnonymous || user.providerData.length === 0,
    email: user.email,
    hasPassword: user.providerData.some((p) => p.providerId === 'password'),
  };
}

function start() {
  if (started) return;
  started = true;
  onAuthStateChanged(firebase().auth, (user) => set(fromUser(user)));
}

/** Depois de vincular uma credencial o usuário muda sem disparar onAuthStateChanged. */
export function refreshSession(): void {
  set(fromUser(firebase().auth.currentUser));
}

export function useSession(): Session {
  start();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => session,
  );
}

/** "Continuar sem conta" (e quem chega por convite): vira convidado se ainda não há login. */
export async function continueAsGuest(): Promise<void> {
  const { auth } = firebase();
  if (!auth.currentUser) await signInAnonymously(auth);
}

export async function logout(): Promise<void> {
  await signOut(firebase().auth);
}
