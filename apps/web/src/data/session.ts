import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { firebase } from '../firebase.ts';

// Convidado = login anônimo do Firebase; a identidade fica no aparelho (spec 03).
type Session = { status: 'loading' } | { status: 'ready'; uid: string; isAnonymous: boolean } | { status: 'error' };

let session: Session = { status: 'loading' };
let started = false;
const listeners = new Set<() => void>();

function set(next: Session) {
  session = next;
  for (const l of listeners) l();
}

function start() {
  if (started) return;
  started = true;
  const { auth } = firebase();
  onAuthStateChanged(auth, (user) => {
    if (user) set({ status: 'ready', uid: user.uid, isAnonymous: user.isAnonymous });
    else signInAnonymously(auth).catch(() => set({ status: 'error' }));
  });
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
