import { dueCount, installmentDates, ledger, type Cents, type MemberId } from '@qpq/calc';
import { dueSharesOf, membersInOrder, orderOf, today, type ExpenseDoc, type PaymentDoc, type SplitDoc } from './model.ts';

/**
 * Meu saldo (spec 06, revista em 24/10/2026): um cartão por pessoa do split com o saldo do par
 * (eu ↔ ela), calculado de todas as despesas (sem as excluídas) e acertos pelo @qpq/calc, e as
 * entradas que formam esse saldo. Nada aqui é guardado.
 */

/** Eu devo, a pessoa me deve, ou está quitado. */
export type PairStatus = 'owe' | 'owed' | 'zero';

/**
 * Estado de uma parte no cartão: aberta (falta pagar e ainda pesa no saldo), paga, ou
 * compensada (não foi paga, mas o saldo do par já zerou ou virou para o outro lado).
 */
export type EntryState = 'open' | 'paid' | 'offset';

export type PairEntry =
  | {
      kind: 'share';
      expense: ExpenseDoc;
      /** Quem deve a parte e quem pagou a despesa (uma das duas pontas é quem está vendo). */
      debtor: MemberId;
      creditor: MemberId;
      share: Cents;
      /** O que ainda falta da parte. */
      due: Cents;
      state: EntryState;
      /** Marcada como paga por quem deve, esperando quem recebeu confirmar. */
      pending: boolean;
      /** Quando foi paga (só para partes pagas depois de 24/10/2026). */
      paidAt: Date | null;
      /** Paga num acerto do Meu saldo (modo detalhado): o id do acerto. */
      via: string | null;
    }
  | { kind: 'payment'; payment: PaymentDoc; out: boolean };

export interface PairCard {
  other: MemberId;
  status: PairStatus;
  /** Quanto falta acertar no par (sempre ≥ 0). */
  amount: Cents;
  /** Com sinal, do ponto de vista de quem está vendo: positivo = a pessoa me deve. */
  net: Cents;
  entries: PairEntry[];
  /** Pagamentos que a pessoa marcou para mim e eu ainda não confirmei. */
  toConfirm: number;
  /** Parcelas futuras no par (fora do saldo): com sinal (positivo = a pessoa vai me dever) e quando a próxima entra. */
  soon: { net: Cents; next: string | null };
}

export interface PairsView {
  /** Seu saldo neste split: positivo = a receber. */
  mine: Cents;
  /** Parcelas a vencer, somadas (positivo = a receber). */
  soon: Cents;
  cards: PairCard[];
}

const dayMs = (ymd: string) => new Date(`${ymd}T12:00:00`).getTime();

function entryTime(e: PairEntry): number {
  if (e.kind === 'payment') return e.payment.when?.getTime() ?? Infinity;
  return dayMs(e.expense.date) + (e.expense.createdAt?.getTime() ?? 0) / 1e13;
}

export function pairsView(split: SplitDoc, expenses: readonly ExpenseDoc[], payments: readonly PaymentDoc[], viewer: MemberId): PairsView {
  const day = today();
  const { P, net, F } = ledger({ order: orderOf(split), expenses, payments, today: day });
  const others = membersInOrder(split).filter((m) => m.id !== viewer);
  const cards = others.map((m): PairCard => {
    const o = m.id;
    const pairNet = (P[o]?.[viewer] ?? 0) - (P[viewer]?.[o] ?? 0);
    const status: PairStatus = pairNet > 0 ? 'owed' : pairNet < 0 ? 'owe' : 'zero';
    // A parte ainda pesa se quem deve é quem o saldo do par diz que deve.
    const openFor = (debtor: MemberId) => (status === 'owe' && debtor === viewer) || (status === 'owed' && debtor === o);
    const entries: PairEntry[] = [];
    for (const e of expenses) {
      const pair = e.payer === viewer ? o : e.payer === o ? viewer : null;
      if (!pair) continue;
      const share = dueSharesOf(e, split)[pair] ?? 0;
      if (share <= 0) continue;
      const paid = e.paid[pair] ?? 0;
      const due = Math.max(0, share - paid);
      const at = e.paidAt?.[pair];
      entries.push({
        kind: 'share',
        expense: e,
        debtor: pair,
        creditor: e.payer,
        share,
        due,
        state: due <= 0 ? 'paid' : openFor(pair) ? 'open' : 'offset',
        pending: paid > 0 && !!e.pendConf[pair],
        paidAt: at ? new Date(at) : null,
        via: due <= 0 ? (e.via?.[pair] ?? null) : null,
      });
    }
    for (const p of payments) {
      // Acerto antigo incorporado por um acerto do modo detalhado: aparece só o acerto que o incorporou.
      if (p.absorbedBy) continue;
      if (p.from === viewer && p.to === o) entries.push({ kind: 'payment', payment: p, out: true });
      else if (p.from === o && p.to === viewer) entries.push({ kind: 'payment', payment: p, out: false });
    }
    entries.sort((a, b) => entryTime(a) - entryTime(b));
    const toConfirm = entries.filter((x) => (x.kind === 'share' ? x.pending && x.creditor === viewer && !x.via : !x.out && !!x.payment.pendConf)).length;
    // Parcelas que ainda não venceram (nem foram antecipadas): a próxima data entre as duas pessoas.
    let next: string | null = null;
    for (const e of expenses) {
      const debtor = e.payer === viewer ? o : e.payer === o ? viewer : null;
      if (!debtor || !e.installments || !e.members.length) continue;
      const n = dueCount(e, debtor, day);
      // A próxima entra no saldo quando vence a que está em cobrança.
      const d = n < e.installments.count && (F[debtor]?.[e.payer] ?? 0) > 0 ? installmentDates(e.installments)[n - 1] : undefined;
      if (d && (!next || d < next)) next = d;
    }
    const soon = { net: (F[o]?.[viewer] ?? 0) - (F[viewer]?.[o] ?? 0), next };
    return { other: o, status, amount: Math.abs(pairNet), net: pairNet, entries, toConfirm, soon };
  });
  const rank: Record<PairStatus, number> = { owe: 0, owed: 1, zero: 2 };
  // Primeiro o que eu devo, depois o que me devem (maiores primeiro), quitados por último.
  cards.sort((a, b) => rank[a.status] - rank[b.status] || b.amount - a.amount);
  return { mine: net[viewer] ?? 0, cards, soon: cards.reduce((s, c) => s + c.soon.net, 0) };
}

/** Partes que quem pagou a despesa ainda precisa conferir ("1 pagamento p/ conferir"). */
export function pendingChecks(e: ExpenseDoc): number {
  return Object.entries(e.pendConf).filter(([id, v]) => v && (e.paid[id] ?? 0) > 0).length;
}
