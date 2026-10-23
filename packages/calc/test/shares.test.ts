import { describe, expect, it } from 'vitest';
import { effectiveAmount, shares } from '../src/index.ts';
import { order } from './fixtures.ts';

describe('shares · igualmente', () => {
  it('divide igual quando fecha', () => {
    expect(shares({ amount: 9000, members: ['lucas', 'bia', 'cat'], mode: 'equal' }, order)).toEqual({
      lucas: 3000,
      bia: 3000,
      cat: 3000,
    });
  });

  it('distribui os centavos que sobram 1 a 1 por ordem de entrada', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia', 'cat'], mode: 'equal' }, order)).toEqual({
      lucas: 334,
      bia: 333,
      cat: 333,
    });
    expect(shares({ amount: 1001, members: ['lucas', 'bia', 'cat'], mode: 'equal' }, order)).toEqual({
      lucas: 334,
      bia: 334,
      cat: 333,
    });
  });

  it('usa a ordem de entrada, não a ordem da lista da despesa', () => {
    expect(shares({ amount: 1000, members: ['cat', 'bia', 'lucas'], mode: 'equal' }, order)).toEqual({
      lucas: 334,
      bia: 333,
      cat: 333,
    });
    expect(shares({ amount: 1001, members: ['fel', 'bia'], mode: 'equal' }, order)).toEqual({ bia: 501, fel: 500 });
  });

  it('sem ninguém selecionado não reparte nada', () => {
    expect(shares({ amount: 1000, members: [], mode: 'equal' }, order)).toEqual({});
  });
});

describe('shares · frações', () => {
  it('pizza de 8 pedaços: 2, 1, 3, 2', () => {
    const pizza = { lucas: 2, bia: 1, cat: 3, fel: 2 };
    expect(shares({ amount: 8000, members: ['lucas', 'bia', 'cat', 'fel'], mode: 'frac', w: pizza }, order)).toEqual({
      lucas: 2000,
      bia: 1000,
      cat: 3000,
      fel: 2000,
    });
  });

  it('entrega a sobra a quem teve o maior resto', () => {
    const pizza = { lucas: 2, bia: 1, cat: 3, fel: 2 };
    // 2000,25 · 1000,125 · 3000,375 · 2000,25 → o centavo vai para cat
    expect(shares({ amount: 8001, members: ['lucas', 'bia', 'cat', 'fel'], mode: 'frac', w: pizza }, order)).toEqual({
      lucas: 2000,
      bia: 1000,
      cat: 3001,
      fel: 2000,
    });
    // 33,33 · 66,67 → o centavo vai para bia
    expect(shares({ amount: 100, members: ['lucas', 'bia'], mode: 'frac', w: { lucas: 1, bia: 2 } }, order)).toEqual({
      lucas: 33,
      bia: 67,
    });
  });

  it('empate no resto desempata por ordem de entrada', () => {
    const w = { lucas: 1, bia: 1, cat: 1 };
    expect(shares({ amount: 1000, members: ['cat', 'lucas', 'bia'], mode: 'frac', w }, order)).toEqual({
      lucas: 334,
      bia: 333,
      cat: 333,
    });
  });

  it('aceita pesos decimais', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia'], mode: 'frac', w: { lucas: 0.5, bia: 1.5 } }, order)).toEqual({
      lucas: 250,
      bia: 750,
    });
  });

  it('peso ausente, negativo ou inválido conta como zero', () => {
    expect(
      shares({ amount: 900, members: ['lucas', 'bia', 'cat', 'fel'], mode: 'frac', w: { lucas: 2, bia: -1, cat: Number.NaN } }, order),
    ).toEqual({ lucas: 900, bia: 0, cat: 0, fel: 0 });
  });

  it('soma dos pesos zero não reparte nada (a prévia mostra zeros)', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia'], mode: 'frac', w: {} }, order)).toEqual({ lucas: 0, bia: 0 });
  });
});

