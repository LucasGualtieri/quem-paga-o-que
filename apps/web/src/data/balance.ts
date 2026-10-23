import { ledger, type Cents, type MemberId } from '@qpq/calc';
import { membersInOrder, orderOf, sharesOf, type ExpenseDoc, type PaymentDoc, type SplitDoc } from './model.ts';

/**
 * O que as abas Saldo e Minha visão mostram (spec 06), sempre calculado das despesas
 * (sem as excluídas) e dos acertos pelo @qpq/calc. Nada aqui é guardado.
 */

/** Linha de um cartão do Saldo: dívida real do par (`M`) ou acerto já registrado. */
export type CardLine =
  | { kind: 'owe'; from: MemberId; to: MemberId; other: MemberId; amount: Cents }
  | { kind: 'recv'; from: MemberId; to: MemberId; other: MemberId; amount: Cents }
  | { kind: 'done'; payment: PaymentDoc; other: MemberId; paidOut: boolean };

export interface PersonCard {
  id: MemberId;
  net: Cents;
  lines: CardLine[];
  /** Pessoas a quem deve / de quem recebe, e acertos resolvidos (resumo do cartão fechado). */
  owes: number;
  gets: number;
  done: number;
}

export interface BalanceView {
  /** Seu saldo neste split: positivo = a receber. */
  mine: Cents;
  /** Cartões: o seu primeiro; os outros pelo tamanho do saldo (empate pela ordem de entrada). */
  cards: PersonCard[];
}

function byTime(a: PaymentDoc, b: PaymentDoc): number {
  return (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity);
}

export function balanceView(split: SplitDoc, expenses: readonly ExpenseDoc[], payments: readonly PaymentDoc[], me: MemberId): BalanceView {
  const { M, net } = ledger({ order: orderOf(split), expenses, payments });
  const ids = membersInOrder(split).map((m) => m.id);
  const others = ids.filter((id) => id !== me).sort((a, b) => Math.abs(net[b] ?? 0) - Math.abs(net[a] ?? 0));
  const sortedPayments = [...payments].sort(byTime);
  const cards = (ids.includes(me) ? [me, ...others] : others).map((r): PersonCard => {
    const lines: CardLine[] = [];
    for (const o of ids) {
      if (o === r) continue;
      const owe = M[r]?.[o] ?? 0;
      const get = M[o]?.[r] ?? 0;
      if (owe > 0) lines.push({ kind: 'owe', from: r, to: o, other: o, amount: owe });
      if (get > 0) lines.push({ kind: 'recv', from: o, to: r, other: o, amount: get });
    }
    for (const p of sortedPayments) {
      if (p.from === r) lines.push({ kind: 'done', payment: p, other: p.to, paidOut: true });
      else if (p.to === r) lines.push({ kind: 'done', payment: p, other: p.from, paidOut: false });
    }
    return {
      id: r,
      net: net[r] ?? 0,
      lines,
      owes: lines.filter((l) => l.kind === 'owe').length,
      gets: lines.filter((l) => l.kind === 'recv').length,
      done: lines.filter((l) => l.kind === 'done').length,
    };
  });
  return { mine: net[me] ?? 0, cards };
}

/** Situação de uma parte: pendente, paga, ou quitada pelos acertos (saldo zerado por acerto). */
export type ShareState = 'pend' | 'paid' | 'via';

export type MyOweItem =
  | { kind: 'share'; expense: ExpenseDoc; share: Cents; due: Cents; state: ShareState }
  | { kind: 'payment'; payment: PaymentDoc };

export interface MyRecvItem {
  expense: ExpenseDoc;
  memberId: MemberId;
  share: Cents;
  due: Cents;
  state: ShareState;
}

export interface MyView {
  owe: MyOweItem[];
  recv: MyRecvItem[];
  /** Devo (pendente), Já paguei (partes e acertos), A receber (pendente). */
  totals: { owe: Cents; paid: Cents; recv: Cents };
}

function byDateDesc(a: ExpenseDoc, b: ExpenseDoc): number {
  return b.date.localeCompare(a.date) || (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity);
}

export function myView(split: SplitDoc, expenses: readonly ExpenseDoc[], payments: readonly PaymentDoc[], me: MemberId): MyView {
  const { net } = ledger({ order: orderOf(split), expenses, payments });
  // Saldo zerado por acertos: o que resta das partes já foi quitado no acerto (spec 06).
  const via = (net[me] ?? 0) === 0 && payments.some((p) => p.from === me || p.to === me);
  const stateOf = (due: Cents): ShareState => (due <= 0 ? 'paid' : via ? 'via' : 'pend');
  const owe: MyOweItem[] = [];
  const recv: MyRecvItem[] = [];
  const totals = { owe: 0, paid: 0, recv: 0 };
  for (const e of [...expenses].sort(byDateDesc)) {
    const sh = sharesOf(e, split);
    if (e.payer !== me && (sh[me] ?? 0) > 0) {
      const share = sh[me]!;
      const due = Math.max(0, share - (e.paid[me] ?? 0));
      const state = stateOf(due);
      owe.push({ kind: 'share', expense: e, share, due, state });
      if (state === 'paid') totals.paid += share;
      else if (state === 'pend') totals.owe += due;
    }
    if (e.payer === me) {
      for (const [id, share] of Object.entries(sh)) {
        if (id === me || share <= 0) continue;
        const due = Math.max(0, share - (e.paid[id] ?? 0));
        const state = stateOf(due);
        recv.push({ expense: e, memberId: id, share, due, state });
        if (state === 'pend') totals.recv += due;
      }
    }
  }
  for (const p of [...payments].sort(byTime)) {
    if (p.from !== me) continue;
    owe.push({ kind: 'payment', payment: p });
    totals.paid += p.amount;
  }
  return { owe, recv, totals };
}

/** Partes que quem pagou a despesa ainda precisa conferir ("1 pagamento p/ conferir"). */
export function pendingChecks(e: ExpenseDoc): number {
  return Object.entries(e.pendConf).filter(([id, v]) => v && (e.paid[id] ?? 0) > 0).length;
}
