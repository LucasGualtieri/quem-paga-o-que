import { randomBytes, createHash } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ledger, type Expense, type JoinOrder, type Ledger, type Payment } from '@qpq/calc';
import { HttpsError, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import type { ErrorDetails, ErrorReason, PixKey } from '@qpq/shared';

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

/** Bucket padrão do projeto (comprovantes, capas e fotos de perfil). */
export function bucket() {
  return getStorage(app()).bucket();
}

export interface Member {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  joinedAt: unknown;
  isNew: boolean;
  /** Chave Pix de quem está ligado ao nome (espelho do perfil; só quem está no split lê). */
  pix?: PixKey | null;
  /** Foto de perfil (caminho no Storage; espelho do perfil, como a chave Pix). */
  photo?: string | null;
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
  /** Quem vê comprovantes (decisão 9); ausente = "all". */
  proofVisibility?: 'all' | 'involved';
  /** Capa com foto (caminho no Storage). */
  photo?: string | null;
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
    // Sem ninguém ligado: conta os dias até apagar o split sozinho (EMPTY_SPLIT_DAYS).
    emptySince: linked.length ? null : FieldValue.serverTimestamp(),
  };
}

export function memberOf(split: SplitData, uid: string): [string, Member] | null {
  return Object.entries(split.members).find(([, m]) => m.uid === uid) ?? null;
}

/**
 * Último admin saindo ou deixando de ser admin (decisão 4, revista em 24/10/2026): o papel passa
 * para quem tem a menor ordem de entrada entre os que já escolheram o nome. Sem ninguém, o split
 * fica sem admin até a próxima pessoa entrar (ver `joinSplit`).
 */
export function passAdmin(members: Record<string, Member>, leavingId: string): Record<string, Member> {
  const others = Object.entries(members).filter(([id, m]) => id !== leavingId && m.uid);
  if (others.some(([, m]) => m.admin)) return members;
  const heir = others.sort(([, a], [, b]) => a.joinOrder - b.joinOrder)[0];
  return heir ? { ...members, [heir[0]]: { ...heir[1], admin: true } } : members;
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

/** Despesas (sem as excluídas) e acertos do split, lidos dentro da transação. */
export async function readMoney(tx: Transaction, ref: DocumentReference) {
  const [expenses, payments] = await Promise.all([tx.get(ref.collection('expenses')), tx.get(ref.collection('payments'))]);
  return {
    // Despesas excluídas (exclusão marcada, decisão 7) não entram em saldo nenhum.
    expenses: expenses.docs.filter((d) => !d.get('deletedAt')).map((d) => d.data() as Expense),
    payments: payments.docs.map((d) => d.data() as Payment),
  };
}

export function orderOf(split: SplitData): JoinOrder {
  return Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
}

/** Saldos do split, sempre pelo motor compartilhado (@qpq/calc). */
export function ledgerOf(split: SplitData, money: { expenses: Expense[]; payments: Payment[] }): Ledger {
  return ledger({ order: orderOf(split), ...money });
}

export function requireOpen(split: SplitData): void {
  if (split.status !== 'open') fail('split-done');
}

/** Chave Pix e foto do perfil, para espelhar no participante ao entrar num split. */
export async function profileOf(tx: Transaction, uid: string): Promise<{ pix: PixKey | null; photo: string | null }> {
  const d = await tx.get(db().doc(`users/${uid}`));
  return { pix: (d.get('pix') as PixKey | undefined) ?? null, photo: (d.get('photoPath') as string | undefined) ?? null };
}

/** O que sai do participante quando o nome fica sem ninguém (sair, liberar, fusão). */
export const UNLINKED = { uid: null, admin: false, joinedAt: null, pix: null, photo: null } as const;

export type { DocumentReference, Transaction };
