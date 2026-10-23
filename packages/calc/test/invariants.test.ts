import { describe, expect, it } from 'vitest';
import {
  effectiveAmount,
  ledger,
  shares,
  validateExpense,
  type Expense,
  type Item,
  type JoinOrder,
  type MemberId,
  type Payment,
  type SplitMode,
  type Weights,
} from '../src/index.ts';

// PRNG com semente fixa: os casos "aleatórios" são os mesmos em toda execução.
function prng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const subset = <T,>(xs: readonly T[]): T[] => {
    const out = xs.filter(() => next() < 0.6);
    return out.length ? out : [pick(xs)];
  };
  const shuffle = <T,>(xs: readonly T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return { int, pick, subset, shuffle };
}

const people: MemberId[] = ['lucas', 'bia', 'cat', 'fel', 'marina', 'rafael', 'luca'];
const order: JoinOrder = Object.fromEntries(people.map((id, i) => [id, i]));
const modes: SplitMode[] = ['equal', 'frac', 'pct', 'exact'];

type Rng = ReturnType<typeof prng>;

/** Pesos válidos para o modo: frações > 0, % somando 100, exato somando o valor. */
function weightsFor(r: Rng, mode: SplitMode, members: MemberId[], amount: number): Weights {
  const w: Record<MemberId, number> = {};
  if (mode === 'frac') for (const id of members) w[id] = r.int(1, 8);
  if (mode === 'pct' || mode === 'exact') {
    let left = mode === 'pct' ? 100 : amount;
    members.forEach((id, i) => {
      const v = i === members.length - 1 ? left : r.int(0, left);
      w[id] = v;
      left -= v;
    });
  }
  return w;
}

function randomExpense(r: Rng): Expense {
  const members = r.subset(people);
  const payer = r.pick(people);
  if (r.int(0, 4) > 0) {
    const mode = r.pick(modes);
    const amount = r.int(1, 2_000_000);
    return { amount, payer, members, mode, w: weightsFor(r, mode, members, amount) };
  }
  const items: Item[] = Array.from({ length: r.int(1, 4) }, () => {
    const im = r.subset(people);
    const mode = r.pick(modes);
    const amount = r.int(1, 50_000);
    return { amount, members: im, mode, w: weightsFor(r, mode, im, amount) };
  });
  const used = items.reduce((s, it) => s + it.amount, 0);
  const restAmount = r.int(0, 30_000);
  const rest = r.subset(people);
  const restMode = r.pick(modes);
  return {
    amount: restAmount === 0 && r.int(0, 1) ? null : used + restAmount,
    payer,
    members,
    mode: 'items',
    items,
    rest,
    restMode,
    restW: weightsFor(r, restMode, rest, restAmount),
  };
}

describe('invariantes', () => {
  const r = prng(20261022);
  const expenses = Array.from({ length: 400 }, () => randomExpense(r));

  it('os casos gerados são despesas válidas', () => {
    for (const e of expenses) expect(validateExpense(e, order)).toEqual([]);
  });

  it('a soma das partes é exatamente o total, sem centavo perdido ou criado', () => {
    for (const e of expenses) {
      const sh = shares(e, order);
      const values = Object.values(sh);
      expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      expect(values.reduce((s, v) => s + v, 0)).toBe(effectiveAmount(e));
    }
  });

  it('a ordem da lista na despesa não muda o resultado', () => {
    for (const e of expenses) {
      const shuffled: Expense = {
        ...e,
        members: r.shuffle(e.members),
        ...(e.items && { items: e.items.map((it) => ({ ...it, members: r.shuffle(it.members) })) }),
        ...(e.rest && { rest: r.shuffle(e.rest) }),
      };
      expect(shares(shuffled, order)).toEqual(shares(e, order));
    }
  });

  it('os saldos sempre somam zero, e a sugestão quita todos os saldos', () => {
    for (let round = 0; round < 50; round++) {
      const batch = Array.from({ length: r.int(0, 12) }, () => {
        const e = randomExpense(r);
        // Algumas partes pagas, inclusive parciais e a mais.
        const paid: Record<MemberId, number> = {};
        for (const id of r.subset(people)) if (r.int(0, 2) === 0) paid[id] = r.int(0, 100_000);
        return { ...e, paid };
      });
      const payments: Payment[] = Array.from({ length: r.int(0, 5) }, () => ({
        from: r.pick(people),
        to: r.pick(people),
        amount: r.int(1, 100_000),
      }));
      const l = ledger({ order, expenses: batch, payments });
      expect(Object.values(l.net).reduce((s, v) => s + v, 0)).toBe(0);

      const after = { ...l.net };
      for (const p of l.sug) {
        after[p.from]! += p.amount;
        after[p.to]! -= p.amount;
      }
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
      expect(l.sug.length).toBeLessThan(people.length);
    }
  });
});
