import { byJoinOrder, joinOf } from './order.ts';
import { shares } from './shares.ts';
import type { Cents, Expense, JoinOrder, Ledger, Matrix, MemberId, Payment } from './types.ts';

/**
 * Saldos do split, sempre recalculados das despesas e acertos
 * (docs/spec/02-modelo-de-dados-e-calculo.md). Nada aqui é guardado.
 */
export function ledger(input: { order: JoinOrder; expenses: readonly Expense[]; payments: readonly Payment[] }): Ledger {
  const { order } = input;
  const ids = byJoinOrder(Object.keys(order), order);
  const P = zeros(ids);
  const bump = (from: MemberId, to: MemberId, v: Cents) => {
    joinOf(from, order);
    joinOf(to, order);
    P[from]![to]! += v;
  };

  for (const e of input.expenses) {
    joinOf(e.payer, order);
    const sh = shares(e, order);
    const paid = e.paid ?? {};
    for (const id of new Set([...Object.keys(sh), ...Object.keys(paid)])) {
      if (id === e.payer) continue;
      // O que falta da parte vai para a dívida; o que foi pago a mais vira crédito.
      const owed = (sh[id] ?? 0) - (paid[id] ?? 0);
      if (owed > 0) bump(id, e.payer, owed);
      else if (owed < 0) bump(e.payer, id, -owed);
    }
  }
  // Acerto que já marcou as partes como pagas não conta de novo (modo detalhado, spec 06).
  for (const p of input.payments) if (!p.viaShares) bump(p.from, p.to, -p.amount);

  const M = zeros(ids);
  const net: Record<MemberId, Cents> = {};
  let pairs = 0;
  for (const a of ids) {
    net[a] = 0;
    for (const b of ids) {
      net[a] += P[b]![a]! - P[a]![b]!;
      if (a === b) continue;
      const v = Math.max(0, P[a]![b]! - P[b]![a]!);
      M[a]![b] = v;
      if (v > 0) pairs++;
    }
  }

  return { P, M, net, sug: simplify(ids, net), pairs };
}

/** Maiores devedores pagam aos maiores credores; empate pela ordem de entrada. */
function simplify(ids: MemberId[], net: Record<MemberId, Cents>): Payment[] {
  const side = (sign: 1 | -1) =>
    ids
      .filter((id) => sign * net[id]! > 0)
      .map((id) => ({ id, v: sign * net[id]! }))
      .sort((x, y) => y.v - x.v);
  const deb = side(-1);
  const cre = side(1);
  const sug: Payment[] = [];
  let i = 0;
  let j = 0;
  while (i < deb.length && j < cre.length) {
    const d = deb[i]!;
    const c = cre[j]!;
    const v = Math.min(d.v, c.v);
    sug.push({ from: d.id, to: c.id, amount: v });
    d.v -= v;
    c.v -= v;
    if (d.v === 0) i++;
    if (c.v === 0) j++;
  }
  return sug;
}

function zeros(ids: MemberId[]): Matrix {
  const m: Matrix = {};
  for (const a of ids) {
    m[a] = {};
    for (const b of ids) m[a][b] = 0;
  }
  return m;
}
