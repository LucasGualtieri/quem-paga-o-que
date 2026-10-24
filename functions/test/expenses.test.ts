import { beforeEach, describe, expect, it } from 'vitest';
import type { ExpenseInput, ExpenseWriteResponse } from '@qpq/shared';
import { admin, clearFirestore, createSplit, detailsOf, memberIdByName, newUser, reasonOf, splitDoc, type TestUser } from './helpers.ts';

beforeEach(clearFirestore);

let seq = 0;
const newId = () => `exp${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;

interface World {
  lucas: TestUser;
  bia: TestUser;
  splitId: string;
  eu: string;
  beatriz: string;
  catarina: string;
}

/** Lucas (admin) cria o split; Bia entra como Beatriz; Catarina ainda não entrou. */
async function world(): Promise<World> {
  const lucas = await newUser();
  const bia = await newUser();
  const { splitId, code } = await createSplit(lucas);
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  await bia.call('joinSplit', { code, memberId: beatriz });
  return { lucas, bia, splitId, eu: await memberIdByName(splitId, 'Lucas'), beatriz, catarina: await memberIdByName(splitId, 'Catarina') };
}

const pizza = (w: World, extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  name: 'Pizza',
  amount: 1000,
  payer: w.eu,
  members: [w.eu, w.beatriz, w.catarina],
  mode: 'equal',
  date: '2026-12-28',
  tags: ['food'],
  ...extra,
});

const create = (u: TestUser, w: World, expense: ExpenseInput, id = newId()) =>
  u.call<ExpenseWriteResponse>('createExpense', { splitId: w.splitId, id, expense }).then((r) => ({ ...r, id }));
const expDoc = async (w: World, id: string) => (await admin().doc(`splits/${w.splitId}/expenses/${id}`).get()).data()!;
const history = async (w: World, id: string) =>
  (await admin().collection(`splits/${w.splitId}/expenses/${id}/history`).get()).docs.map((d) => d.data()).sort((a, b) => a.seq - b.seq);

describe('createExpense', () => {
  it('qualquer participante lança; guarda autor, versão 1 e pagamentos vazios', async () => {
    const w = await world();
    const { id, version } = await create(w.bia, w, pizza(w, { payer: w.beatriz, tags: [] }));
    expect(version).toBe(1);
    const d = await expDoc(w, id);
    expect(d).toMatchObject({
      name: 'Pizza',
      amount: 1000,
      payer: w.beatriz,
      author: w.beatriz,
      version: 1,
      deletedAt: null,
      paid: {},
      proof: {},
      pendConf: {},
      tags: ['other'],
      date: '2026-12-28',
      updatedBy: w.beatriz,
    });
    expect((await history(w, id)).map((h) => h.kind)).toEqual(['created']);
  });

  it('ícone ou emoji na despesa e nos itens; inválido recusa; sem escolha fica automático', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w, { icon: { kind: 'emoji', value: '🍕' }, mode: 'items', amount: null, items: [{ amount: 600, members: [w.eu], icon: { kind: 'icon', name: 'beer' } }, { amount: 400, members: [w.beatriz] }] }));
    const d = await expDoc(w, id);
    expect(d.icon).toEqual({ kind: 'emoji', value: '🍕' });
    expect(d.items).toEqual([{ amount: 600, members: [w.eu], icon: { kind: 'icon', name: 'beer' } }, { amount: 400, members: [w.beatriz] }]);
    expect(await reasonOf(create(w.lucas, w, pizza(w, { icon: { kind: 'icon', name: 'trash' } as never })))).toBe('invalid-input');
    const plain = await create(w.lucas, w, pizza(w));
    expect((await expDoc(w, plain.id)).icon).toBeNull();
  });

  it('modo itens sem valor: o total vira a soma dos itens', async () => {
    const w = await world();
    const { id } = await create(
      w.lucas,
      w,
      pizza(w, { amount: null, mode: 'items', items: [{ name: 'Cerveja', amount: 600, members: [w.eu] }, { amount: 400, members: [w.beatriz] }] }),
    );
    const d = await expDoc(w, id);
    expect(d.amount).toBe(1000);
    expect(d.items).toEqual([{ name: 'Cerveja', amount: 600, members: [w.eu] }, { amount: 400, members: [w.beatriz] }]);
  });

  it('recusa o que o motor de cálculo recusa', async () => {
    const w = await world();
    expect(await detailsOf(create(w.lucas, w, pizza(w, { amount: 0 })))).toMatchObject({ reason: 'expense-invalid' });
    expect(await reasonOf(create(w.lucas, w, pizza(w, { mode: 'pct', w: { [w.eu]: 50, [w.beatriz]: 40, [w.catarina]: 0 } })))).toBe('expense-invalid');
    expect(await reasonOf(create(w.lucas, w, pizza(w, { members: [] })))).toBe('expense-invalid');
    expect(await reasonOf(create(w.lucas, w, pizza(w, { payer: 'zé' })))).toBe('expense-invalid');
    expect(await reasonOf(create(w.lucas, w, pizza(w, { members: [w.eu, 'zé'] })))).toBe('expense-invalid');
  });

  it('recusa nome vazio, data inexistente e id malformado', async () => {
    const w = await world();
    expect(await reasonOf(create(w.lucas, w, pizza(w, { name: '  ' })))).toBe('invalid-input');
    expect(await reasonOf(create(w.lucas, w, pizza(w, { date: '2026-02-30' })))).toBe('invalid-input');
    expect(await reasonOf(w.lucas.call('createExpense', { splitId: w.splitId, id: 'a/b', expense: pizza(w) }))).toBe('invalid-input');
  });

  it('quem não está no split não lança; split finalizado não aceita', async () => {
    const w = await world();
    const zé = await newUser();
    expect(await reasonOf(create(zé, w, pizza(w)))).toBe('not-member');
    await admin().doc(`splits/${w.splitId}`).update({ status: 'done' });
    expect(await reasonOf(create(w.lucas, w, pizza(w)))).toBe('split-done');
  });

  it('o mesmo id não cria duas vezes', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    expect(await reasonOf(create(w.lucas, w, pizza(w), id))).toBe('expense-exists');
  });
});

describe('updateExpense (decisão 8)', () => {
  it('autor edita: versão sobe e o histórico guarda a mudança de valor', async () => {
    const w = await world();
    const { id } = await create(w.bia, w, pizza(w));
    const res = await w.bia.call<ExpenseWriteResponse>('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { amount: 1200 }) });
    expect(res.version).toBe(2);
    const h = await history(w, id);
    expect(h.map((x) => x.kind)).toEqual(['created', 'edited']);
    expect(h[1]).toMatchObject({ from: 1000, to: 1200, by: w.beatriz });
  });

  it('admin edita despesa dos outros; outro membro não', async () => {
    const w = await world();
    const { id } = await create(w.bia, w, pizza(w));
    const edit = (u: TestUser) => u.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { name: 'Pizza 2' }) });
    const carol = await newUser();
    expect(await reasonOf(edit(carol))).toBe('not-member');
    // Beatriz promovida a membro comum de novo: só autor ou admin editam.
    const outro = await world();
    const { id: id2 } = await create(outro.lucas, outro, pizza(outro));
    expect(
      await reasonOf(outro.bia.call('updateExpense', { splitId: outro.splitId, expenseId: id2, expectedVersion: 1, expense: pizza(outro) })),
    ).toBe('not-admin');
    expect(await reasonOf(edit(w.lucas))).toBeNull();
  });

  it('versão desatualizada: avisa quem alterou; "por cima" grava e as duas entram no histórico', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    await w.lucas.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { name: 'Pizza grande' }) });
    // Quem editava a versão 1 chega atrasado.
    const late = { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { name: 'Pizza pequena' }) };
    const adminLate = w.lucas.call('updateExpense', late);
    expect(await detailsOf(adminLate)).toMatchObject({ reason: 'version-conflict', name: 'Lucas' });
    expect((await expDoc(w, id)).name).toBe('Pizza grande');
    const res = await w.lucas.call<ExpenseWriteResponse>('updateExpense', { ...late, force: true });
    expect(res.version).toBe(3);
    const d = await expDoc(w, id);
    expect(d).toMatchObject({ name: 'Pizza pequena', version: 3 });
    expect((await history(w, id)).map((h) => h.kind)).toEqual(['created', 'edited', 'edited']);
  });

  it('editar não mexe nos pagamentos já marcados', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    await admin().doc(`splits/${w.splitId}/expenses/${id}`).update({ paid: { [w.beatriz]: 334 }, pendConf: { [w.beatriz]: true } });
    await w.lucas.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { amount: 1500 }) });
    expect(await expDoc(w, id)).toMatchObject({ amount: 1500, paid: { [w.beatriz]: 334 }, pendConf: { [w.beatriz]: true } });
  });

  it('despesa inexistente, excluída ou com dados inválidos', async () => {
    const w = await world();
    expect(await reasonOf(w.lucas.call('updateExpense', { splitId: w.splitId, expenseId: 'nadaexiste1', expectedVersion: 1, expense: pizza(w) }))).toBe('expense-missing');
    const { id } = await create(w.lucas, w, pizza(w));
    expect(await reasonOf(w.lucas.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: pizza(w, { amount: -5 }) }))).toBe('expense-invalid');
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    expect(await reasonOf(w.lucas.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 2, expense: pizza(w) }))).toBe('expense-missing');
  });
});

describe('deleteExpense e restoreExpense (decisão 7)', () => {
  it('exclusão marcada: some do saldo e dá para desfazer', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    const d = await expDoc(w, id);
    expect(d.deletedAt).not.toBeNull();
    expect(d.version).toBe(2);
    // Beatriz não deve mais nada: sai do split sem bloqueio de saldo.
    expect(await reasonOf(w.bia.call('leaveSplit', { splitId: w.splitId }))).toBeNull();

    await w.lucas.call('restoreExpense', { splitId: w.splitId, expenseId: id });
    expect((await expDoc(w, id)).deletedAt).toBeNull();
    expect((await history(w, id)).map((h) => h.kind)).toEqual(['created', 'deleted', 'restored']);
  });

  it('com parte paga ou pendência de confirmação, bloqueia', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    const ref = admin().doc(`splits/${w.splitId}/expenses/${id}`);
    await ref.update({ paid: { [w.beatriz]: 334 } });
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBe('has-payments');
    await ref.update({ paid: {}, pendConf: { [w.beatriz]: true } });
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBe('has-payments');
    await ref.update({ pendConf: {} });
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBeNull();
  });

  it('só autor ou admin excluem; split finalizado bloqueia', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    expect(await reasonOf(w.bia.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBe('not-admin');
    await admin().doc(`splits/${w.splitId}`).update({ status: 'done' });
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBe('split-done');
  });

  it('excluir de novo é inofensivo; desfazer exige que as pessoas ainda estejam no split', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBeNull();
    // Catarina nunca entrou e está quitada: o admin a remove (a despesa está excluída).
    await w.lucas.call('removeMember', { splitId: w.splitId, memberId: w.catarina });
    expect((await splitDoc(w.splitId)).members[w.catarina]).toBeUndefined();
    expect(await reasonOf(w.lucas.call('restoreExpense', { splitId: w.splitId, expenseId: id }))).toBe('expense-invalid');
  });

  it('restaurar o que não está excluído não muda nada', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    expect(await reasonOf(w.lucas.call('restoreExpense', { splitId: w.splitId, expenseId: id }))).toBeNull();
    expect((await history(w, id)).map((h) => h.kind)).toEqual(['created']);
  });
});

describe('saldos ignoram despesas excluídas', () => {
  it('remover participante: só as despesas ativas bloqueiam', async () => {
    const w = await world();
    const { id } = await create(w.lucas, w, pizza(w));
    expect(await reasonOf(w.lucas.call('removeMember', { splitId: w.splitId, memberId: w.catarina }))).toBe('balance-not-zero');
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    expect(await reasonOf(w.lucas.call('removeMember', { splitId: w.splitId, memberId: w.catarina }))).toBeNull();
  });
});
