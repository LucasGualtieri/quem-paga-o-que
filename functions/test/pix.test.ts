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
