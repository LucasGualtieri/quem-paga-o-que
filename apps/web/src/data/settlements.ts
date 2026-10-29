import type { ExpenseDoc, PaymentDoc, SplitDoc } from './model.ts';
import { dueSharesOf, sharesOf } from './model.ts';

/**
 * Acertos do modo detalhado vistos nas partes (spec 06). No servidor, o acerto marca as partes do
 * par (`via`) na mesma transação; aqui o aparelho mostra isso antes de a resposta chegar:
 * - acerto novo (ainda sem `covers`): marca as partes em aberto do par e tira do saldo os acertos
 *   antigos do par, que o servidor vai incorporar;
 * - acerto do servidor cuja despesa ainda não chegou com o `via`: marca as partes que ele cobre;
 * - acerto confirmado: as partes deixam de estar "a conferir";
 * - acerto sendo desfeito (`undone`): as partes voltam ao que eram antes dele.
 * Tudo isto só acrescenta o que o servidor já vai gravar; quando o snapshot chega, não muda nada.
 */
export function applySettlements(
  split: SplitDoc,
  expenses: readonly ExpenseDoc[],
  payments: readonly PaymentDoc[],
  undone: readonly PaymentDoc[],
): { expenses: ExpenseDoc[]; payments: PaymentDoc[] } {
  const settlements = payments.filter((p) => p.viaShares);
  if (settlements.length === 0 && undone.length === 0) return { expenses: expenses as ExpenseDoc[], payments: payments as PaymentDoc[] };
  const fresh = settlements.filter((p) => !p.covers);
  const out = expenses.map((e) => {
    let next = e;
    const set = (m: string, paid: number | null, via: string | null, pend: boolean | null) => {
      const field = <V,>(map: Record<string, V>, v: V | null) => {
        const r = { ...map };
        if (v === null) delete r[m];
        else r[m] = v;
        return r;
      };
      next = { ...next, paid: field(next.paid, paid), via: field(next.via ?? {}, via), pendConf: field(next.pendConf, pend) };
    };
    for (const p of undone) {
      for (const c of p.covers ?? []) {
        if (c.e !== e.id || next.via?.[c.m] !== p.id) continue;
        set(c.m, c.prev ?? null, c.prevVia ?? null, null);
      }
    }
    for (const p of settlements) {
      for (const c of p.covers ?? []) {
        if (c.e !== e.id || next.via?.[c.m]) continue;
        // Ainda sem o `via` do servidor (a despesa chega depois do acerto).
        set(c.m, dueSharesOf(next, split)[c.m] ?? 0, p.id, p.pendConf && c.m === p.from ? true : null);
      }
      if (!p.pendConf) for (const [m, id] of Object.entries(next.via ?? {})) if (id === p.id && next.pendConf[m]) set(m, next.paid[m] ?? 0, id, null);
    }
    for (const p of fresh) {
      const debtor = e.payer === p.to ? p.from : e.payer === p.from ? p.to : null;
      if (!debtor) continue;
      const share = dueSharesOf(next, split)[debtor] ?? 0;
      if (share > 0 && (next.paid[debtor] ?? 0) < share) set(debtor, share, p.id, p.pendConf && debtor === p.from ? true : null);
    }
    return next;
  });
  const pair = (a: PaymentDoc, b: PaymentDoc) => (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
  const absorbed = payments.map((q) => {
    const by = q.viaShares ? undefined : fresh.find((p) => pair(p, q));
    return by ? { ...q, viaShares: true, absorbedBy: by.id } : q;
  });
  return { expenses: out, payments: absorbed };
}

/** O acerto que marcou esta parte, se houver (Desfazer dela desfaz o acerto inteiro). */
export function settlementOf(e: ExpenseDoc, memberId: string, payments: readonly PaymentDoc[]): PaymentDoc | null {
  const id = e.via?.[memberId];
  return id ? (payments.find((p) => p.id === id) ?? null) : null;
}

/** As despesas que um acerto cobre, por data, para o aviso do Desfazer. */
export function coveredExpenses(p: PaymentDoc, expenses: readonly ExpenseDoc[]): ExpenseDoc[] {
  return expenses
    .filter((e) => Object.values(e.via ?? {}).includes(p.id))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt?.getTime() ?? Infinity) - (b.createdAt?.getTime() ?? Infinity));
}

/**
 * Modo simplificado: mexer nesta despesa muda o saldo de quem já acertou? Sim se alguma parte já
 * foi paga ou se há acerto entre quem pagou e alguém com parte (spec 06: a folha avisa).
 */
export function touchesSettled(e: ExpenseDoc, split: SplitDoc, payments: readonly PaymentDoc[]): boolean {
  if (Object.values(e.paid).some((v) => v > 0)) return true;
  const sh = sharesOf(e, split);
  const inPart = (id: string) => id !== e.payer && (sh[id] ?? 0) > 0;
  return payments.some((p) => (p.from === e.payer && inPart(p.to)) || (p.to === e.payer && inPart(p.from)));
}
