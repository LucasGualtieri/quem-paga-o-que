import { describe, expect, it } from 'vitest';
import { adminContact, adminHandover, balances, finalizeSuggestion, itemsBreakdown, leaveBlock, membersInOrder, myMember, promoteBlock, removeBlock, type ExpenseDoc, type PaymentDoc, type SplitDoc } from './model.ts';

const split: SplitDoc = {
  id: 's1',
  name: 'Ano Novo',
  emoji: '🎆',
  status: 'open',
  code: 'K7M-24Q',
  createdBy: 'm1',
  members: {
    m3: { name: 'Catarina', nameKey: 'catarina', uid: null, admin: false, joinOrder: 2, isNew: false },
    m1: { name: 'Lucas', nameKey: 'lucas', uid: 'u-lucas', admin: true, joinOrder: 0, isNew: false },
    m2: { name: 'Beatriz', nameKey: 'beatriz', uid: 'u-bia', admin: false, joinOrder: 1, isNew: false },
  },
  uids: ['u-lucas', 'u-bia'],
  adminUids: ['u-lucas'],
};
const noMoney = { expenses: [], payments: [] };

describe('model', () => {
  it('membros na ordem de entrada e quem sou eu', () => {
    expect(membersInOrder(split).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(myMember(split, 'u-bia')?.id).toBe('m2');
    expect(myMember(split, 'u-zé')).toBeNull();
  });

  it('saldos pelo motor compartilhado', () => {
    const money = { expenses: [{ amount: 3000, payer: 'm1', members: ['m1', 'm2'], mode: 'equal' as const }], payments: [] };
    expect(balances(split, money)).toEqual({ m1: 1500, m2: -1500, m3: 0 });
  });

  it('remover: mesmos bloqueios do servidor', () => {
    const owing = { expenses: [], payments: [{ from: 'm3', to: 'm1', amount: 500 }] };
    expect(removeBlock(split, owing, 'm3')).toEqual({ reason: 'balance-not-zero', amount: 500 });
    const inExpense = { expenses: [{ amount: 100, payer: 'm1', members: ['m1', 'm3'], mode: 'exact' as const, w: { m1: 100, m3: 0 } }], payments: [] };
    expect(removeBlock(split, inExpense, 'm3')).toEqual({ reason: 'in-expenses' });
    expect(removeBlock(split, noMoney, 'm3')).toBeNull();
  });

  it('sair: só com saldo zero; o último admin também sai (o papel passa adiante)', () => {
    expect(leaveBlock(split, noMoney, 'm1')).toBeNull();
    expect(leaveBlock(split, noMoney, 'm2')).toBeNull();
    const owing = { expenses: [{ amount: 3000, payer: 'm1', members: ['m1', 'm2'], mode: 'equal' as const }], payments: [] };
    expect(leaveBlock(split, owing, 'm2')).toEqual({ reason: 'balance-not-zero', amount: -1500 });
  });

  it('tornar admin: só quem já entrou; deixar de ser admin, sempre', () => {
    expect(promoteBlock(split, 'm3', true)).toEqual({ reason: 'not-joined' });
    expect(promoteBlock(split, 'm2', true)).toBeNull();
    expect(promoteBlock(split, 'm1', false)).toBeNull();
  });

  it('último admin: o papel vai para quem entrou primeiro; sem ninguém, para o próximo que entrar', () => {
    expect(adminHandover(split, 'm1')).toEqual({ heir: expect.objectContaining({ id: 'm2' }) });
    expect(adminHandover(split, 'm2')).toBeNull();
    const alone = { ...split, members: { ...split.members, m2: { ...split.members.m2!, uid: null } } };
    expect(adminHandover(alone, 'm1')).toEqual({ heir: null });
    const twoAdmins = { ...split, members: { ...split.members, m2: { ...split.members.m2!, admin: true } } };
    expect(adminHandover(twoAdmins, 'm1')).toBeNull();
  });

  it('"fale com…" conforme a quantidade de admins (spec 04)', () => {
    const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`;
    expect(adminContact([], t)).toBe('people.anAdmin');
    expect(adminContact(['Beatriz'], t)).toBe('Beatriz');
    expect(adminContact(['Beatriz', 'Catarina'], t)).toBe('people.orList{"list":"Beatriz","last":"Catarina"}');
    expect(adminContact(['Beatriz', 'Catarina', 'Fellipe'], t)).toBe('people.orList{"list":"Beatriz, Catarina","last":"Fellipe"}');
    expect(adminContact(['Beatriz', 'Catarina', 'Fellipe', 'Marina'], t)).toBe('people.orOther{"list":"Beatriz, Catarina"}');
  });
});

describe('applyPatches (UX otimista em Pessoas)', () => {
  it('aplica mudanças e remoções sobre o snapshot sem alterar o original', async () => {
    const { applyPatches } = await import('./model.ts');
    const view = applyPatches(split, [
      { memberId: 'm2', change: { admin: true } },
      { memberId: 'm3', change: 'removed' },
    ]);
    expect(view.members.m2?.admin).toBe(true);
    expect(view.members.m3).toBeUndefined();
    expect(split.members.m2?.admin).toBe(false);
    expect(split.members.m3).toBeDefined();
  });
});

describe('itemsBreakdown (detalhe por itens)', () => {
  const doc = (over: Partial<ExpenseDoc>): ExpenseDoc => ({ id: 'e1', name: 'Mercado', amount: 20000, payer: 'm2', members: [], mode: 'items', date: '2026-10-25', tags: [], note: '', longDesc: '', author: 'm1', version: 1, updatedBy: 'm1', deletedAt: null, paid: {}, pendConf: {}, proof: {}, receipt: null, paySeq: 0, ...over });

  it('cada item com a parte de cada um, e o resto da compra com a divisão dele', () => {
    const e = doc({
      items: [
        { name: 'Xeque Mate', amount: 5000, members: ['m2', 'm1'] },
        { name: 'Pão', amount: 2500, members: ['m1', 'm2', 'm3'], mode: 'frac', w: { m1: 2, m2: 2, m3: 1 } },
      ],
      rest: ['m3', 'm1', 'm2'],
    });
    const b = itemsBreakdown(e, split);
    // Na ordem de entrada (Lucas, Beatriz, Catarina), não na ordem em que foram marcados.
    expect(b.items[0]).toEqual({ amount: 5000, mode: 'equal', parts: [{ id: 'm1', cents: 2500 }, { id: 'm2', cents: 2500 }] });
    expect(b.items[1]).toMatchObject({ mode: 'frac', w: { m1: 2, m2: 2, m3: 1 }, parts: [{ id: 'm1', cents: 1000 }, { id: 'm2', cents: 1000 }, { id: 'm3', cents: 500 }] });
    // Resto: R$ 200,00 − R$ 75,00 = R$ 125,00 entre os três (centavo extra pela ordem de entrada).
    expect(b.rest).toMatchObject({ amount: 12500, mode: 'equal', members: ['m3', 'm1', 'm2'], parts: [{ id: 'm1', cents: 4167 }, { id: 'm2', cents: 4167 }, { id: 'm3', cents: 4166 }] });
  });

  it('sem sobra (ou sem ninguém no resto), não há resto', () => {
    expect(itemsBreakdown(doc({ amount: 5000, items: [{ amount: 5000, members: ['m1'] }], rest: ['m1'] }), split).rest).toBeNull();
    expect(itemsBreakdown(doc({ items: [{ amount: 5000, members: ['m1'] }] }), split).rest).toBeNull();
    expect(itemsBreakdown(doc({}), split)).toEqual({ items: [], rest: null });
  });
});

describe('finalizeSuggestion (sugestão de finalizar)', () => {
  const H = 3600_000;
  const now = Date.parse('2026-10-25T12:00:00Z');
  const exp = (over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({ id: 'e1', name: 'Pizza', amount: 6000, payer: 'm1', members: ['m1', 'm2'], mode: 'equal', date: '2026-10-24', tags: [], note: '', longDesc: '', author: 'm1', version: 1, updatedBy: 'm1', deletedAt: null, paid: { m2: 3000 }, pendConf: {}, proof: {}, receipt: null, paySeq: 1, ...over });
  const quitado = { ...split, moneyAt: new Date(now - 25 * H) };

  it('aparece 24 h depois de todos quitados, com a data da finalização automática (7 dias)', () => {
    expect(finalizeSuggestion(quitado, { expenses: [exp()], payments: [] }, now)).toEqual({ pending: false, autoAt: new Date(now - 25 * H + 7 * 24 * H) });
    expect(finalizeSuggestion({ ...split, moneyAt: new Date(now - 23 * H) }, { expenses: [exp()], payments: [] }, now)).toBeNull();
  });

  it('avisa quando ainda há pagamento esperando confirmação (parte ou acerto)', () => {
    expect(finalizeSuggestion(quitado, { expenses: [exp({ pendConf: { m2: true } })], payments: [] }, now)?.pending).toBe(true);
    const p: PaymentDoc = { id: 'p1', from: 'm2', to: 'm1', amount: 3000, by: 'm2', when: null, proof: null, pendConf: true };
    expect(finalizeSuggestion(quitado, { expenses: [exp({ paid: {} })], payments: [p] }, now)?.pending).toBe(true);
  });

  it('não aparece com saldo pendente, sem despesa, sem hora ou com o split finalizado', () => {
    expect(finalizeSuggestion(quitado, { expenses: [exp({ paid: {} })], payments: [] }, now)).toBeNull();
    expect(finalizeSuggestion(quitado, { expenses: [], payments: [] }, now)).toBeNull();
    expect(finalizeSuggestion(split, { expenses: [exp()], payments: [] }, now)).toBeNull();
    expect(finalizeSuggestion({ ...quitado, status: 'done' }, { expenses: [exp()], payments: [] }, now)).toBeNull();
  });
});
