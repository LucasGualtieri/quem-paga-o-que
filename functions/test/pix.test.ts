import { beforeEach, describe, expect, it } from 'vitest';
import { admin, clearFirestore, createSplit, memberIdByName, newUser, reasonOf, splitDoc } from './helpers.ts';

// Chave Pix (uma por pessoa): fica no perfil e aparece só para quem divide um split com a pessoa.
beforeEach(clearFirestore);

const memberPix = async (splitId: string, name: string) => (await splitDoc(splitId)).members[await memberIdByName(splitId, name)] as unknown as { pix?: unknown };

describe('setPixKey', () => {
  it('normaliza, guarda no perfil e espelha nos splits em que a pessoa está', async () => {
    const lucas = await newUser();
    const a = await createSplit(lucas);
    const b = await createSplit(lucas, { name: 'Viagem' });
    await lucas.call('setPixKey', { key: '(11) 98765-4321' });
    const pix = { type: 'phone', key: '+5511987654321' };
    expect((await admin().doc(`users/${lucas.uid}`).get()).get('pix')).toEqual(pix);
    expect((await memberPix(a.splitId, 'Lucas')).pix).toEqual(pix);
    expect((await memberPix(b.splitId, 'Lucas')).pix).toEqual(pix);
    // Os outros nomes do split não ganham chave.
    expect((await memberPix(a.splitId, 'Beatriz')).pix ?? null).toBeNull();
  });

  it('chave inválida recusa; vazio tira a chave de todo lugar', async () => {
    const lucas = await newUser();
    const { splitId } = await createSplit(lucas);
    expect(await reasonOf(lucas.call('setPixKey', { key: 'abc' }))).toBe('invalid-input');
    await lucas.call('setPixKey', { key: 'lucas@exemplo.com' });
    await lucas.call('setPixKey', { key: null });
    expect((await admin().doc(`users/${lucas.uid}`).get()).get('pix')).toBeNull();
    expect((await memberPix(splitId, 'Lucas')).pix ?? null).toBeNull();
  });

  it('quem entra depois de cadastrar já leva a chave; quem sai deixa de mostrar', async () => {
    const lucas = await newUser();
    const bia = await newUser();
    await bia.call('setPixKey', { key: 'bia@exemplo.com' });
    const { splitId, code } = await createSplit(lucas);
    await bia.call('joinSplit', { code, memberId: await memberIdByName(splitId, 'Beatriz') });
    expect((await memberPix(splitId, 'Beatriz')).pix).toEqual({ type: 'email', key: 'bia@exemplo.com' });
    await bia.call('leaveSplit', { splitId });
    expect((await memberPix(splitId, 'Beatriz')).pix ?? null).toBeNull();
  });

  it('quem cria o split com chave cadastrada já aparece com ela', async () => {
    const lucas = await newUser();
    await lucas.call('setPixKey', { key: '529.982.247-25' });
    const { splitId } = await createSplit(lucas);
    expect((await memberPix(splitId, 'Lucas')).pix).toEqual({ type: 'cpf', key: '52998224725' });
  });
});

