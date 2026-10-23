import { describe, expect, it } from 'vitest';
import { balanceView, myView, pendingChecks } from './balance.ts';
import type { ExpenseDoc, PaymentDoc, SplitDoc } from './model.ts';

const split: SplitDoc = {
  id: 's1',
  name: 'Ano Novo',
  emoji: '🎆',
  status: 'open',
  code: 'K7M-24Q',
  createdBy: 'm1',
  members: {
    m1: { name: 'Lucas', nameKey: 'lucas', uid: 'u1', admin: true, joinOrder: 0, isNew: false },
    m2: { name: 'Beatriz', nameKey: 'beatriz', uid: 'u2', admin: false, joinOrder: 1, isNew: false },
    m3: { name: 'Catarina', nameKey: 'catarina', uid: 'u3', admin: false, joinOrder: 2, isNew: false },
  },
  uids: ['u1', 'u2', 'u3'],
  adminUids: ['u1'],
};

const exp = (id: string, over: Partial<ExpenseDoc>): ExpenseDoc => ({
  id,
  name: id,
  amount: 0,
  payer: 'm1',
  members: [],
  mode: 'equal',
  date: '2026-12-28',
  tags: ['other'],
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

// Pizza R$ 9,00 paga por Lucas entre os três (3,00 cada); Uber R$ 2,00 paga por Beatriz com Lucas (1,00 cada).
const pizza = exp('pizza', { amount: 900, payer: 'm1', members: ['m1', 'm2', 'm3'], date: '2026-12-28' });
const uber = exp('uber', { amount: 200, payer: 'm2', members: ['m1', 'm2'], date: '2026-12-29' });
const pay = (id: string, from: string, to: string, amount: number, t: number): PaymentDoc => ({ id, from, to, amount, by: from, when: new Date(t), proof: null });

describe('balanceView (aba Saldo)', () => {
  it('seu cartão primeiro, os outros pelo tamanho do saldo; linhas com a dívida real do par', () => {
    const v = balanceView(split, [pizza, uber], [], 'm1');
    expect(v.mine).toBe(500);
    expect(v.cards.map((c) => [c.id, c.net])).toEqual([
      ['m1', 500],
      ['m3', -300],
      ['m2', -200],
    ]);
    const mine = v.cards[0]!;
    expect(mine.lines).toEqual([
      { kind: 'recv', from: 'm2', to: 'm1', other: 'm2', amount: 200 },
      { kind: 'recv', from: 'm3', to: 'm1', other: 'm3', amount: 300 },
    ]);
    expect([mine.owes, mine.gets, mine.done]).toEqual([0, 2, 0]);
    expect(v.cards[2]!.lines).toEqual([{ kind: 'owe', from: 'm2', to: 'm1', other: 'm1', amount: 200 }]);
  });

  it('acerto vira linha resolvida no cartão das duas pessoas e abate a dívida', () => {
    const p = pay('p1', 'm3', 'm1', 300, 1);
    const v = balanceView(split, [pizza, uber], [p], 'm1');
    expect(v.mine).toBe(200);
    const m3 = v.cards.find((c) => c.id === 'm3')!;
    expect(m3.lines).toEqual([{ kind: 'done', payment: p, other: 'm1', paidOut: true }]);
    expect([m3.net, m3.owes, m3.gets, m3.done]).toEqual([0, 0, 0, 1]);
    expect(v.cards[0]!.lines.at(-1)).toEqual({ kind: 'done', payment: p, other: 'm3', paidOut: false });
    // Cartões em ordem estável quando o saldo empata (ordem de entrada).
    expect(balanceView(split, [], [], 'm2').cards.map((c) => c.id)).toEqual(['m2', 'm1', 'm3']);
  });

  it('acertos aparecem pela ordem em que foram feitos (o que ainda não tem hora, por último)', () => {
    const a = pay('a', 'm2', 'm1', 100, 5);
    const b = { ...pay('b', 'm2', 'm1', 50, 0), when: null };
    const c = pay('c', 'm2', 'm1', 50, 1);
    const lines = balanceView(split, [pizza], [a, b, c], 'm1').cards[0]!.lines.filter((l) => l.kind === 'done');
    expect(lines.map((l) => (l.kind === 'done' ? l.payment.id : ''))).toEqual(['c', 'a', 'b']);
  });

  it('quem não está no split vê só os cartões dos outros', () => {
    expect(balanceView(split, [], [], 'm9').cards.map((c) => c.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('myView (aba Minha visão)', () => {
  it('Devo, Já paguei e A receber; a linha fica no lugar com o estado', () => {
    const v = myView(split, [pizza, uber], [], 'm1');
    expect(v.owe).toEqual([{ kind: 'share', expense: uber, share: 100, due: 100, state: 'pend' }]);
    expect(v.recv.map((r) => [r.memberId, r.due, r.state])).toEqual([
      ['m2', 300, 'pend'],
      ['m3', 300, 'pend'],
    ]);
    expect(v.totals).toEqual({ owe: 100, paid: 0, recv: 600 });

    const paid = myView(split, [{ ...pizza, paid: { m2: 300, m3: 100 } }, { ...uber, paid: { m1: 100 } }], [], 'm1');
    expect(paid.owe[0]).toMatchObject({ state: 'paid', due: 0 });
    // Parte paga em parte (a despesa mudou de valor depois): o que falta volta a pendente (decisão 2).
    expect(paid.recv.map((r) => [r.memberId, r.due, r.state])).toEqual([
      ['m2', 0, 'paid'],
      ['m3', 200, 'pend'],
    ]);
    expect(paid.totals).toEqual({ owe: 0, paid: 100, recv: 200 });
  });

  it('saldo zerado por acerto: as partes que restam ficam "Quitado no acerto"; o acerto entra em Já paguei', () => {
    const p = pay('p1', 'm3', 'm1', 300, 1);
    const v = myView(split, [pizza, uber], [p], 'm3');
    expect(v.owe).toEqual([
      { kind: 'share', expense: pizza, share: 300, due: 300, state: 'via' },
      { kind: 'payment', payment: p },
    ]);
    expect(v.totals).toEqual({ owe: 0, paid: 300, recv: 0 });
    // Do lado de quem recebeu: o que faltava de Catarina também foi quitado no acerto, se o saldo zerou.
    const lucas = myView(split, [pizza], [p, pay('p2', 'm2', 'm1', 300, 2)], 'm1');
    expect(lucas.recv.map((r) => r.state)).toEqual(['via', 'via']);
    expect(lucas.totals.recv).toBe(0);
  });

  it('despesas mais recentes primeiro', () => {
    const later = exp('later', { amount: 300, payer: 'm2', members: ['m1', 'm2', 'm3'], date: '2026-12-30' });
    const v = myView(split, [uber, later], [], 'm1');
    expect(v.owe.map((i) => (i.kind === 'share' ? i.expense.id : ''))).toEqual(['later', 'uber']);
  });
});

describe('pendingChecks ("1 pagamento p/ conferir")', () => {
  it('conta só as partes pagas que esperam confirmação', () => {
    expect(pendingChecks({ ...pizza, paid: { m2: 300 }, pendConf: { m2: true, m3: true } })).toBe(1);
    expect(pendingChecks(pizza)).toBe(0);
  });
});
