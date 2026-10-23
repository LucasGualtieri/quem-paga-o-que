import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import type { PreviewMergeResponse } from '@qpq/shared';
import { firebase } from '../firebase.ts';
import { api } from './api.ts';
import { refreshSession } from './session.ts';

/**
 * Resultado de entrar ou salvar a conta:
 * - `signedIn`: entrou numa conta (não havia convidado);
 * - `saved`: o convidado virou conta, mesmo UID, nada recriado (spec 03);
 * - `merged`: a conta já existia e os splits do convidado vieram junto (decisão 5);
 * - `choose`: idem, mas há split com os dois nomes; a pessoa escolhe qual manter.
 */
export type AuthOutcome =
  | { kind: 'signedIn' }
  | { kind: 'saved' }
  | { kind: 'merged' }
  | { kind: 'choose'; token: string; preview: PreviewMergeResponse };

/** Convidado: login anônimo ou volta pelo link de recuperação (sem credencial ligada). */
function isGuestUser(user: User): boolean {
  return user.isAnonymous || user.providerData.length === 0;
}

export function authCode(error: unknown): string {
  return error instanceof FirebaseError ? error.code : '';
}

/** Fusão em três passos: prova como convidado → entra na conta → junta (ou pede escolha). */
async function mergeInto(signIn: () => Promise<unknown>): Promise<AuthOutcome> {
  const { token } = await api.prepareMerge({});
  await signIn();
  const preview = await api.previewMerge({ token });
  if (preview.conflicts.length > 0) return { kind: 'choose', token, preview };
  await api.mergeGuest({ token, keep: {} });
  return { kind: 'merged' };
}

/** Depois de salvar a conta, o link de recuperação deixa de valer (decisão 6). */
function afterSave(): AuthOutcome {
  refreshSession();
  void api.revokeRecovery({}).catch(() => {});
  return { kind: 'saved' };
}

/** Google por popup (redirect falha fora do Firebase Hosting nos navegadores atuais). */
export async function withGoogle(): Promise<AuthOutcome> {
  const { auth } = firebase();
  const provider = new GoogleAuthProvider();
  const user = auth.currentUser;
  if (!user || !isGuestUser(user)) {
    await signInWithPopup(auth, provider);
    return { kind: 'signedIn' };
  }
  try {
    await linkWithPopup(user, provider);
    return afterSave();
  } catch (error) {
    const credential = authCode(error) === 'auth/credential-already-in-use' ? GoogleAuthProvider.credentialFromError(error as FirebaseError) : null;
    if (!credential) throw error;
    return mergeInto(() => signInWithCredential(auth, credential));
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthOutcome> {
  const { auth } = firebase();
  const user = auth.currentUser;
  if (user && isGuestUser(user)) {
    await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
    return afterSave();
  }
  await createUserWithEmailAndPassword(auth, email.trim(), password);
  return { kind: 'signedIn' };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  const { auth } = firebase();
  const signIn = () => signInWithEmailAndPassword(auth, email.trim(), password);
  if (auth.currentUser && isGuestUser(auth.currentUser)) return mergeInto(signIn);
  await signIn();
  return { kind: 'signedIn' };
}

export function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(firebase().auth, email.trim());
}