describe('shares · porcentagem', () => {
  it('33,33 + 33,33 + 33,34', () => {
    const w = { lucas: 33.33, bia: 33.33, cat: 33.34 };
    expect(shares({ amount: 1000, members: ['lucas', 'bia', 'cat'], mode: 'pct', w }, order)).toEqual({
      lucas: 333,
      bia: 333,
      cat: 334,
    });
  });

  it('50/50 de valor ímpar: empate vai para quem entrou primeiro', () => {
    expect(shares({ amount: 999, members: ['bia', 'lucas'], mode: 'pct', w: { lucas: 50, bia: 50 } }, order)).toEqual({
      lucas: 500,
      bia: 499,
    });
  });

  it('com soma diferente de 100%, o total é o valor vezes a soma (para a prévia)', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia'], mode: 'pct', w: { lucas: 50, bia: 30 } }, order)).toEqual({
      lucas: 500,
      bia: 300,
    });
  });
});

describe('shares · valor exato', () => {
  it('cada um fica com o que informou', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia'], mode: 'exact', w: { lucas: 700, bia: 300 } }, order)).toEqual({
      lucas: 700,
      bia: 300,
    });
  });

  it('valor ausente conta como zero', () => {
    expect(shares({ amount: 1000, members: ['lucas', 'bia'], mode: 'exact', w: { lucas: 1000 } }, order)).toEqual({
      lucas: 1000,
      bia: 0,
    });
  });
});

describe('shares · por itens', () => {
  it('divide cada item no seu modo e o resto entre as pessoas do resto', () => {
    const result = shares(
      {
        amount: 10000,
        members: ['lucas', 'bia', 'cat'],
        mode: 'items',
        items: [
          { amount: 3000, members: ['lucas', 'bia'] },
          { amount: 4000, members: ['lucas', 'bia', 'cat'], mode: 'frac', w: { lucas: 2, bia: 1, cat: 1 } },
        ],
        rest: ['lucas', 'bia', 'cat'],
        restMode: 'equal',
      },
      order,
    );
    expect(result).toEqual({ lucas: 4500, bia: 3500, cat: 2000 });
  });

  it('o resto tem modo próprio', () => {
    const result = shares(
      {
        amount: 5000,
        members: ['lucas', 'bia'],
        mode: 'items',
        items: [{ amount: 1000, members: ['lucas'], mode: 'equal' }],
        rest: ['lucas', 'bia'],
        restMode: 'pct',
        restW: { lucas: 25, bia: 75 },
      },
      order,
    );
    expect(result).toEqual({ lucas: 2000, bia: 3000 });
  });

  it('valor vazio: o total passa a ser a soma dos itens', () => {
    const expense = {
      amount: null,
      members: ['lucas', 'bia'],
      mode: 'items' as const,
      items: [
        { amount: 1001, members: ['lucas', 'bia'] },
        { amount: 500, members: ['bia'] },
      ],
    };
    expect(effectiveAmount(expense)).toBe(1501);
    expect(shares(expense, order)).toEqual({ lucas: 501, bia: 1000 });
  });

  it('sem itens, tudo vai para o resto', () => {
    expect(shares({ amount: 1000, members: [], mode: 'items', rest: ['bia', 'cat'] }, order)).toEqual({ bia: 500, cat: 500 });
  });

  it('inclui com zero quem está na despesa mas não consumiu nada', () => {
    expect(
      shares({ amount: 600, members: ['lucas', 'fel'], mode: 'items', items: [{ amount: 600, members: ['lucas'] }] }, order),
    ).toEqual({ lucas: 600, fel: 0 });
  });

  it('item ou resto sem pessoas não reparte aquela parte', () => {
    expect(
      shares({ amount: 1000, members: ['lucas'], mode: 'items', items: [{ amount: 400, members: [] }], rest: [] }, order),
    ).toEqual({ lucas: 0 });
  });
});

describe('effectiveAmount', () => {
  it('fora do modo items é o próprio valor', () => {
    expect(effectiveAmount({ amount: 1234, members: [], mode: 'equal' })).toBe(1234);
    expect(effectiveAmount({ amount: null, members: [], mode: 'equal' })).toBe(0);
  });

  it('no modo items sem valor e sem itens, é zero', () => {
    expect(effectiveAmount({ amount: null, members: [], mode: 'items' })).toBe(0);
  });

  it('no modo items com valor informado, vale o valor', () => {
    expect(effectiveAmount({ amount: 5000, members: [], mode: 'items', items: [{ amount: 100, members: [] }] })).toBe(5000);
  });
});

describe('shares · participante desconhecido', () => {
  it('falha alto em vez de calcular com dado inconsistente', () => {
    expect(() => shares({ amount: 100, members: ['lucas', 'zé'], mode: 'equal' }, order)).toThrow(/zé/);
  });
});
