import { initializeApp as adminInit, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { CreateSplitRequest, CreateSplitResponse, ErrorReason } from '@qpq/shared';

export const PROJECT = 'demo-qpq';
const HOST = '127.0.0.1';

let seq = 0;

export interface TestUser {
  uid: string;
  auth: Auth;
  db: Firestore;
  call: <Res = unknown>(name: string, data: unknown) => Promise<Res>;
}

function connect(name: string) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, 8080);
  const fns = getFunctions(app, 'us-east1');
  connectFunctionsEmulator(fns, HOST, 5001);
  const call = async <Res,>(fn: string, data: unknown) => (await httpsCallable<unknown, Res>(fns, fn)(data)).data;
  return { auth, db, call };
}

/** Um usuário anônimo novo (convidado), com o SDK do cliente apontado para os emuladores. */
export async function newUser(): Promise<TestUser> {
  const c = connect(`user-${seq++}`);
  const { user } = await signInAnonymously(c.auth);
  return { uid: user.uid, ...c };
}

/** Uma conta com e-mail e senha. */
export async function newAccount(email = `conta${seq}@exemplo.com`): Promise<TestUser> {
  const c = connect(`user-${seq++}`);
  const { user } = await createUserWithEmailAndPassword(c.auth, email, 'senha-123');
  return { uid: user.uid, ...c };
}

/** Um contexto sem login (outro aparelho, antes de entrar). */
export function newDevice(): Omit<TestUser, 'uid'> {
  return connect(`device-${seq++}`);
}

/** O `reason` de uma recusa da Function, ou null se deu certo. */
export async function reasonOf(p: Promise<unknown>): Promise<ErrorReason | string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { details?: { reason?: string }; code?: string };
    return err.details?.reason ?? err.code ?? String(e);
  }
}

export async function detailsOf(p: Promise<unknown>): Promise<Record<string, unknown> | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return ((e as { details?: Record<string, unknown> }).details ?? null);
  }
}

export async function clearFirestore(): Promise<void> {
  await fetch(`http://${HOST}:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

export async function clearAuth(): Promise<void> {
  await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Admin SDK (ignora regras) para preparar e conferir dados. */
export function admin() {
  return adminFirestore(adminApps()[0] ?? adminInit({ projectId: PROJECT }));
}

export async function createSplit(user: TestUser, req: Partial<CreateSplitRequest> = {}) {
  return user.call<CreateSplitResponse>('createSplit', {
    name: 'Ano Novo',
    emoji: '🎆',
    selfName: 'Lucas',
    people: ['Beatriz', 'Catarina'],
    ...req,
  });
}

export interface StoredMember {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  isNew: boolean;
}

export async function splitDoc(splitId: string) {
  const snap = await admin().doc(`splits/${splitId}`).get();
  return snap.data() as {
    name: string;
    emoji: string;
    code: string;
    status: string;
    createdBy: string;
    members: Record<string, StoredMember>;
    uids: string[];
    adminUids: string[];
    nextJoinOrder: number;
  };
}

export async function memberIdByName(splitId: string, name: string): Promise<string> {
  const { members } = await splitDoc(splitId);
  const hit = Object.entries(members).find(([, m]) => m.name === name);
  if (!hit) throw new Error(`sem ${name}`);
  return hit[0];
}
