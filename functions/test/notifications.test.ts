import { beforeEach, describe, expect, it } from 'vitest';
import { proofPath, type ExpenseInput, type NotificationData } from '@qpq/shared';
import { admin, clearFirestore, clearStorage, createSplit, memberIdByName, newUser, upload, type TestUser } from './helpers.ts';

// Fase 7: as 4 situações da spec 07 viram notificação para a pessoa certa.
beforeEach(async () => {
  await clearFirestore();
  await clearStorage();
});

let seq = 0;
const newId = () => `ntf${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;

interface World {
  lucas: TestUser;
  bia: TestUser;
  cat: TestUser;
  splitId: string;
  eu: string;
  beatriz: string;
  catarina: string;
}

/** Lucas (admin) cria "Ano Novo"; Bia entra como Beatriz e Cat como Catarina. */
async function world(): Promise<World> {
  const lucas = await newUser();
  const bia = await newUser();
  const cat = await newUser();
  const { splitId, code } = await createSplit(lucas);
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  const catarina = await memberIdByName(splitId, 'Catarina');
  await bia.call('joinSplit', { code, memberId: beatriz });
  await cat.call('joinSplit', { code, memberId: catarina });
  return { lucas, bia, cat, splitId, eu: await memberIdByName(splitId, 'Lucas'), beatriz, catarina };
}

/** Pizza R$ 90,00 paga por Lucas, R$ 30,00 para cada um. */
async function pizza(w: World): Promise<string> {
  const id = newId();
  const expense: ExpenseInput = { name: 'Pizza', amount: 9000, payer: w.eu, members: [w.eu, w.beatriz, w.catarina], mode: 'equal', date: '2026-12-28', tags: [] };
  await w.lucas.call('createExpense', { splitId: w.splitId, id, expense });
  return id;
}

async function notes(u: TestUser): Promise<Array<NotificationData & { id: string }>> {
  const snap = await admin().collection('notifications').where('to', '==', u.uid).get();
  return snap.docs.map((d) => ({ ...(d.data() as NotificationData), id: d.id }));
}

const share = (u: TestUser, fn: string, w: World, expenseId: string, memberId: string) => u.call(fn, { splitId: w.splitId, expenseId, memberId });

describe('parte de despesa', () => {
  it('a própria pessoa marca pago: quem pagou recebe "Beatriz pagou R$ 30,00 pra você"', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    const [n, ...rest] = await notes(w.lucas);
    expect(rest).toEqual([]);
    expect(n).toMatchObject({
      kind: 'paid',
      toMember: w.eu,
      splitId: w.splitId,
      splitName: 'Ano Novo',
      from: w.beatriz,
      fromName: 'Beatriz',
      amount: 3000,
      hasProof: false,
      expId: exp,
      expName: 'Pizza',
      memberId: w.beatriz,
      read: false,
      status: 'new',
      hidden: false,
    });
    // Ninguém mais é avisado; quem marcou não recebe aviso de si mesmo.
    expect(await notes(w.bia)).toEqual([]);
    expect(await notes(w.cat)).toEqual([]);
  });

  it('quem pagou marca "Recebi" ou um admin marca pelo outro: ninguém é avisado', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.lucas, 'markShare', w, exp, w.beatriz);
    expect(await notes(w.lucas)).toEqual([]);
    expect(await notes(w.bia)).toEqual([]);
  });

  it('comprovante logo depois de marcar entra no mesmo aviso; enviado depois por quem pagou avisa a outra pessoa', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: exp, memberId: w.beatriz, path });
    const lucas = await notes(w.lucas);
    expect(lucas).toHaveLength(1);
    expect(lucas[0]).toMatchObject({ kind: 'paid', hasProof: true });

    // Catarina: Lucas marca "Recebi" e depois envia o comprovante; avisa a Catarina.
    await share(w.lucas, 'markShare', w, exp, w.catarina);
    const p2 = await upload(w.lucas, proofPath(w.splitId, w.catarina, w.eu, 'recibo.jpg'));
    await w.lucas.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: exp, memberId: w.catarina, path: p2 });
    expect(await notes(w.cat)).toMatchObject([{ kind: 'proof', from: w.eu, fromName: 'Lucas', amount: 3000, hasProof: true, expId: exp, memberId: w.catarina }]);
  });

  it('Confirmar e "Não recebi" mudam o estado do aviso; "Não recebi" avisa quem marcou', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    await share(w.lucas, 'disputeShare', w, exp, w.beatriz);
    expect((await notes(w.lucas))[0]!.status).toBe('disputed');
    expect(await notes(w.bia)).toMatchObject([{ kind: 'disputed', from: w.eu, fromName: 'Lucas', amount: 3000, expId: exp, memberId: w.beatriz }]);

    // Beatriz marca de novo: novo aviso. Lucas confirma esse.
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    await share(w.lucas, 'confirmShare', w, exp, w.beatriz);
    const statuses = (await notes(w.lucas)).map((n) => n.status).sort();
    expect(statuses).toEqual(['confirmed', 'disputed']);
  });

  it('"Recebi" de quem pagou resolve a contestação antiga', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    await share(w.lucas, 'disputeShare', w, exp, w.beatriz);
    await share(w.lucas, 'markShare', w, exp, w.beatriz);
    expect((await notes(w.lucas)).map((n) => n.status)).toEqual(['confirmed']);
  });

  it('Desfazer da própria pessoa tira o aviso que ainda esperava confirmação', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    await share(w.bia, 'unmarkShare', w, exp, w.beatriz);
    expect((await notes(w.lucas)).map((n) => n.hidden)).toEqual([true]);
  });

  it('excluir a despesa some com os avisos dela; Desfazer traz de volta (decisão 7)', async () => {
    const w = await world();
    const exp = await pizza(w);
    await share(w.bia, 'markShare', w, exp, w.beatriz);
    await share(w.lucas, 'confirmShare', w, exp, w.beatriz);
    await share(w.lucas, 'unmarkShare', w, exp, w.beatriz);
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: exp });
    expect((await notes(w.lucas)).map((n) => n.hidden)).toEqual([true]);
    await w.lucas.call('restoreExpense', { splitId: w.splitId, expenseId: exp });
    expect((await notes(w.lucas)).map((n) => n.hidden)).toEqual([false]);
  });
});

describe('acerto pelo Saldo', () => {
  it('quem deve registra: avisa quem recebe; quem recebe registra: avisa quem pagou', async () => {
    const w = await world();
    await pizza(w);
    const p1 = newId();
    await w.bia.call('createPayment', { splitId: w.splitId, id: p1, from: w.beatriz, to: w.eu });
    expect(await notes(w.lucas)).toMatchObject([{ kind: 'settled', from: w.beatriz, amount: 3000, paymentId: p1, payFrom: w.beatriz, payTo: w.eu, expId: null }]);
    const p2 = newId();
    await w.lucas.call('createPayment', { splitId: w.splitId, id: p2, from: w.catarina, to: w.eu });
    expect(await notes(w.cat)).toMatchObject([{ kind: 'settled', from: w.eu, amount: 3000, paymentId: p2, payFrom: w.catarina, payTo: w.eu }]);
  });

  it('admin registrando entre outras duas pessoas avisa as duas', async () => {
    const w = await world();
    const id = newId();
    const expense: ExpenseInput = { name: 'Uber', amount: 2000, payer: w.catarina, members: [w.beatriz, w.catarina], mode: 'equal', date: '2026-12-28', tags: [] };
    await w.cat.call('createExpense', { splitId: w.splitId, id, expense });
    await w.lucas.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.catarina });
    expect(await notes(w.bia)).toHaveLength(1);
    expect(await notes(w.cat)).toHaveLength(1);
    expect(await notes(w.lucas)).toEqual([]);
  });

  it('comprovante depois avisa a outra pessoa; Desfazer o acerto some com os avisos', async () => {
    const w = await world();
    await pizza(w);
    const p = newId();
    await w.bia.call('createPayment', { splitId: w.splitId, id: p, from: w.beatriz, to: w.eu });
    // Lucas já leu o aviso do acerto; o comprovante chega depois como aviso novo.
    const [settled] = await notes(w.lucas);
    await admin().doc(`notifications/${settled!.id}`).update({ read: true });
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'acerto.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: p, path });
    expect((await notes(w.lucas)).map((n) => n.kind).sort()).toEqual(['proof', 'settled']);
    await w.bia.call('deletePayment', { splitId: w.splitId, paymentId: p });
    expect((await notes(w.lucas)).every((n) => n.hidden)).toBe(true);
  });
});

it('quem ainda não entrou no split não recebe aviso', async () => {
  const lucas = await newUser();
  const { splitId } = await createSplit(lucas);
  const eu = await memberIdByName(splitId, 'Lucas');
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  const id = newId();
  await lucas.call('createExpense', { splitId, id, expense: { name: 'Pizza', amount: 9000, payer: beatriz, members: [eu, beatriz], mode: 'equal', date: '2026-12-28', tags: [] } });
  await lucas.call('markShare', { splitId, expenseId: id, memberId: eu });
  expect((await admin().collection('notifications').get()).size).toBe(0);
});
