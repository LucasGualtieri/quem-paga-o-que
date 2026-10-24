import { beforeEach, describe, expect, it } from 'vitest';
import { proofPath, receiptPath, coverPath, type CreatePaymentResponse, type ExpenseInput, type ExpenseWriteResponse, type PayWriteResponse } from '@qpq/shared';
import { purgeExpiredProofs } from '../src/proofs.ts';
import { admin, clearFirestore, clearStorage, createSplit, exists, memberIdByName, newUser, reasonOf, splitDoc, upload, type TestUser } from './helpers.ts';

beforeEach(async () => {
  await clearFirestore();
  await clearStorage();
});

let seq = 0;
const newId = () => `pay${Date.now().toString(36)}${(seq++).toString(36)}ABCD`;
const DAY = 24 * 60 * 60 * 1000;

interface World {
  lucas: TestUser;
  bia: TestUser;
  cat: TestUser;
  splitId: string;
  eu: string;
  beatriz: string;
  catarina: string;
}

/** Lucas (admin) cria o split; Bia entra como Beatriz e Cat como Catarina (membros). */
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

/** R$ 10,00 igualmente entre os três: Lucas 3,34 (centavo pela ordem de entrada), Beatriz e Catarina 3,33. */
const pizza = (w: World, extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  name: 'Pizza',
  amount: 1000,
  payer: w.eu,
  members: [w.eu, w.beatriz, w.catarina],
  mode: 'equal',
  date: '2026-12-28',
  tags: [],
  ...extra,
});

async function expense(u: TestUser, w: World, extra: Partial<ExpenseInput> = {}): Promise<string> {
  const id = newId();
  await u.call<ExpenseWriteResponse>('createExpense', { splitId: w.splitId, id, expense: pizza(w, extra) });
  return id;
}

const expDoc = async (w: World, id: string) => (await admin().doc(`splits/${w.splitId}/expenses/${id}`).get()).data()!;
const payDoc = async (w: World, id: string) => (await admin().doc(`splits/${w.splitId}/payments/${id}`).get()).data();
const kinds = async (w: World, id: string) =>
  (await admin().collection(`splits/${w.splitId}/expenses/${id}/history`).get()).docs.map((d) => d.data()).sort((a, b) => a.at.toMillis() - b.at.toMillis()).map((h) => h.kind);

const share = (u: TestUser, fn: string, w: World, expenseId: string, memberId: string) => u.call<PayWriteResponse>(fn, { splitId: w.splitId, expenseId, memberId });

describe('markShare (marcar parte paga)', () => {
  it('a própria pessoa marca: conta como paga e fica esperando a confirmação de quem pagou', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    const r = await share(w.bia, 'markShare', w, id, w.beatriz);
    expect(r.paySeq).toBe(1);
    const d = await expDoc(w, id);
    expect(d.paid).toEqual({ [w.beatriz]: 333 });
    expect(d.pendConf).toEqual({ [w.beatriz]: true });
    // Hora do pagamento, para a linha "Resolvido · …" no Saldo.
    expect(Math.abs(d.paidAt[w.beatriz] - Date.now())).toBeLessThan(60_000);
    // Marcar pago não é edição da despesa (decisão 8).
    expect(d.version).toBe(1);
    expect(d.paySeq).toBe(1);
    expect(await kinds(w, id)).toEqual(['created', 'paid']);
  });

  it('quem pagou marca "Recebi": sem pendência, porque quem recebe já está confirmando', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.lucas, 'markShare', w, id, w.beatriz);
    const d = await expDoc(w, id);
    expect(d.paid).toEqual({ [w.beatriz]: 333 });
    expect(d.pendConf).toEqual({});
  });

  it('marcar de novo depois de "Não recebi" resolve a contestação; marcar uma parte já paga não muda nada', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    await share(w.lucas, 'markShare', w, id, w.beatriz);
    expect((await expDoc(w, id)).pendConf).toEqual({});
    expect((await expDoc(w, id)).paid).toEqual({ [w.beatriz]: 333 });
  });

  it('só a própria pessoa, quem pagou a despesa ou admin', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    expect(await reasonOf(share(w.cat, 'markShare', w, id, w.beatriz))).toBe('not-involved');
    // Admin marca a parte de outra pessoa numa despesa que outra pessoa pagou: quem pagou confirma.
    const byCat = await expense(w.cat, w, { payer: w.catarina });
    await share(w.lucas, 'markShare', w, byCat, w.beatriz);
    expect((await expDoc(w, byCat)).pendConf).toEqual({ [w.beatriz]: true });
  });

  it('quem pagou nunca tem parte a marcar; quem não tem parte também não', async () => {
    const w = await world();
    const id = await expense(w.lucas, w, { members: [w.eu, w.beatriz] });
    expect(await reasonOf(share(w.lucas, 'markShare', w, id, w.eu))).toBe('invalid-input');
    expect(await reasonOf(share(w.cat, 'markShare', w, id, w.catarina))).toBe('invalid-input');
  });

  it('despesa excluída ou split finalizado bloqueiam', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await admin().doc(`splits/${w.splitId}`).update({ status: 'done' });
    expect(await reasonOf(share(w.bia, 'markShare', w, id, w.beatriz))).toBe('split-done');
    await admin().doc(`splits/${w.splitId}`).update({ status: 'open' });
    await w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id });
    expect(await reasonOf(share(w.bia, 'markShare', w, id, w.beatriz))).toBe('expense-missing');
  });

  it('excluir a despesa depois de marcar continua bloqueado (decisão 7)', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    expect(await reasonOf(w.lucas.call('deleteExpense', { splitId: w.splitId, expenseId: id }))).toBe('has-payments');
  });
});

