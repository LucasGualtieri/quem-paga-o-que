import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExpenseInput, NotificationData } from '@qpq/shared';
import { autoFinalizeAt } from '../src/autoFinalize.ts';
import { admin, clearFirestore, createSplit, memberIdByName, newUser, reasonOf, splitDoc, type TestUser } from './helpers.ts';

// Finalização automática: 7 dias com todos quitados (contados da última mudança no dinheiro).
beforeEach(clearFirestore);

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const newId = () => `auto${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;
const moneyAt = async (splitId: string) => ((await splitDoc(splitId)) as unknown as { moneyAt?: Timestamp }).moneyAt?.toMillis() ?? null;
const ageMoney = (splitId: string, days: number) => admin().doc(`splits/${splitId}`).update({ moneyAt: Timestamp.fromMillis(Date.now() - days * DAY) });
const notesOf = async (u: TestUser) => (await admin().collection('notifications').where('to', '==', u.uid).get()).docs.map((d) => d.data() as NotificationData);

/** Lucas paga Pizza R$ 60,00 entre ele e a Beatriz; a Beatriz paga o par num acerto (fica esperando confirmar). */
async function settled() {
  const lucas = await newUser();
  const bia = await newUser();
  const { splitId, code } = await createSplit(lucas);
  const eu = await memberIdByName(splitId, 'Lucas');
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  await bia.call('joinSplit', { code, memberId: beatriz });
  const expense: ExpenseInput = { name: 'Pizza', amount: 6000, payer: eu, members: [eu, beatriz], mode: 'equal', date: '2026-10-24', tags: [] };
  await lucas.call('createExpense', { splitId, id: newId(), expense });
  return { lucas, bia, splitId, eu, beatriz };
}

describe('moneyAt (última mudança no dinheiro)', () => {
  it('despesa e acerto marcam a hora; confirmar não', async () => {
    const w = await settled();
    const t1 = await moneyAt(w.splitId);
    expect(t1).not.toBeNull();
    const p = newId();
    await w.bia.call('createPayment', { splitId: w.splitId, id: p, from: w.beatriz, to: w.eu });
    const t2 = await moneyAt(w.splitId);
    expect(t2!).toBeGreaterThanOrEqual(t1!);
    await ageMoney(w.splitId, 3);
    const aged = await moneyAt(w.splitId);
    await w.lucas.call('confirmPayment', { splitId: w.splitId, paymentId: p });
    expect(await moneyAt(w.splitId)).toBe(aged);
  });
});

describe('autoFinalizeAt', () => {
  it('todos quitados há 7 dias: finaliza (mesmo com confirmação pendente) e avisa todos', async () => {
    const w = await settled();
    await w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.eu });
    await ageMoney(w.splitId, 6);
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    await ageMoney(w.splitId, 8);
    expect(await autoFinalizeAt(Date.now())).toEqual([w.splitId]);
    expect(await splitDoc(w.splitId)).toMatchObject({ status: 'done', autoFinalized: true });
    expect((await notesOf(w.lucas)).filter((n) => n.kind === 'autoFinalized')).toMatchObject([{ splitId: w.splitId, splitName: 'Ano Novo' }]);
    expect((await notesOf(w.bia)).map((n) => n.kind)).toEqual(['autoFinalized']);
    // Reabrir recomeça a contagem: não finaliza de novo na próxima rodada.
    await w.lucas.call('reopenSplit', { splitId: w.splitId });
    expect(await splitDoc(w.splitId)).toMatchObject({ status: 'open', autoFinalized: false });
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
  });

  it('com saldo pendente, ou sem despesa, não finaliza', async () => {
    const w = await settled();
    await ageMoney(w.splitId, 30);
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    const lucas = await newUser();
    const { splitId } = await createSplit(lucas);
    await ageMoney(splitId, 30);
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    expect((await splitDoc(splitId)).status).toBe('open');
  });

  it('com "Termina em" no futuro, espera o fim do evento; só admin muda a data, até 1 ano', async () => {
    const w = await settled();
    await w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.eu });
    await ageMoney(w.splitId, 30);
    const ymd = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
    expect(await reasonOf(w.bia.call('updateSplit', { splitId: w.splitId, endsOn: ymd(10) }))).toBe('not-admin');
    expect(await reasonOf(w.lucas.call('updateSplit', { splitId: w.splitId, endsOn: ymd(400) }))).toBe('invalid-input');
    expect(await reasonOf(w.lucas.call('updateSplit', { splitId: w.splitId, endsOn: '2026-02-30' }))).toBe('invalid-input');
    await w.lucas.call('updateSplit', { splitId: w.splitId, endsOn: ymd(10) });
    expect((await splitDoc(w.splitId)).endsOn).toBe(ymd(10));
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    // 7 dias depois do fim do evento, finaliza.
    expect(await autoFinalizeAt(Date.now() + 19 * DAY)).toEqual([w.splitId]);
  });

  it('tirar a data (ou uma data passada) volta à regra dos 7 dias', async () => {
    const w = await settled();
    await w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.eu });
    await w.lucas.call('updateSplit', { splitId: w.splitId, endsOn: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10) });
    await ageMoney(w.splitId, 8);
    expect(await autoFinalizeAt(Date.now())).toEqual([]);
    await w.lucas.call('updateSplit', { splitId: w.splitId, endsOn: null });
    expect((await splitDoc(w.splitId)).endsOn).toBeNull();
    expect(await autoFinalizeAt(Date.now())).toEqual([w.splitId]);
  });
});
