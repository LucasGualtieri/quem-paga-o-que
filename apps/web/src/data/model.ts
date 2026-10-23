import { ledger, type Cents, type Expense, type JoinOrder, type MemberId, type Payment } from '@qpq/calc';
import type { ErrorReason } from '@qpq/shared';

/** Participante como está no Firestore (splits/{id}.members). */
export interface MemberDoc {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  isNew: boolean;
}

export interface SplitDoc {
  id: string;
  name: string;
  emoji: string;
  status: 'open' | 'done';
  code: string;
  createdBy: string;
  members: Record<MemberId, MemberDoc>;
  uids: string[];
  adminUids: string[];
}

export type Member = MemberDoc & { id: MemberId };

export interface Money {
  expenses: readonly Expense[];
  payments: readonly Payment[];
}

export interface Block {
  reason: ErrorReason;
  amount?: Cents;
}

export function membersInOrder(split: SplitDoc): Member[] {
  return Object.entries(split.members)
    .map(([id, m]) => ({ ...m, id }))
    .sort((a, b) => a.joinOrder - b.joinOrder);
}

export function myMember(split: SplitDoc, uid: string): Member | null {
  return membersInOrder(split).find((m) => m.uid === uid) ?? null;
}

/** Saldo de cada participante, sempre pelo motor compartilhado. */
export function balances(split: SplitDoc, money: Money): Record<MemberId, Cents> {
  const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
  return ledger({ order, expenses: money.expenses, payments: money.payments }).net;
}

function linkedAdminsExcept(split: SplitDoc, memberId: MemberId): number {
  return membersInOrder(split).filter((m) => m.id !== memberId && m.admin && m.uid).length;
}

function appearsIn(expenses: readonly Expense[], id: MemberId): boolean {
  return expenses.some(
    (e) => e.payer === id || e.members.includes(id) || (e.rest ?? []).includes(id) || (e.items ?? []).some((it) => it.members.includes(id)),
  );
}

// Os bloqueios abaixo repetem os do servidor (functions/src/splits.ts) para a
// tela avisar na hora; quem decide continua sendo o servidor.

export function removeBlock(split: SplitDoc, money: Money, memberId: MemberId): Block | null {
  const net = balances(split, money)[memberId] ?? 0;
  if (net !== 0) return { reason: 'balance-not-zero', amount: net };
  if (appearsIn(money.expenses, memberId)) return { reason: 'in-expenses' };
  return null;
}

export function leaveBlock(split: SplitDoc, money: Money, memberId: MemberId): Block | null {
  const net = balances(split, money)[memberId] ?? 0;
  if (net !== 0) return { reason: 'balance-not-zero', amount: net };
  if (split.members[memberId]?.admin && linkedAdminsExcept(split, memberId) === 0) return { reason: 'last-admin' };
  return null;
}

export function promoteBlock(split: SplitDoc, memberId: MemberId, admin: boolean): Block | null {
  const m = split.members[memberId];
  if (admin && !m?.uid) return { reason: 'not-joined' };
  if (!admin && linkedAdminsExcept(split, memberId) === 0) return { reason: 'last-admin' };
  return null;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** "fale com…": nenhum admin, 1 nome, 2–3 nomes com "ou", mais de 3 com "ou outro admin" (spec 04). */
export function adminContact(adminNames: readonly string[], t: T): string {
  if (adminNames.length === 0) return t('people.anAdmin');
  if (adminNames.length === 1) return adminNames[0]!;
  if (adminNames.length <= 3) return t('people.orList', { list: adminNames.slice(0, -1).join(', '), last: adminNames.at(-1) });
  return t('people.orOther', { list: adminNames.slice(0, 2).join(', ') });
}

/** Mudança otimista num participante: aparece na hora, antes do servidor responder. */
export interface MemberPatch {
  memberId: MemberId;
  change: Partial<MemberDoc> | 'removed';
}

export function applyPatches(split: SplitDoc, patches: readonly MemberPatch[]): SplitDoc {
  if (patches.length === 0) return split;
  const members = { ...split.members };
  for (const { memberId, change } of patches) {
    const current = members[memberId];
    if (!current) continue;
    if (change === 'removed') delete members[memberId];
    else members[memberId] = { ...current, ...change };
  }
  return { ...split, members };
}