describe('unmarkShare (Desfazer)', () => {
  it('tira o pago, a pendência e apaga o comprovante', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: id, memberId: w.beatriz, path });
    const r = await share(w.bia, 'unmarkShare', w, id, w.beatriz);
    expect(r.paySeq).toBe(3);
    const d = await expDoc(w, id);
    expect(d.paid).toEqual({});
    expect(d.paidAt).toEqual({});
    expect(d.pendConf).toEqual({});
    expect(d.proof).toEqual({});
    expect(await exists(path)).toBe(false);
    expect(await kinds(w, id)).toEqual(['created', 'paid', 'proof', 'unpaid']);
  });

  it('as mesmas pessoas que marcam', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    expect(await reasonOf(share(w.cat, 'unmarkShare', w, id, w.beatriz))).toBe('not-involved');
    await share(w.lucas, 'unmarkShare', w, id, w.beatriz);
    expect((await expDoc(w, id)).paid).toEqual({});
  });
});

describe('confirmShare / disputeShare (Confirmar · Não recebi)', () => {
  it('quem pagou confirma: some a pendência, a parte continua paga', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    expect(await reasonOf(share(w.bia, 'confirmShare', w, id, w.beatriz))).toBe('not-involved');
    expect(await reasonOf(share(w.cat, 'confirmShare', w, id, w.beatriz))).toBe('not-involved');
    await share(w.lucas, 'confirmShare', w, id, w.beatriz);
    const d = await expDoc(w, id);
    expect(d.paid).toEqual({ [w.beatriz]: 333 });
    expect(d.pendConf).toEqual({});
    expect(await kinds(w, id)).toEqual(['created', 'paid', 'confirmed']);
  });

  it('sem pendência não há o que confirmar nem contestar', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    expect(await reasonOf(share(w.lucas, 'confirmShare', w, id, w.beatriz))).toBe('not-pending');
    expect(await reasonOf(share(w.lucas, 'disputeShare', w, id, w.beatriz))).toBe('not-pending');
  });

  it('"Não recebi" desfaz a parte paga e apaga o comprovante', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: id, memberId: w.beatriz, path });
    expect(await reasonOf(share(w.bia, 'disputeShare', w, id, w.beatriz))).toBe('not-involved');
    await share(w.lucas, 'disputeShare', w, id, w.beatriz);
    const d = await expDoc(w, id);
    expect(d.paid).toEqual({});
    expect(d.pendConf).toEqual({});
    expect(d.proof).toEqual({});
    expect(await exists(path)).toBe(false);
    expect(await kinds(w, id)).toEqual(['created', 'paid', 'proof', 'disputed']);
  });
});

