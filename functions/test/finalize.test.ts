import { beforeEach, describe, expect, it } from 'vitest';
import { coverPath, proofPath, receiptPath, type ExpenseInput } from '@qpq/shared';
import { admin, clearFirestore, clearStorage, createSplit, exists, memberIdByName, newUser, reasonOf, splitDoc, upload, type TestUser } from './helpers.ts';

// Fase 8: finalizar e reabrir (spec 04); finalizar apaga os comprovantes na hora (decisão 9).
beforeEach(async () => {
  await clearFirestore();
  await clearStorage();
});

let seq = 0;
const newId = () => `fin${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;

interface World {
  lucas: TestUser;
  bia: TestUser;
  splitId: string;
  eu: string;
  beatriz: string;
  catarina: string;
}

async function world(): Promise<World> {
  const lucas = await newUser();
  const bia = await newUser();
  const { splitId, code } = await createSplit(lucas);
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  await bia.call('joinSplit', { code, memberId: beatriz });
  return { lucas, bia, splitId, eu: await memberIdByName(splitId, 'Lucas'), beatriz, catarina: await memberIdByName(splitId, 'Catarina') };
}

async function pizza(w: World): Promise<string> {
  const id = newId();
  const expense: ExpenseInput = { name: 'Pizza', amount: 9000, payer: w.eu, members: [w.eu, w.beatriz, w.catarina], mode: 'equal', date: '2026-12-28', tags: [] };
  await w.lucas.call('createExpense', { splitId: w.splitId, id, expense });
  return id;
}

const expDoc = async (w: World, id: string) => (await admin().doc(`splits/${w.splitId}/expenses/${id}`).get()).data()!;

describe('finalizeSplit / reopenSplit', () => {
  it('só admin finaliza e reabre; finalizado bloqueia lançar e marcar', async () => {
    const w = await world();
    const exp = await pizza(w);
    expect(await reasonOf(w.bia.call('finalizeSplit', { splitId: w.splitId }))).toBe('not-admin');
    await w.lucas.call('finalizeSplit', { splitId: w.splitId });
    const done = await splitDoc(w.splitId);
    expect(done.status).toBe('done');
    expect((done as unknown as { doneAt: { toMillis(): number } }).doneAt.toMillis()).toBeGreaterThan(Date.now() - 60_000);
    expect(await reasonOf(w.bia.call('markShare', { splitId: w.splitId, expenseId: exp, memberId: w.beatriz }))).toBe('split-done');
    expect(await reasonOf(w.lucas.call('createExpense', { splitId: w.splitId, id: newId(), expense: { name: 'X', amount: 100, payer: w.eu, members: [w.eu], mode: 'equal', date: '2026-12-28', tags: [] } }))).toBe('split-done');
    // Finalizar de novo não muda nada.
    await w.lucas.call('finalizeSplit', { splitId: w.splitId });

    expect(await reasonOf(w.bia.call('reopenSplit', { splitId: w.splitId }))).toBe('not-admin');
    await w.lucas.call('reopenSplit', { splitId: w.splitId });
    const open = await splitDoc(w.splitId);
    expect(open.status).toBe('open');
    expect((open as unknown as { doneAt: unknown }).doneAt).toBeNull();
    await w.bia.call('markShare', { splitId: w.splitId, expenseId: exp, memberId: w.beatriz });
  });

  it('finalizar apaga na hora os comprovantes de pagamento e da despesa; a capa fica; reabrir não traz de volta', async () => {
    const w = await world();
    const exp = await pizza(w);
    await w.bia.call('markShare', { splitId: w.splitId, expenseId: exp, memberId: w.beatriz });
    const proof = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: exp, memberId: w.beatriz, path: proof });
    const nota = await upload(w.lucas, receiptPath(w.splitId, exp, 'nota.jpg'));
    await w.lucas.call('setReceipt', { splitId: w.splitId, expenseId: exp, path: nota });
    const pay = newId();
    await w.lucas.call('createPayment', { splitId: w.splitId, id: pay, from: w.catarina, to: w.eu });
    const acerto = await upload(w.lucas, proofPath(w.splitId, w.catarina, w.eu, 'acerto.jpg'));
    await w.lucas.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: pay, path: acerto });
    const solta = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'solta.jpg'));
    const capa = await upload(w.lucas, coverPath(w.splitId, 'grupo.jpg'));

    await w.lucas.call('finalizeSplit', { splitId: w.splitId });
    const d = await expDoc(w, exp);
    expect(d.proof[w.beatriz]).toMatchObject({ path: null, by: w.beatriz });
    expect(d.receipt).toMatchObject({ path: null });
    expect((await admin().doc(`splits/${w.splitId}/payments/${pay}`).get()).data()!.proof).toMatchObject({ path: null });
    for (const p of [proof, nota, acerto, solta]) expect(await exists(p)).toBe(false);
    expect(await exists(capa)).toBe(true);
    expect((await admin().collection('proofs').where('splitId', '==', w.splitId).get()).size).toBe(0);

    await w.lucas.call('reopenSplit', { splitId: w.splitId });
    expect((await expDoc(w, exp)).proof[w.beatriz].path).toBeNull();
    const again = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'de-novo.jpg'));
    expect(await reasonOf(w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: exp, memberId: w.beatriz, path: again }))).toBe('proof-exists');
  });
});
