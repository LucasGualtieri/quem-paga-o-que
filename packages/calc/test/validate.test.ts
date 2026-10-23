import { describe, expect, it } from 'vitest';
import { validateExpense, type Expense } from '../src/index.ts';
import { order } from './fixtures.ts';

const base: Expense = { amount: 1000, payer: 'lucas', members: ['lucas', 'bia'], mode: 'equal' };
const codes = (e: Expense) => validateExpense(e, order);

describe('validateExpense · valor', () => {
  it('aceita uma despesa válida', () => {
    expect(codes(base)).toEqual([]);
  });

  it.each([0, -100, 10.5, Number.NaN, null])('valor %s não deixa salvar', (amount) => {
    expect(codes({ ...base, amount })).toEqual([{ code: 'amount-invalid' }]);
  });
});

describe('validateExpense · participantes', () => {
  it('quem pagou precisa ser do split', () => {
    expect(codes({ ...base, payer: 'zé' })).toEqual([{ code: 'unknown-member' }]);
  });

  it('quem divide precisa ser do split', () => {
    expect(codes({ ...base, members: ['lucas', 'zé'] })).toEqual([{ code: 'unknown-member' }]);
  });
});

describe('validateExpense · modos', () => {
  it('igualmente: ninguém selecionado', () => {
    expect(codes({ ...base, members: [] })).toEqual([{ code: 'no-members' }]);
  });

  it('frações: soma dos pesos zero', () => {
    expect(codes({ ...base, mode: 'frac', w: { lucas: 0, bia: 0 } })).toEqual([{ code: 'weights-zero' }]);
    expect(codes({ ...base, mode: 'frac', w: { lucas: 2, bia: 1 } })).toEqual([]);
    expect(codes({ ...base, mode: 'frac' })).toEqual([{ code: 'weights-zero' }]);
  });

  it('frações: peso negativo ou inválido', () => {
    expect(codes({ ...base, mode: 'frac', w: { lucas: 2, bia: -1 } })).toEqual([{ code: 'weights-invalid' }]);
    expect(codes({ ...base, mode: 'frac', w: { lucas: 2, bia: Number.POSITIVE_INFINITY } })).toEqual([
      { code: 'weights-invalid' },
    ]);
  });

  it('porcentagem: soma diferente de 100%', () => {
    expect(codes({ ...base, mode: 'pct', w: { lucas: 50, bia: 40 } })).toEqual([{ code: 'pct-not-100' }]);
    expect(codes({ ...base, mode: 'pct', w: { lucas: 50, bia: 60 } })).toEqual([{ code: 'pct-not-100' }]);
    expect(codes({ ...base, members: ['lucas', 'bia', 'cat'], mode: 'pct', w: { lucas: 33.33, bia: 33.33, cat: 33.34 } })).toEqual(
      [],
    );
  });

  it('valor exato: soma diferente do total', () => {
    expect(codes({ ...base, mode: 'exact', w: { lucas: 700, bia: 200 } })).toEqual([{ code: 'exact-mismatch' }]);
    expect(codes({ ...base, mode: 'exact', w: { lucas: 700, bia: 300 } })).toEqual([]);
  });

  it('valor exato: centavos precisam ser inteiros', () => {
    expect(codes({ ...base, mode: 'exact', w: { lucas: 700.5, bia: 299.5 } })).toEqual([{ code: 'weights-invalid' }]);
  });
});

describe('validateExpense · por itens', () => {
  const items: Expense = {
    amount: 1000,
    payer: 'lucas',
    members: ['lucas', 'bia', 'cat'],
    mode: 'items',
    items: [
      { amount: 600, members: ['lucas', 'bia'] },
      { amount: 400, members: ['cat'] },
    ],
  };

  it('aceita itens que fecham com o total', () => {
    expect(codes(items)).toEqual([]);
  });

  it('valor vazio vale a soma dos itens', () => {
    expect(codes({ ...items, amount: null })).toEqual([]);
  });

  it('valor vazio sem itens não tem total', () => {
    expect(codes({ ...items, amount: null, items: [] })).toEqual([{ code: 'amount-invalid' }, { code: 'no-items' }]);
  });

  it('não salva sem itens', () => {
    expect(codes({ ...items, items: [], rest: ['lucas'] })).toEqual([{ code: 'no-items' }]);
    const { items: _omit, ...withoutItems } = items;
    expect(codes({ ...withoutItems, rest: ['lucas'] })).toEqual([{ code: 'no-items' }]);
  });

  it('item sem valor', () => {
    expect(codes({ ...items, items: [{ amount: 0, members: ['lucas'] }, { amount: 1000, members: ['bia'] }] })).toEqual([
      { code: 'amount-invalid', scope: 0 },
    ]);
  });

  it('item sem pessoas', () => {
    expect(codes({ ...items, items: [{ amount: 600, members: ['lucas'] }, { amount: 400, members: [] }] })).toEqual([
      { code: 'no-members', scope: 1 },
    ]);
  });

  it('item com divisão que não fecha', () => {
    expect(
      codes({ ...items, items: [{ amount: 1000, members: ['lucas', 'bia'], mode: 'pct', w: { lucas: 50, bia: 40 } }] }),
    ).toEqual([{ code: 'pct-not-100', scope: 0 }]);
    expect(
      codes({ ...items, items: [{ amount: 1000, members: ['lucas', 'bia'], mode: 'exact', w: { lucas: 500, bia: 400 } }] }),
    ).toEqual([{ code: 'exact-mismatch', scope: 0 }]);
  });

  it('item com pessoa fora do split', () => {
    expect(codes({ ...items, items: [{ amount: 1000, members: ['zé'] }] })).toEqual([{ code: 'unknown-member', scope: 0 }]);
  });

  it('itens somando mais que o total', () => {
    expect(codes({ ...items, amount: 900 })).toEqual([{ code: 'items-exceed-total' }]);
  });

  it('resto sem ninguém para pagar', () => {
    expect(codes({ ...items, amount: 1500 })).toEqual([{ code: 'no-members', scope: 'rest' }]);
    expect(codes({ ...items, amount: 1500, rest: [] })).toEqual([{ code: 'no-members', scope: 'rest' }]);
  });

  it('resto com divisão própria que precisa fechar', () => {
    expect(codes({ ...items, amount: 1500, rest: ['lucas', 'bia'] })).toEqual([]);
    expect(codes({ ...items, amount: 1500, rest: ['lucas', 'bia'], restMode: 'exact', restW: { lucas: 100, bia: 100 } })).toEqual([
      { code: 'exact-mismatch', scope: 'rest' },
    ]);
    expect(codes({ ...items, amount: 1500, rest: ['lucas', 'bia'], restMode: 'exact', restW: { lucas: 250, bia: 250 } })).toEqual(
      [],
    );
  });

  it('resto com pessoa fora do split', () => {
    expect(codes({ ...items, amount: 1500, rest: ['zé'] })).toEqual([{ code: 'unknown-member', scope: 'rest' }]);
  });

  it('pessoas no resto sem sobra não são erro', () => {
    expect(codes({ ...items, rest: ['lucas'] })).toEqual([]);
  });
});
