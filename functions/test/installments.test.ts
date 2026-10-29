import { beforeEach, describe, expect, it } from 'vitest';
import { brasiliaDay, type ExpenseInput, type NotificationData, type PayMode } from '@qpq/shared';
import { autoFinalizeAt } from '../src/autoFinalize.ts';
import { notifyDueAt } from '../src/installments.ts';
import { admin, clearFirestore, createSplit, memberIdByName, newUser, reasonOf, splitDoc, type TestUser } from './helpers.ts';
import { Timestamp } from 'firebase-admin/firestore';

// Despesa parcelada (spec 05): contam as parcelas vencidas e a próxima (que se paga antes de vencer).
beforeEach(clearFirestore);

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const newId = () => `inst${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;
/** Dia (AAAA-MM-DD, Brasília) a `n` dias de hoje. */
const ymd = (n: number) => brasiliaDay(Date.now() + n * DAY);
/** Mesmo dia do mês, `m` meses de hoje (dia 1..28 para não esbarrar em fim de mês). */
const monthsFromNow = (m: number) => {
  const d = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, Math.min(d.getUTCDate(), 28))).toISOString().slice(0, 10);
};

async function world(mode: PayMode = 'simple') {
  const lucas = await newUser();
  const bia = await newUser();
  const { splitId, code } = await createSplit(lucas);
  if (mode === 'detailed') await lucas.call('setPayMode', { splitId, mode });
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  await bia.call('joinSplit', { code, memberId: beatriz });
  return { lucas, bia, splitId, eu: await memberIdByName(splitId, 'Lucas'), beatriz, catarina: await memberIdByName(splitId, 'Catarina') };
}
type W = Awaited<ReturnType<typeof world>>;

/** Airbnb R$ 900,00 em 3x pago pela Beatriz, entre os três (R$ 300,00 cada, R$ 100,00 por parcela). */
const airbnb = (w: W, first: string, extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  name: 'Airbnb',
  amount: 90000,
  payer: w.beatriz,
  members: [w.eu, w.beatriz, w.catarina],
  mode: 'equal',
  date: first,
  tags: ['stay'],
  installments: { count: 3, first },
  ...extra,
});
const create = async (u: TestUser, w: W, e: ExpenseInput) => {
  const id = newId();
  await u.call('createExpense', { splitId: w.splitId, id, expense: e });
  return id;
};
const exp = async (w: W, id: string) => (await admin().doc(`splits/${w.splitId}/expenses/${id}`).get()).data() as Record<string, unknown>;
const notesOf = async (u: TestUser) => (await admin().collection('notifications').where('to', '==', u.uid).get()).docs.map((d) => d.data() as NotificationData);

describe('lançar parcelada', () => {
  it('grava o plano e o próximo aviso (o que já entrou no saldo não avisa)', async () => {
    const w = await world();
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    const e = await exp(w, id);
    expect(e.installments).toEqual({ count: 3, first: monthsFromNow(1) });
    expect(e.instN).toBe(1);
    expect(e.instNext).toBe(monthsFromNow(1));
    // Só falta vencer a última: ao vencer ela não traz parcela nova, então não há aviso.
    const late = await create(w.bia, w, airbnb(w, monthsFromNow(-1)));
    expect(await exp(w, late)).toMatchObject({ instN: null, instNext: null });
  });

  it('plano inválido não salva; à vista grava `installments: null`', async () => {
    const w = await world();
    expect(await reasonOf(w.bia.call('createExpense', { splitId: w.splitId, id: newId(), expense: airbnb(w, ymd(0), { installments: { count: 1, first: ymd(0) } }) }))).toBe('expense-invalid');
    expect(await reasonOf(w.bia.call('createExpense', { splitId: w.splitId, id: newId(), expense: airbnb(w, ymd(0), { installments: { count: 30, first: ymd(0) } }) }))).toBe('expense-invalid');
    expect(await reasonOf(w.bia.call('createExpense', { splitId: w.splitId, id: newId(), expense: airbnb(w, ymd(0), { installments: { count: '3' as never, first: ymd(0) } }) }))).toBe('invalid-input');
    const id = await create(w.bia, w, airbnb(w, ymd(0), { installments: null }));
    expect(await exp(w, id)).toMatchObject({ installments: null, instNext: null, instN: null });
  });

  it('editar mantendo o plano não mexe nos avisos; trocar o plano recomeça', async () => {
    const w = await world();
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    await admin().doc(`splits/${w.splitId}/expenses/${id}`).update({ instN: 2, instNext: monthsFromNow(2) });
    await w.bia.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 1, expense: airbnb(w, monthsFromNow(1), { name: 'Airbnb Floripa' }) });
    expect((await exp(w, id)).instN).toBe(2);
    await w.bia.call('updateExpense', { splitId: w.splitId, expenseId: id, expectedVersion: 2, expense: airbnb(w, monthsFromNow(2)) });
    expect(await exp(w, id)).toMatchObject({ instN: 1, instNext: monthsFromNow(2) });
  });
});

describe('saldo: vencidas e a próxima', () => {
  it('modo detalhado: marcar parte paga paga as vencidas e a próxima', async () => {
    const w = await world('detailed');
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(0)));
    await w.lucas.call('markShare', { splitId: w.splitId, expenseId: id, memberId: w.eu });
    expect(((await exp(w, id)).paid as Record<string, number>)[w.eu]).toBe(20000);
  });

  it('antes da primeira vencer, ela já pode ser paga', async () => {
    const w = await world('detailed');
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    await w.lucas.call('markShare', { splitId: w.splitId, expenseId: id, memberId: w.eu });
    expect(((await exp(w, id)).paid as Record<string, number>)[w.eu]).toBe(10000);
  });
});

describe('advanceInstallments', () => {
  it('antecipa a próxima ou todas, só da pessoa; quem pagou e admin também podem', async () => {
    const w = await world('detailed');
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    expect(await w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.eu })).toEqual({ advanced: 2 });
    await w.lucas.call('markShare', { splitId: w.splitId, expenseId: id, memberId: w.eu });
    expect(((await exp(w, id)).paid as Record<string, number>)[w.eu]).toBe(20000);
    // Quem pagou (Beatriz) antecipa todas da Catarina; a parte do Lucas não muda.
    expect(await w.bia.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.catarina, all: true })).toEqual({ advanced: 3 });
    expect((await exp(w, id)).advanced).toEqual({ [w.eu]: 2, [w.catarina]: 3 });
    await w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.eu, all: true });
    // Já está tudo antecipado: não muda nada.
    expect(await w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.eu, all: true })).toEqual({ advanced: 3 });
  });

  it('recusa: despesa à vista, quem pagou, quem não está na despesa, quem não pode', async () => {
    const w = await world();
    const plain = await create(w.bia, w, airbnb(w, ymd(0), { installments: null }));
    expect(await reasonOf(w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: plain, memberId: w.eu }))).toBe('invalid-input');
    const id = await create(w.lucas, w, airbnb(w, monthsFromNow(1), { members: [w.eu, w.beatriz] }));
    expect(await reasonOf(w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.beatriz }))).toBe('invalid-input');
    expect(await reasonOf(w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.catarina }))).toBe('invalid-input');
    const mine = await create(w.lucas, w, airbnb(w, monthsFromNow(1), { payer: w.eu }));
    // Bia (membro) não antecipa a parte da Catarina numa despesa que o Lucas pagou.
    expect(await reasonOf(w.bia.call('advanceInstallments', { splitId: w.splitId, expenseId: mine, memberId: w.catarina }))).toBe('not-involved');
  });
});

describe('notifyDueAt (aviso de vencimento)', () => {
  it('quando uma parcela vence, avisa que a seguinte entrou no saldo, uma vez, e pula quem antecipou', async () => {
    const w = await world();
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    expect(await notifyDueAt(Date.now())).toBe(0);
    // Lucas antecipa todas: não recebe aviso. Catarina não entrou no split: sem aviso.
    await w.lucas.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: w.eu, all: true });
    const lucasNotes = () => notesOf(w.lucas);
    expect(await notifyDueAt(Date.now() + 40 * DAY)).toBe(0);
    expect((await exp(w, id)).instN).toBe(2);
    expect((await lucasNotes()).filter((n) => n.kind === 'installmentDue')).toEqual([]);

    // Sem antecipar: aviso com o valor da parcela e o número.
    const w2 = await world();
    const id2 = await create(w2.bia, w2, airbnb(w2, monthsFromNow(1)));
    expect(await notifyDueAt(Date.now() + 40 * DAY)).toBe(1);
    expect(await notifyDueAt(Date.now() + 40 * DAY)).toBe(0);
    const got = (await notesOf(w2.lucas)).filter((n) => n.kind === 'installmentDue');
    expect(got).toMatchObject([{ amount: 10000, from: w2.beatriz, expId: id2, expName: 'Airbnb', inst: { n: 2, of: 3, due: monthsFromNow(2) } }]);
    // A 2ª vence e traz a 3ª; a 3ª (última), ao vencer, não traz nada: para de avisar.
    expect(await notifyDueAt(Date.now() + 120 * DAY)).toBe(1);
    expect(await exp(w2, id2)).toMatchObject({ instNext: null, instN: null });
  });

  it('despesa excluída ou split finalizado esperam', async () => {
    const w = await world();
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    await w.bia.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    expect(await notifyDueAt(Date.now() + 40 * DAY)).toBe(0);
    await w.bia.call('restoreExpense', { splitId: w.splitId, expenseId: id });
    await admin().doc(`splits/${w.splitId}`).update({ status: 'done' });
    expect(await notifyDueAt(Date.now() + 40 * DAY)).toBe(0);
    expect((await exp(w, id)).instN).toBe(1);
  });
});

describe('finalização automática com parcelas', () => {
  it('não finaliza enquanto houver parcela a vencer', async () => {
    const w = await world();
    const id = await create(w.bia, w, airbnb(w, monthsFromNow(1)));
    await admin().doc(`splits/${w.splitId}`).update({ moneyAt: Timestamp.fromMillis(Date.now() - 30 * DAY) });
    // Hoje ninguém deve nada (nada venceu), mas há parcelas a vencer.
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    expect((await splitDoc(w.splitId)).status).toBe('open');
    // Com todas antecipadas e pagas por acerto, finaliza.
    for (const m of [w.eu, w.catarina]) await w.bia.call('advanceInstallments', { splitId: w.splitId, expenseId: id, memberId: m, all: true });
    await w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.eu, to: w.beatriz });
    await w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.catarina, to: w.beatriz });
    await admin().doc(`splits/${w.splitId}`).update({ moneyAt: Timestamp.fromMillis(Date.now() - 30 * DAY) });
    expect(await autoFinalizeAt(Date.now())).toEqual([w.splitId]);
  });
});
