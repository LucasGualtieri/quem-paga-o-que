import { describe, expect, it } from 'vitest';
import { dueCount, dueShares, installmentDates, isValidPlan, ledger, splitInstallments, validateExpense, type Expense } from '../src/index.ts';
import { order } from './fixtures.ts';

// Airbnb R$ 2.500,00 em 4x, pago pela Beatriz e dividido igualmente entre os quatro.
const airbnb: Expense = { amount: 250000, payer: 'bia', members: ['lucas', 'bia', 'cat', 'fel'], mode: 'equal', installments: { count: 4, first: '2026-10-10' } };

describe('installmentDates', () => {
  it('todo mês no mesmo dia, virando o ano', () => {
    expect(installmentDates({ count: 4, first: '2026-11-10' })).toEqual(['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10']);
  });

  it('dia que não existe no mês vira o último dia', () => {
    expect(installmentDates({ count: 4, first: '2027-01-31' })).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    expect(installmentDates({ count: 2, first: '2028-01-30' })).toEqual(['2028-01-30', '2028-02-29']);
  });

  it('data fora do formato não gera parcelas', () => {
    expect(installmentDates({ count: 3, first: '10/11/2026' })).toEqual([]);
  });
});

describe('splitInstallments', () => {
  it('divide a parte e manda os centavos que sobram para a primeira', () => {
    expect(splitInstallments(62500, 4)).toEqual([15625, 15625, 15625, 15625]);
    expect(splitInstallments(1000, 3)).toEqual([334, 333, 333]);
    expect(splitInstallments(0, 2)).toEqual([0, 0]);
  });
});

describe('isValidPlan', () => {
  it('de 2 a 24 parcelas, com data que existe', () => {
    expect(isValidPlan({ count: 2, first: '2026-10-10' })).toBe(true);
    expect(isValidPlan({ count: 24, first: '2026-10-31' })).toBe(true);
    expect(isValidPlan({ count: 1, first: '2026-10-10' })).toBe(false);
    expect(isValidPlan({ count: 25, first: '2026-10-10' })).toBe(false);
    expect(isValidPlan({ count: 2.5, first: '2026-10-10' })).toBe(false);
    expect(isValidPlan({ count: 3, first: '2026-02-30' })).toBe(false);
    expect(isValidPlan({ count: 3, first: '2026-13-01' })).toBe(false);
    expect(isValidPlan({ count: 3, first: 'ontem' })).toBe(false);
  });

  it('validateExpense recusa plano inválido', () => {
    expect(validateExpense({ ...airbnb, installments: { count: 1, first: '2026-10-10' } }, order)).toEqual([{ code: 'installments-invalid' }]);
    expect(validateExpense(airbnb, order)).toEqual([]);
  });
});

describe('dueCount e dueShares', () => {
  it('conta as vencidas até hoje (inclusive o dia do vencimento) mais a próxima', () => {
    expect(dueCount(airbnb, 'lucas', '2026-10-09')).toBe(1);
    expect(dueCount(airbnb, 'lucas', '2026-10-10')).toBe(2);
    expect(dueCount(airbnb, 'lucas', '2026-12-09')).toBe(3);
    expect(dueCount(airbnb, 'lucas', '2026-12-31')).toBe(4);
    expect(dueCount(airbnb, 'lucas', '2027-06-01')).toBe(4);
  });

  it('antecipadas contam antes de vencer, só para quem antecipou, e nunca passam do total', () => {
    const e = { ...airbnb, advanced: { lucas: 3, cat: 9 } };
    expect(dueCount(e, 'lucas', '2026-10-15')).toBe(3);
    expect(dueCount(e, 'cat', '2026-10-15')).toBe(4);
    expect(dueCount(e, 'fel', '2026-10-15')).toBe(2);
    expect(dueShares(e, order, '2026-10-15')).toEqual({ lucas: 46875, bia: 31250, cat: 62500, fel: 31250 });
  });

  it('sem parcelas, ou sem `today`, a parte inteira', () => {
    const plain: Expense = { amount: 9000, payer: 'lucas', members: ['lucas', 'bia', 'cat'], mode: 'equal' };
    expect(dueCount(plain, 'bia', '2026-10-15')).toBe(1);
    expect(dueShares(plain, order, '2026-10-15')).toEqual({ lucas: 3000, bia: 3000, cat: 3000 });
    expect(dueCount(airbnb, 'bia')).toBe(4);
    expect(dueShares(airbnb, order)).toEqual({ lucas: 62500, bia: 62500, cat: 62500, fel: 62500 });
  });
});

describe('ledger com parcelas', () => {
  it('vencidas e a próxima entram no saldo; o resto vai para F (a vencer)', () => {
    const { M, net, F } = ledger({ order, expenses: [airbnb], payments: [], today: '2026-11-15' });
    expect(M.lucas?.bia).toBe(46875);
    expect(net.bia).toBe(140625);
    expect(F.lucas?.bia).toBe(15625);
    expect(F.bia?.lucas).toBe(0);
  });

  it('parte paga a mais do que conta vira crédito até a parcela seguinte entrar', () => {
    const paid = { ...airbnb, paid: { lucas: 46875 } };
    expect(ledger({ order, expenses: [paid], payments: [], today: '2026-10-20' }).M.bia?.lucas).toBe(15625);
    expect(ledger({ order, expenses: [paid], payments: [], today: '2026-11-10' }).M.bia?.lucas).toBe(0);
  });

  it('sem `today`, conta tudo e F fica zerado', () => {
    const { M, F } = ledger({ order, expenses: [airbnb], payments: [] });
    expect(M.lucas?.bia).toBe(62500);
    expect(F.lucas?.bia).toBe(0);
  });
});
