import { FieldValue, type Query, type Transaction } from 'firebase-admin/firestore';
import type { NotificationData, NotificationKind, NotificationStatus } from '@qpq/shared';
import { db, type SplitData } from './common.ts';

/**
 * Notificações no app (spec 07). Criadas e atualizadas pelas Functions de pagamento, dentro da
 * mesma transação: o aviso existe se, e só se, o pagamento foi gravado.
 * Regra das transações: todas as leituras (`find`) antes de qualquer escrita.
 */

const col = () => db().collection('notifications');

export interface NoteInput {
  kind: NotificationKind;
  from: string;
  amount: number;
  hasProof?: boolean;
  expId?: string;
  expName?: string;
  memberId?: string;
  paymentId?: string;
  payFrom?: string;
  payTo?: string;
}

/** Cria o aviso para `toMember`, se a pessoa já entrou no split. */
export function notify(tx: Transaction, splitId: string, split: SplitData, toMember: string, n: NoteInput): void {
  const to = split.members[toMember]?.uid;
  if (!to) return;
  const data: NotificationData & { at: FieldValue } = {
    to,
    toMember,
    kind: n.kind,
    splitId,
    splitName: split.name,
    from: n.from,
    fromName: split.members[n.from]?.name ?? '',
    amount: n.amount,
    hasProof: n.hasProof ?? false,
    expId: n.expId ?? null,
    expName: n.expName ?? null,
    memberId: n.memberId ?? null,
    paymentId: n.paymentId ?? null,
    payFrom: n.payFrom ?? null,
    payTo: n.payTo ?? null,
    read: false,
    status: 'new',
    hidden: false,
    at: FieldValue.serverTimestamp(),
  };
  tx.create(col().doc(), data);
}

type Found = Array<{ ref: FirebaseFirestore.DocumentReference; data: NotificationData }>;

async function run(tx: Transaction, q: Query): Promise<Found> {
  const snap = await tx.get(q);
  return snap.docs.map((d) => ({ ref: d.ref, data: d.data() as NotificationData }));
}

/** Avisos de uma parte de despesa (de todos os tipos). */
export function findShare(tx: Transaction, splitId: string, expId: string, memberId: string): Promise<Found> {
  return run(tx, col().where('splitId', '==', splitId).where('expId', '==', expId).where('memberId', '==', memberId));
}

export function findExpense(tx: Transaction, splitId: string, expId: string): Promise<Found> {
  return run(tx, col().where('splitId', '==', splitId).where('expId', '==', expId));
}

export function findPayment(tx: Transaction, splitId: string, paymentId: string): Promise<Found> {
  return run(tx, col().where('splitId', '==', splitId).where('paymentId', '==', paymentId));
}

/** "Beatriz pagou" que quem recebeu confirmou, contestou ou resolveu com "Recebi". */
export function setStatus(tx: Transaction, found: Found, from: readonly NotificationStatus[], to: NotificationStatus): void {
  for (const n of found) if (n.data.kind === 'paid' && from.includes(n.data.status)) tx.update(n.ref, { status: to });
}

export function setHidden(tx: Transaction, found: Found, hidden: boolean, only?: (n: NotificationData) => boolean): void {
  for (const n of found) if (n.data.hidden !== hidden && (!only || only(n.data))) tx.update(n.ref, { hidden });
}

/**
 * Comprovante enviado: se a pessoa ainda tem o aviso do pagamento sem comprovante e sem ler,
 * ele ganha o comprovante; senão, vira um aviso novo "enviou comprovante".
 */
export function notifyProof(tx: Transaction, splitId: string, split: SplitData, found: Found, toMember: string, n: Omit<NoteInput, 'kind' | 'hasProof'>, pending: (d: NotificationData) => boolean): void {
  const open = found.find((f) => f.data.toMember === toMember && !f.data.hidden && !f.data.hasProof && pending(f.data));
  if (open) tx.update(open.ref, { hasProof: true });
  else notify(tx, splitId, split, toMember, { ...n, kind: 'proof', hasProof: true });
}

/** As pontas de um pagamento que não fizeram a ação (admin de fora avisa as duas). */
export function others(actor: string, a: string, b: string): string[] {
  return [a, b].filter((x) => x !== actor);
}
