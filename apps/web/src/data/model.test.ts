import { describe, expect, it } from 'vitest';
import { adminContact, balances, leaveBlock, membersInOrder, myMember, promoteBlock, removeBlock, type SplitDoc } from './model.ts';

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

  it('sair: saldo zero e nunca o último admin', () => {
    expect(leaveBlock(split, noMoney, 'm1')).toEqual({ reason: 'last-admin' });
    expect(leaveBlock(split, noMoney, 'm2')).toBeNull();
    const owing = { expenses: [{ amount: 3000, payer: 'm1', members: ['m1', 'm2'], mode: 'equal' as const }], payments: [] };
    expect(leaveBlock(split, owing, 'm2')).toEqual({ reason: 'balance-not-zero', amount: -1500 });
  });

  it('tornar admin: só quem já entrou; deixar de ser: nunca o último', () => {
    expect(promoteBlock(split, 'm3', true)).toEqual({ reason: 'not-joined' });
    expect(promoteBlock(split, 'm2', true)).toBeNull();
    expect(promoteBlock(split, 'm1', false)).toEqual({ reason: 'last-admin' });
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
