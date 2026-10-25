import { describe, expect, it } from 'vitest';
import { balances, type ExpenseDoc, type PaymentDoc, type SplitDoc } from './model.ts';
import { applySettlements, coveredExpenses, settlementOf } from './settlements.ts';

const split: SplitDoc = {
  id: 's1',
  name: 'Ano Novo',
  emoji: '🎆',
  status: 'open',
  code: 'K7M-24Q',
  createdBy: 'm1',
  payMode: 'detailed',
  members: {
    m1: { name: 'Lucas', nameKey: 'lucas', uid: 'u-lucas', admin: true, joinOrder: 0, isNew: false },
    m2: { name: 'Beatriz', nameKey: 'beatriz', uid: 'u-bia', admin: false, joinOrder: 1, isNew: false },
    m3: { name: 'Catarina', nameKey: 'catarina', uid: null, admin: false, joinOrder: 2, isNew: false },
  },
  uids: ['u-lucas', 'u-bia'],
  adminUids: ['u-lucas'],
};
const exp = (id: string, over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  id,
  name: id,
  amount: 6000,
  payer: 'm1',
  members: ['m1', 'm2', 'm3'],
  mode: 'equal',
  date: '2026-10-24',
  tags: [],
  note: '',
  longDesc: '',
  author: 'm1',
  version: 1,
  updatedBy: 'm1',
  deletedAt: null,
  paid: {},
  pendConf: {},
  proof: {},
  receipt: null,
  paySeq: 0,
  ...over,
});
const pay = (id: string, over: Partial<PaymentDoc> = {}): PaymentDoc => ({ id, from: 'm2', to: 'm1', amount: 1000, by: 'm2', when: null, proof: null, pendConf: true, viaShares: true, ...over });

describe('acertos do modo detalhado nas partes', () => {
  // Pizza: Lucas pagou 60, Beatriz deve 20. Uber: Beatriz pagou 30 entre os dois, Lucas deve 15.
  const pizza = exp('pizza');
  const uber = exp('uber', { amount: 3000, payer: 'm2', members: ['m1', 'm2'] });

  it('sem acertos do detalhado, devolve o mesmo', () => {
    const payments = [pay('p0', { viaShares: false })];
    const r = applySettlements(split, [pizza], payments, []);
    expect(r.expenses[0]).toBe(pizza);
    expect(r.payments).toBe(payments);
  });

  it('acerto novo marca as partes em aberto do par nos dois sentidos e incorpora os acertos antigos', () => {
    const old = pay('old', { viaShares: false, amount: 200, pendConf: false });
    const r = applySettlements(split, [pizza, uber], [old, pay('p1', { amount: 300 })], []);
    const [pz, ub] = r.expenses;
    expect([pz!.paid, pz!.via, pz!.pendConf]).toEqual([{ m2: 2000 }, { m2: 'p1' }, { m2: true }]);
    expect([ub!.paid, ub!.via, ub!.pendConf]).toEqual([{ m1: 1500 }, { m1: 'p1' }, {}]);
    expect(r.payments.find((p) => p.id === 'old')?.viaShares).toBe(true);
    // Catarina não está no par: a parte dela fica como estava, e o par zera.
    expect(pz!.paid.m3).toBeUndefined();
    expect(balances(split, r)).toEqual({ m1: 2000, m2: 0, m3: -2000 });
  });

  it('acerto do servidor antes da despesa: marca o que ele cobre; confirmado tira o "a conferir"', () => {
    const p = pay('p1', { covers: [{ e: 'pizza', m: 'm2' }] });
    expect(applySettlements(split, [pizza], [p], []).expenses[0]!.pendConf).toEqual({ m2: true });
    const marked = exp('pizza', { paid: { m2: 2000 }, via: { m2: 'p1' }, pendConf: { m2: true } });
    const r = applySettlements(split, [marked], [{ ...p, pendConf: false }], []);
    expect([r.expenses[0]!.paid, r.expenses[0]!.pendConf]).toEqual([{ m2: 2000 }, {}]);
  });

  it('acerto desfeito: as partes voltam ao que eram antes dele', () => {
    const marked = exp('pizza', { paid: { m2: 2000, m3: 2000 }, via: { m2: 'p2', m3: 'p9' } });
    const p2 = pay('p2', { covers: [{ e: 'pizza', m: 'm2', prev: 1500, prevVia: 'p1' }] });
    expect(applySettlements(split, [marked], [], [p2]).expenses[0]).toMatchObject({ paid: { m2: 1500, m3: 2000 }, via: { m2: 'p1', m3: 'p9' } });
    const p9 = pay('p9', { from: 'm3', covers: [{ e: 'pizza', m: 'm3' }] });
    expect(applySettlements(split, [marked], [], [p9]).expenses[0]).toMatchObject({ paid: { m2: 2000 }, via: { m2: 'p2' } });
  });

  it('qual acerto marcou a parte e quais despesas ele cobre', () => {
    const marked = exp('pizza', { paid: { m2: 2000 }, via: { m2: 'p1' } });
    const p1 = pay('p1');
    expect(settlementOf(marked, 'm2', [p1])).toBe(p1);
    expect(settlementOf(marked, 'm3', [p1])).toBeNull();
    expect(settlementOf(marked, 'm2', [])).toBeNull();
    expect(coveredExpenses(p1, [marked, uber]).map((e) => e.id)).toEqual(['pizza']);
  });
});