describe('requestPix (Pedir chave Pix) e o aviso quando a chave chega', () => {
  /** Lucas (sem chave) paga a Pizza de R$ 90,00 entre os três; Beatriz e Catarina entram e devem R$ 30,00 cada. */
  async function world() {
    const lucas = await newUser();
    const bia = await newUser();
    const cat = await newUser();
    const { splitId, code } = await createSplit(lucas);
    const eu = await memberIdByName(splitId, 'Lucas');
    const beatriz = await memberIdByName(splitId, 'Beatriz');
    const catarina = await memberIdByName(splitId, 'Catarina');
    await bia.call('joinSplit', { code, memberId: beatriz });
    await cat.call('joinSplit', { code, memberId: catarina });
    const expense = { name: 'Pizza', amount: 9000, payer: eu, members: [eu, beatriz, catarina], mode: 'equal', date: '2026-12-28', tags: [] };
    await lucas.call('createExpense', { splitId, id: `pix${Date.now().toString(36)}ABCDEF`, expense });
    return { lucas, bia, cat, splitId, code, eu, beatriz, catarina };
  }
  const notesOf = async (uid: string) => (await admin().collection('notifications').where('to', '==', uid).get()).docs.map((d) => d.data());

  it('quem deve pede uma vez por split; a pessoa recebe o pedido no sino', async () => {
    const w = await world();
    await w.bia.call('requestPix', { splitId: w.splitId, to: w.eu });
    await w.bia.call('requestPix', { splitId: w.splitId, to: w.eu });
    await w.cat.call('requestPix', { splitId: w.splitId, to: w.eu });
    expect((await splitDoc(w.splitId)).pixAsks).toEqual({ [w.eu]: { [w.beatriz]: 'asked', [w.catarina]: 'asked' } });
    const got = await notesOf(w.lucas.uid);
    expect(got.map((n) => [n.kind, n.from, n.amount])).toEqual(expect.arrayContaining([['pixRequested', w.beatriz, 3000], ['pixRequested', w.catarina, 3000]]));
    expect(got).toHaveLength(2);
  });

  it('só quem deve, para quem já entrou e não tem chave', async () => {
    const w = await world();
    // Lucas não deve à Beatriz (é ela quem deve a ele).
    expect(await reasonOf(w.lucas.call('requestPix', { splitId: w.splitId, to: w.beatriz }))).toBe('not-involved');
    expect(await reasonOf(w.bia.call('requestPix', { splitId: w.splitId, to: w.beatriz }))).toBe('self-action');
    expect(await reasonOf(w.bia.call('requestPix', { splitId: w.splitId, to: 'ninguem' }))).toBe('invalid-input');
    await w.lucas.call('setPixKey', { key: 'lucas@exemplo.com' });
    expect(await reasonOf(w.bia.call('requestPix', { splitId: w.splitId, to: w.eu }))).toBe('invalid-input');
    const outro = await newUser();
    expect(await reasonOf(outro.call('requestPix', { splitId: w.splitId, to: w.eu }))).toBe('not-member');
    // Pix só em reais: num split em outra moeda, não há pedido de chave.
    await w.lucas.call('setPixKey', { key: null });
    await w.lucas.call('updateSplit', { splitId: w.splitId, currency: 'USD' });
    expect(await reasonOf(w.bia.call('requestPix', { splitId: w.splitId, to: w.eu }))).toBe('invalid-input');
  });

  it('nome que ninguém escolheu não recebe pedido', async () => {
    const w = await world();
    // Catarina pagou um Uber para o Lucas; depois o admin libera o nome dela (fica sem ninguém).
    const uber = { name: 'Uber', amount: 6000, payer: w.catarina, members: [w.eu, w.catarina], mode: 'equal', date: '2026-12-28', tags: [] };
    await w.lucas.call('createExpense', { splitId: w.splitId, id: `pix${Date.now().toString(36)}UBERXY`, expense: uber });
    await w.lucas.call('releaseName', { splitId: w.splitId, memberId: w.catarina });
    expect(await reasonOf(w.lucas.call('requestPix', { splitId: w.splitId, to: w.catarina }))).toBe('not-joined');
  });

  it('cadastrar a chave avisa quem pediu e tira o pedido do sino; trocar de chave depois não avisa de novo', async () => {
    const w = await world();
    await w.bia.call('requestPix', { splitId: w.splitId, to: w.eu });
    await w.lucas.call('setPixKey', { key: 'lucas@exemplo.com' });
    expect((await splitDoc(w.splitId)).pixAsks).toEqual({ [w.eu]: { [w.beatriz]: 'told' } });
    expect((await notesOf(w.bia.uid)).map((n) => [n.kind, n.from])).toEqual([['pixAdded', w.eu]]);
    expect((await notesOf(w.lucas.uid)).map((n) => [n.kind, n.hidden])).toEqual([['pixRequested', true]]);
    await w.lucas.call('setPixKey', { key: '(11) 98765-4321' });
    expect(await notesOf(w.bia.uid)).toHaveLength(1);
  });
});
