import { describe, expect, it } from 'vitest';
import { pairsView, pendingChecks } from './balance.ts';
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
    m3: { name: 'Catarina', nameKey: 'catarina', uid: null, admin: false, joinOrder: 2, isNew: false },
  },
  uids: ['u1', 'u2'],
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
const pay = (id: string, from: string, to: string, amount: number, t: number, extra: Partial<PaymentDoc> = {}): PaymentDoc => ({ id, from, to, amount, by: from, when: new Date(t), proof: null, ...extra });

// Pizza R$ 60,00 paga pela Beatriz entre os dois (Lucas devia R$ 30,00); Gasolina R$ 40,00 paga pelo Lucas (Beatriz devia R$ 20,00).
const pizza = exp('pizza', { amount: 6000, payer: 'm2', members: ['m1', 'm2'], date: '2026-12-27' });
const gasolina = exp('gasolina', { amount: 4000, payer: 'm1', members: ['m1', 'm2'], date: '2026-12-28' });
// Mercado R$ 30,00 pago pelo Lucas entre os três: Catarina deve R$ 10,00.
const mercado = exp('mercado', { amount: 3000, payer: 'm1', members: ['m1', 'm2', 'm3'], date: '2026-12-29' });

describe('pairsView (Minha visão)', () => {
  it('um cartão por pessoa com o saldo do par e as despesas que o formam', () => {
    const v = pairsView(split, [pizza, gasolina], [], 'm1');
    expect(v.mine).toBe(-1000);
    const [bia, cat] = v.cards;
    expect(bia).toMatchObject({ other: 'm2', status: 'owe', amount: 1000, net: -1000, toConfirm: 0 });
    expect(bia!.entries.map((e) => (e.kind === 'share' ? [e.expense.id, e.debtor, e.share, e.state] : e.kind))).toEqual([
      ['pizza', 'm1', 3000, 'open'],
      ['gasolina', 'm2', 2000, 'offset'],
    ]);
    // Quem não tem nada com você aparece quitado, por último.
    expect(cat).toMatchObject({ other: 'm3', status: 'zero', amount: 0, entries: [] });
  });

  it('ordem: o que eu devo, o que me devem (maiores primeiro), quitados por último', () => {
    // Uber R$ 60,00 pago pela Catarina entre ela e o Lucas: com o Mercado, Lucas deve R$ 20,00 a ela.
    const uber = exp('uber', { amount: 6000, payer: 'm3', members: ['m1', 'm3'] });
    expect(pairsView(split, [pizza, gasolina, mercado, uber], [], 'm1').cards.map((c) => [c.other, c.status, c.amount])).toEqual([
      ['m3', 'owe', 2000],
      ['m2', 'zero', 0],
    ]);
    // Sem o Uber: Catarina deve R$ 10,00; Beatriz zerou (Pizza − Gasolina − Mercado).
    expect(pairsView(split, [pizza, gasolina, mercado], [], 'm1').cards.map((c) => [c.other, c.status, c.amount])).toEqual([
      ['m3', 'owed', 1000],
      ['m2', 'zero', 0],
    ]);
    // Dois a receber: o maior primeiro.
    const viagem = exp('viagem', { amount: 9000, payer: 'm1', members: ['m1', 'm2', 'm3'] });
    const almoco = exp('almoco', { amount: 2000, payer: 'm1', members: ['m1', 'm2'] });
    expect(pairsView(split, [viagem, almoco], [], 'm1').cards.map((c) => [c.other, c.amount])).toEqual([
      ['m2', 4000],
      ['m3', 3000],
    ]);
  });

  it('pagar a parte deixa a entrada paga; acerto entra como pagamento e zera o par', () => {
    const paid = { ...pizza, paid: { m1: 3000 }, paidAt: { m1: 5 } };
    const v = pairsView(split, [paid, gasolina], [], 'm1');
    expect(v.cards[0]).toMatchObject({ other: 'm2', status: 'owed', amount: 2000 });
    expect(v.cards[0]!.entries[0]).toMatchObject({ kind: 'share', state: 'paid', due: 0, paidAt: new Date(5) });
    expect(v.cards[0]!.entries[1]).toMatchObject({ kind: 'share', state: 'open' });

    const p = pay('p1', 'm1', 'm2', 1000, Date.parse('2026-12-30T10:00:00'));
    const settled = pairsView(split, [pizza, gasolina], [p], 'm1').cards.find((c) => c.other === 'm2')!;
    expect(settled).toMatchObject({ status: 'zero', amount: 0 });
    expect(settled.entries.map((e) => e.kind)).toEqual(['share', 'share', 'payment']);
    expect(settled.entries[2]).toEqual({ kind: 'payment', payment: p, out: true });
    // Saldo zerado pelo acerto: as partes não pagas ficam compensadas.
    expect(settled.entries.slice(0, 2).map((e) => (e.kind === 'share' ? e.state : ''))).toEqual(['offset', 'offset']);
  });

  it('para conferir: parte marcada pela pessoa e acerto que ela registrou para mim', () => {
    const marked = { ...gasolina, paid: { m2: 2000 }, pendConf: { m2: true } };
    const v = pairsView(split, [marked], [pay('p1', 'm2', 'm1', 500, 1, { pendConf: true })], 'm1');
    expect(v.cards[0]).toMatchObject({ other: 'm2', toConfirm: 2 });
    expect(v.cards[0]!.entries.find((e) => e.kind === 'share')).toMatchObject({ pending: true, state: 'paid' });
    // Para quem marcou, nada a conferir.
    expect(pairsView(split, [marked], [pay('p1', 'm2', 'm1', 500, 1, { pendConf: true })], 'm2').cards[0]).toMatchObject({ other: 'm1', toConfirm: 0 });
  });

  it('acerto sem hora (acabou de ser feito) vai para o fim; ver como outra pessoa', () => {
    const now = { ...pay('p2', 'm2', 'm1', 100, 0), when: null };
    const v = pairsView(split, [pizza], [now], 'm1');
    expect(v.cards[0]!.entries.at(-1)).toMatchObject({ kind: 'payment', out: false });
    // Admin vendo como Beatriz: os cartões dela, inclusive o par com a Catarina.
    const asBia = pairsView(split, [mercado], [], 'm2');
    expect(asBia.mine).toBe(-1000);
    expect(asBia.cards.map((c) => [c.other, c.status])).toEqual([
      ['m1', 'owe'],
      ['m3', 'zero'],
    ]);
  });
});

describe('pendingChecks ("1 pagamento p/ conferir")', () => {
  it('conta só as partes pagas que esperam confirmação', () => {
    expect(pendingChecks({ ...pizza, paid: { m1: 300 }, pendConf: { m1: true, m3: true } })).toBe(1);
    expect(pendingChecks(pizza)).toBe(0);
  });
});