describe('createPayment / deletePayment (acerto pelo Saldo)', () => {
  it('registra a dívida atual do par, calculada no servidor', async () => {
    const w = await world();
    await expense(w.lucas, w);
    const id = newId();
    const r = await w.bia.call<CreatePaymentResponse>('createPayment', { splitId: w.splitId, id, from: w.beatriz, to: w.eu });
    expect(r.amount).toBe(333);
    expect(await payDoc(w, id)).toMatchObject({ from: w.beatriz, to: w.eu, amount: 333, by: w.beatriz });
    // De novo: nada a acertar, nada gravado.
    const again = newId();
    expect((await w.lucas.call<CreatePaymentResponse>('createPayment', { splitId: w.splitId, id: again, from: w.beatriz, to: w.eu })).amount).toBe(0);
    expect(await payDoc(w, again)).toBeUndefined();
    // Repetir o mesmo id (nova tentativa do aparelho) devolve o que já foi gravado.
    expect((await w.bia.call<CreatePaymentResponse>('createPayment', { splitId: w.splitId, id, from: w.beatriz, to: w.eu })).amount).toBe(333);
  });

  it('quem está na linha ou admin; terceiro não', async () => {
    const w = await world();
    await expense(w.cat, w, { payer: w.catarina });
    expect(await reasonOf(w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.eu, to: w.catarina }))).toBe('not-involved');
    // Lucas (admin) registra o acerto entre Beatriz e Catarina.
    expect((await w.lucas.call<CreatePaymentResponse>('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.catarina })).amount).toBe(333);
    expect(await reasonOf(w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.beatriz }))).toBe('invalid-input');
  });

  it('desfazer: as duas pessoas ou admin; apaga o comprovante', async () => {
    const w = await world();
    await expense(w.lucas, w);
    const id = newId();
    await w.bia.call('createPayment', { splitId: w.splitId, id, from: w.beatriz, to: w.eu });
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'acerto.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: id, path });
    expect(await reasonOf(w.cat.call('deletePayment', { splitId: w.splitId, paymentId: id }))).toBe('not-involved');
    await w.lucas.call('deletePayment', { splitId: w.splitId, paymentId: id });
    expect(await payDoc(w, id)).toBeUndefined();
    expect(await exists(path)).toBe(false);
    expect(await reasonOf(w.lucas.call('deletePayment', { splitId: w.splitId, paymentId: id }))).toBe('payment-missing');
  });

  it('split finalizado bloqueia', async () => {
    const w = await world();
    await expense(w.lucas, w);
    await admin().doc(`splits/${w.splitId}`).update({ status: 'done' });
    expect(await reasonOf(w.bia.call('createPayment', { splitId: w.splitId, id: newId(), from: w.beatriz, to: w.eu }))).toBe('split-done');
  });
});

describe('attachProof (comprovante)', () => {
  it('anexa uma vez só, a parte paga, com o caminho do par certo', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    const req = { splitId: w.splitId, kind: 'share', expenseId: id, memberId: w.beatriz, path };
    // Parte ainda não paga.
    expect(await reasonOf(w.bia.call('attachProof', req))).toBe('proof-invalid');
    await share(w.bia, 'markShare', w, id, w.beatriz);
    // Caminho de outro par, ou arquivo que não existe.
    expect(await reasonOf(w.bia.call('attachProof', { ...req, path: proofPath(w.splitId, w.catarina, w.eu, 'pix.jpg') }))).toBe('proof-invalid');
    expect(await reasonOf(w.bia.call('attachProof', { ...req, path: proofPath(w.splitId, w.beatriz, w.eu, 'nada.jpg') }))).toBe('proof-invalid');
    expect(await reasonOf(w.cat.call('attachProof', req))).toBe('not-involved');
    await w.bia.call('attachProof', req);
    const proof = (await expDoc(w, id)).proof[w.beatriz];
    expect(proof).toMatchObject({ path, by: w.beatriz });
    expect(Math.abs(proof.at - Date.now())).toBeLessThan(60_000);
    // Só enquanto não houver comprovante.
    const other = await upload(w.lucas, proofPath(w.splitId, w.beatriz, w.eu, 'outro.jpg'));
    expect(await reasonOf(w.lucas.call('attachProof', { ...req, path: other }))).toBe('proof-exists');
  });

  it('no acerto, só as duas pessoas (admin não)', async () => {
    const w = await world();
    await expense(w.cat, w, { payer: w.catarina });
    const id = newId();
    await w.lucas.call('createPayment', { splitId: w.splitId, id, from: w.beatriz, to: w.catarina });
    const path = await upload(w.lucas, proofPath(w.splitId, w.beatriz, w.catarina, 'acerto.jpg'));
    expect(await reasonOf(w.lucas.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: id, path }))).toBe('not-involved');
    await w.cat.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: id, path });
    expect((await payDoc(w, id))!.proof).toMatchObject({ path, by: w.catarina });
  });
});

describe('setProofVisibility (quem vê comprovantes)', () => {
  it('padrão "todo o split"; só admin muda', async () => {
    const w = await world();
    expect((await splitDoc(w.splitId)).proofVisibility).toBe('all');
    expect(await reasonOf(w.bia.call('setProofVisibility', { splitId: w.splitId, value: 'involved' }))).toBe('not-admin');
    expect(await reasonOf(w.lucas.call('setProofVisibility', { splitId: w.splitId, value: 'ninguém' }))).toBe('invalid-input');
    await w.lucas.call('setProofVisibility', { splitId: w.splitId, value: 'involved' });
    expect((await splitDoc(w.splitId)).proofVisibility).toBe('involved');
  });
});

