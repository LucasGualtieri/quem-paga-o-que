import { shares as calcShares, ledger, type Cents, type Expense, type ExpenseMode, type JoinOrder, type MemberId, type Payment, type SplitMode, type Weights } from '@qpq/calc';
import type { EntryIcon, ErrorReason, PixKey, ProofInfo, ProofVisibility } from '@qpq/shared';

/** Participante como está no Firestore (splits/{id}.members). */
export interface MemberDoc {
  name: string;
  nameKey: string;
  uid: string | null;
  admin: boolean;
  joinOrder: number;
  isNew: boolean;
  /** Chave Pix de quem está ligado ao nome (só quem está no split lê). */
  pix?: PixKey | null;
  /** Foto de perfil de quem está ligado ao nome (caminho no Storage). */
  photo?: string | null;
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
  /** Quem vê comprovantes (decisão 9); ausente = "all". */
  proofVisibility?: ProofVisibility;
  /** Capa com foto (caminho no Storage); sem ela, o ícone ou emoji. */
  photo?: string | null;
  /** Capa com ícone ou emoji; sem ela, o `emoji` dos splits antigos ou o ícone de pessoas. */
  icon?: EntryIcon | null;
  /** Quando foi finalizado (spec 04). */
  doneAt?: Date | null;
}

export type Member = MemberDoc & { id: MemberId };

export interface Money {
  expenses: readonly Expense[];
  payments: readonly Payment[];
}

/** Pode ver a foto do comprovante entre `from` e `to` (as regras do Storage decidem igual). */
export function canSeeProof(split: SplitDoc, me: Member, from: MemberId, to: MemberId): boolean {
  return (split.proofVisibility ?? 'all') === 'all' || me.admin || me.id === from || me.id === to;
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

/** Ordem de entrada de cada participante; decide os centavos que sobram. */
export function orderOf(split: SplitDoc): JoinOrder {
  return Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
}

/** Parte de cada um numa despesa. */
export function sharesOf(e: ExpenseDoc, split: SplitDoc): Record<MemberId, Cents> {
  return calcShares(e, orderOf(split));
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
  return null;
}

export function promoteBlock(split: SplitDoc, memberId: MemberId, admin: boolean): Block | null {
  const m = split.members[memberId];
  if (admin && !m?.uid) return { reason: 'not-joined' };
  return null;
}

/**
 * Último admin saindo ou deixando de ser admin (decisão 4, revista): quem herda o papel. `null` =
 * não há o que passar (outro admin continua). `{ heir: null }` = ninguém para herdar ainda; o
 * próximo que entrar vira admin. Repete a regra do servidor (functions/src/common.ts, passAdmin).
 */
export function adminHandover(split: SplitDoc, memberId: MemberId): { heir: Member | null } | null {
  if (!split.members[memberId]?.admin || linkedAdminsExcept(split, memberId) > 0) return null;
  const heir = membersInOrder(split).find((m) => m.id !== memberId && m.uid) ?? null;
  return { heir };
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

/** Despesa como está no Firestore (splits/{id}/expenses/{id}); o saldo sai dela e dos acertos. */
export interface ExpenseDoc {
  id: string;
  name: string;
  amount: number;
  payer: MemberId;
  members: MemberId[];
  mode: ExpenseMode;
  w?: Weights;
  items?: Array<{ name?: string; icon?: EntryIcon; amount: Cents; members: MemberId[]; mode?: SplitMode; w?: Weights }>;
  rest?: MemberId[];
  restMode?: SplitMode;
  restW?: Weights;
  date: string;
  tags: string[];
  note: string;
  longDesc: string;
  author: MemberId;
  version: number;
  updatedBy: MemberId;
  /** Ícone ou emoji escolhido; `null`/ausente = automático pela tag. */
  icon?: EntryIcon | null;
  /** Exclusão marcada (decisão 7): some das listas e do saldo; Desfazer limpa. */
  deletedAt: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  /** Centavos pagos de cada parte (decisão 2). */
  paid: Record<MemberId, Cents>;
  /** Quando cada parte foi paga (ms); some com Desfazer e "Não recebi". */
  paidAt?: Record<MemberId, number>;
  /** Pagamento marcado que quem recebeu ainda não confirmou. */
  pendConf: Record<MemberId, boolean>;
  /** Comprovante de cada parte paga; `path: null` = expirou (decisão 9). */
  proof: Record<MemberId, ProofInfo>;
  /** Comprovante (foto) da despesa. */
  receipt: ProofInfo | null;
  /** Sobe a cada mudança de pagamento (não é edição: `version` fica). */
  paySeq: number;
}

/** Acerto registrado pelo Saldo (splits/{id}/payments/{id}). */
export interface PaymentDoc {
  id: string;
  from: MemberId;
  to: MemberId;
  amount: Cents;
  by: MemberId;
  when: Date | null;
  proof: ProofInfo | null;
  /** Registrado por quem pagou: espera quem recebe confirmar (ou "Não recebi"). */
  pendConf?: boolean;
}

/** Despesas que contam (as excluídas ficam de fora). */
export function activeExpenses(expenses: readonly ExpenseDoc[]): ExpenseDoc[] {
  return expenses.filter((e) => !e.deletedAt);
}
