import { dueShares, effectiveAmount, shares as calcShares, ledger, type Cents, type Installments, type Expense, type ExpenseMode, type JoinOrder, type MemberId, type Payment, type SplitMode, type Weights } from '@qpq/calc';
import { AUTO_FINALIZE_DAYS, brasiliaDay, DEFAULT_CURRENCY, FINALIZE_SUGGEST_HOURS, finalizeClockStart, type Currency, type EntryIcon, type ErrorReason, type PayMode, type PixKey, type ProofInfo, type ProofVisibility } from '@qpq/shared';

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
  /** Como registrar pagamentos (spec 06); ausente = simplificado. */
  payMode?: PayMode;
  /** Pedidos de chave Pix: `pixAsks[quem não tem chave][quem pediu]` ("asked" ou "told"). */
  pixAsks?: Record<MemberId, Record<MemberId, 'asked' | 'told'>>;
  /** Capa com foto (caminho no Storage); sem ela, o ícone ou emoji. */
  photo?: string | null;
  /** Capa com ícone ou emoji; sem ela, o `emoji` dos splits antigos ou o ícone de pessoas. */
  icon?: EntryIcon | null;
  /** Quando foi finalizado (spec 04). */
  doneAt?: Date | null;
  /** Última mudança no dinheiro (despesa, parte paga, acerto): base da finalização automática. */
  moneyAt?: Date | null;
  /** Finalizado sozinho (todos quitados há AUTO_FINALIZE_DAYS dias). */
  autoFinalized?: boolean;
  /** "Termina em" (AAAA-MM-DD): antes do fim deste dia, o split não finaliza sozinho. */
  endsOn?: string | null;
  /** Moeda do split; ausente = BRL. */
  currency?: Currency;
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

/** Parte de cada um numa despesa (inteira, mesmo parcelada). */
export function sharesOf(e: ExpenseDoc, split: SplitDoc): Record<MemberId, Cents> {
  return calcShares(e, orderOf(split));
}

/** Hoje em Brasília: o dia em que as parcelas vencem (o servidor usa o mesmo). */
export function today(): string {
  return brasiliaDay(Date.now());
}

/** A parte que já conta no saldo: parcelada, só as parcelas vencidas ou antecipadas. */
export function dueSharesOf(e: ExpenseDoc, split: SplitDoc): Record<MemberId, Cents> {
  return dueShares(e, orderOf(split), today());
}

/** Uma parte da despesa por itens (um item ou o resto da compra) e quanto fica para cada um. */
export interface ItemPart {
  amount: Cents;
  mode: SplitMode;
  w?: Weights;
  /** Na ordem de entrada no split, só quem participa. */
  parts: Array<{ id: MemberId; cents: Cents }>;
}

function splitPart(amount: Cents, members: readonly MemberId[], mode: SplitMode, w: Weights | undefined, split: SplitDoc): ItemPart {
  const out = calcShares({ amount, members: [...members], mode, ...(w ? { w } : {}) }, orderOf(split));
  return { amount, mode, ...(w ? { w } : {}), parts: Object.entries(out).map(([id, cents]) => ({ id, cents })) };
}

/**
 * Detalhe da despesa por itens: como cada item foi dividido e quanto sobrou para o "resto da
 * compra" (total menos itens), com a divisão dele. Sempre pelo motor compartilhado.
 */
export function itemsBreakdown(e: ExpenseDoc, split: SplitDoc): { items: ItemPart[]; rest: (ItemPart & { members: MemberId[] }) | null } {
  const items = (e.items ?? []).map((it) => splitPart(it.amount, it.members, it.mode ?? 'equal', it.w, split));
  const restAmount = effectiveAmount(e) - (e.items ?? []).reduce((sum, it) => sum + it.amount, 0);
  const restMembers = e.rest ?? [];
  const rest = restAmount > 0 && restMembers.length ? { ...splitPart(restAmount, restMembers, e.restMode ?? 'equal', e.restW, split), members: restMembers } : null;
  return { items, rest };
}

