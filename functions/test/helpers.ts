import { initializeApp as adminInit, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { getStorage as adminStorage } from 'firebase-admin/storage';
import type { CreateSplitRequest, CreateSplitResponse, ErrorReason } from '@qpq/shared';

export const PROJECT = 'demo-qpq';
export const BUCKET = 'demo-qpq.appspot.com';
const HOST = '127.0.0.1';

let seq = 0;

export interface TestUser {
  uid: string;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
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
  const storage = getStorage(app, BUCKET);
  connectStorageEmulator(storage, HOST, 9199);
  const call = async <Res,>(fn: string, data: unknown) => (await httpsCallable<unknown, Res>(fns, fn)(data)).data;
  return { auth, db, storage, call };
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

function adminApp() {
  return adminApps()[0] ?? adminInit({ projectId: PROJECT, storageBucket: BUCKET });
}

/** Admin SDK (ignora regras) para preparar e conferir dados. */
export function admin() {
  return adminFirestore(adminApp());
}

/** Bucket do emulador de Storage, pelo Admin SDK. */
export function bucket() {
  return adminStorage(adminApp()).bucket(BUCKET);
}

/** Uma "foto" pequena (JPEG falso) enviada pelo app da pessoa, sob as regras do Storage. */
export async function upload(user: Pick<TestUser, 'storage'>, path: string, contentType = 'image/jpeg', size = 64): Promise<string> {
  await uploadBytes(ref(user.storage, path), new Uint8Array(size).fill(7), { contentType });
  return path;
}

export async function exists(path: string): Promise<boolean> {
  return (await bucket().file(path).exists())[0];
}

export async function clearStorage(): Promise<void> {
  const [files] = await bucket().getFiles();
  await Promise.all(files.map((f) => f.delete().catch(() => {})));
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
    proofVisibility?: string;
    photo?: unknown;
  };
}

export async function memberIdByName(splitId: string, name: string): Promise<string> {
  const { members } = await splitDoc(splitId);
  const hit = Object.entries(members).find(([, m]) => m.name === name);
  if (!hit) throw new Error(`sem ${name}`);
  return hit[0];
}
