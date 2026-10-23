import { randomBytes, createHash } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import type { ErrorDetails, ErrorReason } from '@qpq/shared';

export const REGION = 'us-east1';

let adminApp: App | undefined;

// Passa o app explicitamente: no pacote publicado o firebase-admin é carregado por
// ESM e CJS, que têm registros de app separados (o padrão do getFirestore() não acha o app).
function app(): App {
  adminApp ??= getApps()[0] ?? initializeApp();
  return adminApp;
}

let firestore: ReturnType<typeof getFirestore> | undefined;

export function db() {
  firestore ??= getFirestore(app());
  return firestore;
}

export function auth() {
  return getAuth(app());
}

export interface Member {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  joinedAt: unknown;
  isNew: boolean;
}

export interface SplitData {
  name: string;
  emoji: string;
  status: 'open' | 'done';
  code: string;
  createdBy: string;
  members: Record<string, Member>;
  uids: string[];
  adminUids: string[];
  nextJoinOrder: number;
}

const HTTP_CODE: Partial<Record<ErrorReason, FunctionsErrorCode>> = {
  'invalid-input': 'invalid-argument',
  'invalid-code': 'not-found',
  'not-member': 'permission-denied',
  'not-admin': 'permission-denied',
};

/** Recusa com um motivo que o app traduz (`details.reason`). */
export function fail(reason: ErrorReason, extra: Omit<ErrorDetails, 'reason'> = {}): never {
  const details: ErrorDetails = { reason, ...extra };
  throw new HttpsError(HTTP_CODE[reason] ?? 'failed-precondition', reason, details);
}

export function uidOf(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  return uid;
}

export function input(req: CallableRequest): Record<string, unknown> {
  return req.data && typeof req.data === 'object' ? (req.data as Record<string, unknown>) : fail('invalid-input');
}

export function text(v: unknown): string {
  return typeof v === 'string' ? v : fail('invalid-input');
}

export function newId(): string {
  return db().collection('_').doc().id;
}

/** `uids` e `adminUids` são espelhos de `members`, usados pelas regras. */
export function mirrors(members: Record<string, Member>) {
  const linked = Object.values(members)
    .filter((m) => m.uid)
    .sort((a, b) => a.joinOrder - b.joinOrder);
  return {
    members,
    uids: linked.map((m) => m.uid!),
    adminUids: linked.filter((m) => m.admin).map((m) => m.uid!),
  };
}

export function memberOf(split: SplitData, uid: string): [string, Member] | null {
  return Object.entries(split.members).find(([, m]) => m.uid === uid) ?? null;
}

/** Admins ligados a alguém, fora `exceptId`. "Sempre ao menos um admin" (decisão 4). */
export function otherLinkedAdmins(split: SplitData, exceptId: string): number {
  return Object.entries(split.members).filter(([id, m]) => id !== exceptId && m.admin && m.uid).length;
}

export async function loadSplit(tx: Transaction, splitId: unknown): Promise<{ ref: DocumentReference; split: SplitData }> {
  const id = text(splitId);
  if (!id || id.includes('/')) fail('invalid-input');
  const ref = db().doc(`splits/${id}`);
  const snap = await tx.get(ref);
  if (!snap.exists) fail('not-member');
  return { ref, split: snap.data() as SplitData };
}

export function requireMember(split: SplitData, uid: string): [string, Member] {
  return memberOf(split, uid) ?? fail('not-member');
}

export function requireAdmin(split: SplitData, uid: string): [string, Member] {
  const me = requireMember(split, uid);
  if (!me[1].admin) fail('not-admin');
  return me;
}

export function target(split: SplitData, memberId: unknown): Member {
  return split.members[text(memberId)] ?? fail('invalid-input');
}

// invoker público: o navegador chama direto; quem decide é a autenticação e as checagens de cada função.
export const opts = { region: REGION, maxInstances: 10, invoker: 'public' as const };


/**
 * Convidado (spec 03) = nenhuma credencial ligada (Google, e-mail…). Vale para o login
 * anônimo e para quem voltou pelo link de recuperação (token próprio, sem provedor).
 */
export function isGuest(req: CallableRequest): boolean {
  const firebase = req.auth?.token.firebase as { identities?: Record<string, unknown> } | undefined;
  return !!req.auth && Object.keys(firebase?.identities ?? {}).length === 0;
}

/** Token secreto e longo (base64url) e o hash que fica guardado no Firestore. */
export function secretToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type { DocumentReference, Transaction };
