import { describe, expect, it } from 'vitest';
import { ledger, type Expense, type Payment } from '../src/index.ts';
import { order } from './fixtures.ts';

const jantar: Expense = { amount: 9000, payer: 'lucas', members: ['lucas', 'bia', 'cat'], mode: 'equal' };
const run = (expenses: Expense[], payments: Payment[] = []) => ledger({ order, expenses, payments });

describe('ledger · dívidas por par', () => {
  it('quem não pagou deve sua parte para quem pagou', () => {
    const { P, M, net } = run([jantar]);
    expect(P.bia?.lucas).toBe(3000);
    expect(P.cat?.lucas).toBe(3000);
    expect(P.lucas?.bia).toBe(0);
    expect(M.bia?.lucas).toBe(3000);
    expect(M.lucas?.bia).toBe(0);
    expect(net).toEqual({ lucas: 6000, bia: -3000, cat: -3000, fel: 0 });
  });

  it('dívida líquida compensa os dois sentidos do par', () => {
    const { P, M } = run([
      { amount: 3000, payer: 'lucas', members: ['lucas', 'bia'], mode: 'equal' },
      { amount: 1000, payer: 'bia', members: ['lucas', 'bia'], mode: 'equal' },
    ]);
    expect(P.bia?.lucas).toBe(1500);
    expect(P.lucas?.bia).toBe(500);
    expect(M.bia?.lucas).toBe(1000);
    expect(M.lucas?.bia).toBe(0);
  });

  it('M nunca é negativo e a diagonal é zero', () => {
    const { M } = run([jantar]);
    for (const a of Object.keys(M)) {
      expect(M[a]?.[a]).toBe(0);
      for (const v of Object.values(M[a] ?? {})) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('split vazio: tudo zero', () => {
    const l = run([]);
    expect(l.net).toEqual({ lucas: 0, bia: 0, cat: 0, fel: 0 });
    expect(l.sug).toEqual([]);
    expect(l.pairs).toBe(0);
  });
});

describe('ledger · partes pagas (centavos)', () => {
  it('parte paga sai da dívida', () => {
    const { P, net } = run([{ ...jantar, paid: { bia: 3000 } }]);
    expect(P.bia?.lucas).toBe(0);
    expect(net.bia).toBe(0);
    expect(net.lucas).toBe(3000);
  });

  it('pagamento parcial deixa a diferença pendente', () => {
    expect(run([{ ...jantar, paid: { bia: 1000 } }]).P.bia?.lucas).toBe(2000);
  });

  it('despesa editada para mais: a diferença volta a pendente', () => {
    // parte de bia era 3000 e foi paga; o total subiu para 12000 → parte 4000
    expect(run([{ ...jantar, amount: 12000, paid: { bia: 3000 } }]).P.bia?.lucas).toBe(1000);
  });

  it('despesa editada para menos: o que foi pago a mais vira crédito', () => {
    // parte de bia caiu para 2000, mas ela já pagou 3000 → lucas deve 1000 a bia
    const { P, M, net } = run([{ ...jantar, amount: 6000, paid: { bia: 3000 } }]);
    expect(P.bia?.lucas).toBe(0);
    expect(P.lucas?.bia).toBe(1000);
    expect(M.lucas?.bia).toBe(1000);
    expect(net.bia).toBe(1000);
  });

  it('quem saiu da divisão depois de pagar recebe tudo de volta', () => {
    const { P } = run([{ ...jantar, members: ['lucas', 'cat'], paid: { bia: 3000 } }]);
    expect(P.lucas?.bia).toBe(3000);
  });

  it('quem pagou nunca tem parte a marcar', () => {
    expect(run([{ ...jantar, paid: { lucas: 3000 } }]).net).toEqual(run([jantar]).net);
  });
});

describe('ledger · acertos', () => {
  it('acerto abate a dívida do par', () => {
    const { P, M } = run([jantar], [{ from: 'bia', to: 'lucas', amount: 2000 }]);
    expect(P.bia?.lucas).toBe(1000);
    expect(M.bia?.lucas).toBe(1000);
  });

  it('acerto que quita tudo zera o par', () => {
    const { M, net } = run([jantar], [{ from: 'bia', to: 'lucas', amount: 3000 }]);
    expect(M.bia?.lucas).toBe(0);
    expect(net.bia).toBe(0);
  });

  it('acerto maior que a dívida inverte o par', () => {
    const { M, net } = run([jantar], [{ from: 'bia', to: 'lucas', amount: 4000 }]);
    expect(M.bia?.lucas).toBe(0);
    expect(M.lucas?.bia).toBe(1000);
    expect(net.bia).toBe(1000);
  });

  it('acerto e parte paga coexistem', () => {
    const { P } = run([{ ...jantar, paid: { bia: 1000 } }], [{ from: 'bia', to: 'lucas', amount: 500 }]);
    expect(P.bia?.lucas).toBe(1500);
  });
});

describe('ledger · sugestão simplificada (só em Finalizar)', () => {
  it('liga devedores a credores mesmo sem dívida direta entre eles', () => {
    // lucas pagou por bia; bia pagou por cat → cat paga lucas direto
    const l = run([
      { amount: 1000, payer: 'lucas', members: ['bia'], mode: 'equal' },
      { amount: 1000, payer: 'bia', members: ['cat'], mode: 'equal' },
    ]);
    expect(l.pairs).toBe(2);
    expect(l.M.bia?.lucas).toBe(1000);
    expect(l.M.cat?.bia).toBe(1000);
    expect(l.sug).toEqual([{ from: 'cat', to: 'lucas', amount: 1000 }]);
  });

  it('maiores devedores pagam aos maiores credores, empate por ordem de entrada', () => {
    const l = run([
      { amount: 4000, payer: 'lucas', members: ['cat', 'fel'], mode: 'equal' },
      { amount: 2000, payer: 'bia', members: ['cat', 'fel'], mode: 'equal' },
    ]);
    expect(l.net).toEqual({ lucas: 4000, bia: 2000, cat: -3000, fel: -3000 });
    expect(l.sug).toEqual([
      { from: 'cat', to: 'lucas', amount: 3000 },
      { from: 'fel', to: 'lucas', amount: 1000 },
      { from: 'fel', to: 'bia', amount: 2000 },
    ]);
  });
});

describe('ledger · participante desconhecido', () => {
  it('falha em despesa com quem pagou fora do split', () => {
    expect(() => run([{ ...jantar, payer: 'zé' }])).toThrow(/zé/);
  });

  it('falha em parte paga de quem não é do split', () => {
    expect(() => run([{ ...jantar, paid: { zé: 100 } }])).toThrow(/zé/);
  });

  it('falha em acerto com quem não é do split', () => {
    expect(() => run([], [{ from: 'zé', to: 'lucas', amount: 100 }])).toThrow(/zé/);
    expect(() => run([], [{ from: 'lucas', to: 'zé', amount: 100 }])).toThrow(/zé/);
  });
});
