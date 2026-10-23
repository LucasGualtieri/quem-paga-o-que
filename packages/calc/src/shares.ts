import { byJoinOrder } from './order.ts';
import type { Cents, JoinOrder, MemberId, ShareInput, Shares, SplitMode, Weights } from './types.ts';

/** Pesos e porcentagens viram inteiros nesta escala, para a conta ser exata. */
export const WEIGHT_SCALE = 10_000;

/** Peso em inteiro escalado; ausente, negativo ou não finito conta como zero. */
export function scaledWeight(v: number | undefined): number {
  return v !== undefined && Number.isFinite(v) && v > 0 ? Math.round(v * WEIGHT_SCALE) : 0;
}

/** Total da despesa; no modo items sem valor, é a soma dos itens. */
export function effectiveAmount(expense: ShareInput): Cents {
  if (expense.mode === 'items' && expense.amount === null) {
    return (expense.items ?? []).reduce((s, it) => s + it.amount, 0);
  }
  return expense.amount ?? 0;
}

/** Parte de cada um na despesa, em centavos. */
export function shares(expense: ShareInput, order: JoinOrder): Shares {
  if (expense.mode !== 'items') {
    return splitAmount(effectiveAmount(expense), expense.members, expense.mode, expense.w, order);
  }
  const out: Shares = {};
  for (const id of byJoinOrder(expense.members, order)) out[id] = 0;
  const add = (part: Shares) => {
    for (const [id, v] of Object.entries(part)) out[id] = (out[id] ?? 0) + v;
  };
  let used = 0;
  for (const it of expense.items ?? []) {
    add(splitAmount(it.amount, it.members, it.mode ?? 'equal', it.w, order));
    used += it.amount;
  }
  add(splitAmount(effectiveAmount(expense) - used, expense.rest ?? [], expense.restMode ?? 'equal', expense.restW, order));
  return out;
}

function splitAmount(
  amount: Cents,
  members: readonly MemberId[],
  mode: SplitMode,
  w: Weights | undefined,
  order: JoinOrder,
): Shares {
  const ids = byJoinOrder(members, order);
  const out: Shares = {};
  for (const id of ids) out[id] = 0;
  if (ids.length === 0 || !(amount > 0)) return out;

  switch (mode) {
    case 'equal': {
      // Centavos que sobram vão 1 a 1 na ordem de entrada.
      const base = Math.floor(amount / ids.length);
      const extra = amount - base * ids.length;
      ids.forEach((id, i) => {
        out[id] = base + (i < extra ? 1 : 0);
      });
      return out;
    }
    case 'exact': {
      for (const id of ids) {
        const v = w?.[id];
        out[id] = v !== undefined && Number.isFinite(v) ? Math.round(v) : 0;
      }
      return out;
    }
    case 'frac':
    case 'pct':
      return largestRemainder(amount, ids, mode, w, out);
  }
}

/**
 * Arredonda para baixo e entrega a sobra a quem teve o maior resto;
 * empate desempata pela ordem de entrada (ids já vêm nessa ordem).
 * Em %, o total é o valor vezes a soma das porcentagens.
 */
function largestRemainder(amount: Cents, ids: MemberId[], mode: 'frac' | 'pct', w: Weights | undefined, out: Shares): Shares {
  const ws = ids.map((id) => BigInt(scaledWeight(w?.[id])));
  const sumW = ws.reduce((s, x) => s + x, 0n);
  if (sumW === 0n) return out;

  const a = BigInt(amount);
  const W = mode === 'pct' ? BigInt(100 * WEIGHT_SCALE) : sumW;
  // Arredondamento meio para cima de a·sumW/W, em inteiros.
  const target = mode === 'pct' ? (2n * a * sumW + W) / (2n * W) : a;

  const parts = ws.map((wi, i) => ({ i, q: (a * wi) / W, r: (a * wi) % W }));
  let rem = target - parts.reduce((s, p) => s + p.q, 0n);
  const byRemainder = [...parts].sort((x, y) => (y.r > x.r ? 1 : y.r < x.r ? -1 : x.i - y.i));
  for (const p of byRemainder) {
    if (rem <= 0n) break;
    p.q += 1n;
    rem -= 1n;
  }
  for (const p of parts) out[ids[p.i]!] = Number(p.q);
  return out;
}