export function myMember(split: SplitDoc, uid: string): Member | null {
  return membersInOrder(split).find((m) => m.uid === uid) ?? null;
}

/** Saldo de cada participante, sempre pelo motor compartilhado. */
export function balances(split: SplitDoc, money: Money): Record<MemberId, Cents> {
  const order: JoinOrder = Object.fromEntries(Object.entries(split.members).map(([id, m]) => [id, m.joinOrder]));
  return ledger({ order, expenses: money.expenses, payments: money.payments, today: today() }).net;
}

/**
 * Quando o split finaliza sozinho, se nada mudar: com todos quitados, AUTO_FINALIZE_DAYS dias
 * depois da última mudança no dinheiro (ou do fim de "Termina em", se for depois). `null`: aberto
 * sem despesa ou com alguém devendo.
 */
export function autoFinalizeAt(split: SplitDoc, money: { expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }): { since: Date; at: Date } | null {
  if (split.status !== 'open' || !split.moneyAt || money.expenses.length === 0) return null;
  if (Object.values(balances(split, money)).some((v) => v !== 0)) return null;
  if (hasFuture(split, money)) return null;
  const since = finalizeClockStart(split.moneyAt.getTime(), split.endsOn);
  return { since: new Date(since), at: new Date(since + AUTO_FINALIZE_DAYS * 24 * 3600_000) };
}

/**
 * Sugestão "Todo mundo quitou. Finalizar?" para os admins (spec 04): split aberto, com despesa,
 * todos com saldo zero há FINALIZE_SUGGEST_HOURS horas (contadas do fim de "Termina em", se for
 * depois). `pending`: ainda há pagamento esperando confirmação. `autoAt`: quando ele finaliza
 * sozinho se nada mudar.
 */
export function finalizeSuggestion(split: SplitDoc, money: { expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }, now: number): { pending: boolean; autoAt: Date } | null {
  const auto = autoFinalizeAt(split, money);
  if (!auto) return null;
  const since = auto.since.getTime();
  if (now - since < FINALIZE_SUGGEST_HOURS * 3600_000) return null;
  const pending = money.expenses.some((e) => Object.entries(e.pendConf).some(([id, v]) => v && (e.paid[id] ?? 0) > 0)) || money.payments.some((p) => !!p.pendConf);
  return { pending, autoAt: auto.at };
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
  /** Parcelada (spec 05): cada parcela só entra no saldo quando vence. */
  installments?: Installments | null;
  /** Quantas parcelas cada pessoa antecipou. */
  advanced?: Record<MemberId, number>;
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
  /** Parte paga num acerto do modo detalhado: o id do acerto (spec 06). */
  via?: Record<MemberId, string>;
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
  /** Acerto do modo detalhado: marcou as partes (`covers`), então não conta de novo no saldo. */
  viaShares?: boolean;
  covers?: Array<{ e: string; m: MemberId; prev?: Cents; prevAt?: number; prevVia?: string }>;
  /** Acerto antigo incorporado por um acerto do modo detalhado. */
  absorbedBy?: string;
}

export function payModeOf(split: Pick<SplitDoc, 'payMode'>): PayMode {
  return split.payMode ?? 'simple';
}

/** Despesas que contam (as excluídas ficam de fora). */
export function activeExpenses(expenses: readonly ExpenseDoc[]): ExpenseDoc[] {
  return expenses.filter((e) => !e.deletedAt);
}

/** Moeda do split (spec 09); os splits antigos ficam em BRL. */
export function currencyOf(split: Pick<SplitDoc, 'currency'>): Currency {
  return split.currency ?? DEFAULT_CURRENCY;
}

/** Ainda há parcela a vencer em alguma despesa: o split não conta como quitado (spec 05). */
export function hasFuture(split: SplitDoc, money: { expenses: readonly ExpenseDoc[]; payments: readonly PaymentDoc[] }): boolean {
  const { F } = ledger({ order: orderOf(split), expenses: money.expenses, payments: money.payments, today: today() });
  return Object.values(F).some((row) => Object.values(row).some((v) => v > 0));
}
