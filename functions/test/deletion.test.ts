import { beforeEach, describe, expect, it } from 'vitest';
import { coverPath, proofPath, type ExpenseInput, type NotificationData } from '@qpq/shared';
import { purgeEmptySplitsAt } from '../src/deletion.ts';
import { admin, clearFirestore, clearStorage, createSplit, exists, memberIdByName, newUser, reasonOf, splitDoc, upload } from './helpers.ts';

// Excluir o split inteiro (admin) e apagar sozinho o split que ficou 15 dias sem ninguém.
beforeEach(async () => {
  await clearFirestore();
  await clearStorage();
});

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const newId = () => `del${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;
const gone = async (id: string) => !(await admin().doc(`splits/${id}`).get()).exists;
const tomb = async (id: string) => (await admin().doc(`deletedSplits/${id}`).get()).data();
const notesOf = async (uid: string) => (await admin().collection('notifications').where('to', '==', uid).get()).docs.map((d) => d.data() as NotificationData);

describe('deleteSplit', () => {
  it('só admin; apaga despesas, avisos, comprovantes e capa; avisa quem estava no split', async () => {
    const lucas = await newUser();
    const bia = await newUser();
    const { splitId, code } = await createSplit(lucas);
    // Pagamento por despesa só existe no modo detalhado (spec 06).
    await lucas.call('setPayMode', { splitId, mode: 'detailed' });
    const eu = await memberIdByName(splitId, 'Lucas');
    const beatriz = await memberIdByName(splitId, 'Beatriz');
    await bia.call('joinSplit', { code, memberId: beatriz });
    const exp = newId();
    const expense: ExpenseInput = { name: 'Pizza', amount: 9000, payer: eu, members: [eu, beatriz], mode: 'equal', date: '2026-12-28', tags: [] };
    await lucas.call('createExpense', { splitId, id: exp, expense });
    await bia.call('markShare', { splitId, expenseId: exp, memberId: beatriz });
    const proof = await upload(bia, proofPath(splitId, beatriz, eu, 'pix.jpg'));
    await bia.call('attachProof', { splitId, kind: 'share', expenseId: exp, memberId: beatriz, path: proof });
    const capa = await upload(lucas, coverPath(splitId, 'grupo.jpg'));
    await lucas.call('setSplitPhoto', { splitId, path: capa });

    expect(await reasonOf(bia.call('deleteSplit', { splitId }))).toBe('not-admin');
    await lucas.call('deleteSplit', { splitId });

    expect(await gone(splitId)).toBe(true);
    expect((await admin().doc(`splits/${splitId}/expenses/${exp}`).get()).exists).toBe(false);
    expect(await exists(proof)).toBe(false);
    expect(await exists(capa)).toBe(false);
    expect((await admin().collection('proofs').where('splitId', '==', splitId).get()).size).toBe(0);
    expect(await tomb(splitId)).toMatchObject({ name: 'Ano Novo', cause: 'admin', byName: 'Lucas' });
    // O aviso de pagamento some; fica só "Lucas excluiu o split" para a Beatriz.
    expect(await notesOf(lucas.uid)).toEqual([]);
    expect(await notesOf(bia.uid)).toMatchObject([{ kind: 'splitDeleted', splitId, splitName: 'Ano Novo', fromName: 'Lucas', expId: null }]);
    // O convite antigo explica o que houve.
    expect(await reasonOf(bia.call('previewInvite', { code }))).toBe('split-gone');
    expect(await reasonOf(bia.call('joinSplit', { code, memberId: beatriz }))).toBe('split-gone');
    expect(await reasonOf(lucas.call('deleteSplit', { splitId }))).toBe('not-member');
  });
});

describe('split sem ninguém (15 dias)', () => {
  it('conta de quando a última pessoa sai; apaga depois de 15 dias; entrar antes cancela', async () => {
    const lucas = await newUser();
    const a = await createSplit(lucas);
    const b = await createSplit(lucas, { name: 'Viagem' });
    expect((await splitDoc(a.splitId) as unknown as { emptySince: unknown }).emptySince).toBeNull();
    await lucas.call('leaveSplit', { splitId: a.splitId });
    await lucas.call('leaveSplit', { splitId: b.splitId });
    expect((await splitDoc(a.splitId) as unknown as { emptySince: unknown }).emptySince).not.toBeNull();

    // Alguém entra na Viagem antes do prazo: ela continua.
    const bia = await newUser();
    await bia.call('joinSplit', { code: b.code, memberId: await memberIdByName(b.splitId, 'Beatriz') });
    expect((await splitDoc(b.splitId) as unknown as { emptySince: unknown }).emptySince).toBeNull();

    await purgeEmptySplitsAt(Date.now() + 14 * DAY);
    expect(await gone(a.splitId)).toBe(false);
    await purgeEmptySplitsAt(Date.now() + 16 * DAY);
    expect(await gone(a.splitId)).toBe(true);
    expect(await gone(b.splitId)).toBe(false);
    expect(await tomb(a.splitId)).toMatchObject({ name: 'Ano Novo', cause: 'empty', byName: null });
    expect(await reasonOf(bia.call('previewInvite', { code: a.code }))).toBe('split-gone');
  });
});