describe('setReceipt (comprovante da despesa) e setSplitPhoto (capa)', () => {
  it('quem lançou ou admin; trocar apaga a foto anterior; null tira', async () => {
    const w = await world();
    const id = await expense(w.bia, w, { payer: w.beatriz });
    const first = await upload(w.bia, receiptPath(w.splitId, id, 'nota.jpg'));
    expect(await reasonOf(w.cat.call('setReceipt', { splitId: w.splitId, expenseId: id, path: first }))).toBe('not-admin');
    expect(await reasonOf(w.bia.call('setReceipt', { splitId: w.splitId, expenseId: id, path: receiptPath(w.splitId, 'outra', 'nota.jpg') }))).toBe('proof-invalid');
    await w.bia.call('setReceipt', { splitId: w.splitId, expenseId: id, path: first });
    expect((await expDoc(w, id)).receipt).toMatchObject({ path: first, by: w.beatriz });
    const second = await upload(w.lucas, receiptPath(w.splitId, id, 'nota2.jpg'));
    await w.lucas.call('setReceipt', { splitId: w.splitId, expenseId: id, path: second });
    expect(await exists(first)).toBe(false);
    await w.bia.call('setReceipt', { splitId: w.splitId, expenseId: id, path: null });
    expect((await expDoc(w, id)).receipt).toBeNull();
    expect(await exists(second)).toBe(false);
    // Não é edição: a versão não muda.
    expect((await expDoc(w, id)).version).toBe(1);
  });

  it('capa: só admin, só no caminho de capas do split', async () => {
    const w = await world();
    const path = await upload(w.lucas, coverPath(w.splitId, 'grupo.jpg'));
    expect(await reasonOf(w.bia.call('setSplitPhoto', { splitId: w.splitId, path }))).toBe('not-admin');
    expect(await reasonOf(w.lucas.call('setSplitPhoto', { splitId: w.splitId, path: coverPath('outro', 'grupo.jpg') }))).toBe('proof-invalid');
    await w.lucas.call('setSplitPhoto', { splitId: w.splitId, path });
    expect((await splitDoc(w.splitId)).photo).toBe(path);
    await w.lucas.call('setSplitPhoto', { splitId: w.splitId, path: null });
    expect((await splitDoc(w.splitId)).photo).toBeNull();
    expect(await exists(path)).toBe(false);
  });
});

describe('purgeExpiredProofs (prazo de 15 dias, decisão 9)', () => {
  it('apaga a foto e marca como expirado o que passou do prazo; capa fica', async () => {
    const w = await world();
    const id = await expense(w.lucas, w);
    await share(w.bia, 'markShare', w, id, w.beatriz);
    const path = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'pix.jpg'));
    await w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: id, memberId: w.beatriz, path });
    const nota = await upload(w.lucas, receiptPath(w.splitId, id, 'nota.jpg'));
    await w.lucas.call('setReceipt', { splitId: w.splitId, expenseId: id, path: nota });
    const payId = newId();
    await w.cat.call('createPayment', { splitId: w.splitId, id: payId, from: w.catarina, to: w.eu });
    const acerto = await upload(w.cat, proofPath(w.splitId, w.catarina, w.eu, 'acerto.jpg'));
    await w.cat.call('attachProof', { splitId: w.splitId, kind: 'payment', paymentId: payId, path: acerto });
    // Enviada e nunca anexada (o app fechou no meio): também some.
    const orphan = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'solta.jpg'));
    const cover = await upload(w.lucas, coverPath(w.splitId, 'grupo.jpg'));

    // Dentro do prazo: nada muda.
    await purgeExpiredProofs(Date.now() + 14 * DAY);
    expect(await exists(path)).toBe(true);
    expect((await expDoc(w, id)).proof[w.beatriz].path).toBe(path);

    await purgeExpiredProofs(Date.now() + 16 * DAY);
    const d = await expDoc(w, id);
    expect(d.proof[w.beatriz]).toMatchObject({ path: null, by: w.beatriz });
    expect(d.receipt).toMatchObject({ path: null });
    expect((await payDoc(w, payId))!.proof).toMatchObject({ path: null });
    for (const p of [path, nota, acerto, orphan]) expect(await exists(p)).toBe(false);
    expect(await exists(cover)).toBe(true);
    // Expirado conta como "já houve comprovante": não aceita outro.
    const again = await upload(w.bia, proofPath(w.splitId, w.beatriz, w.eu, 'de-novo.jpg'));
    expect(await reasonOf(w.bia.call('attachProof', { splitId: w.splitId, kind: 'share', expenseId: id, memberId: w.beatriz, path: again }))).toBe('proof-exists');
  });
});
