import { beforeEach, describe, expect, it } from 'vitest';
import { avatarPath } from '@qpq/shared';
import { admin, clearFirestore, clearStorage, createSplit, memberIdByName, newUser, reasonOf, splitDoc, upload } from './helpers.ts';

// Foto de perfil: fica no perfil e é espelhada nos splits, para quem divide o split ver no avatar.
beforeEach(async () => {
  await clearFirestore();
  await clearStorage();
});

const memberPhoto = async (splitId: string, name: string) => ((await splitDoc(splitId)).members[await memberIdByName(splitId, name)] as unknown as { photo?: string | null }).photo ?? null;

describe('setProfilePhoto', () => {
  it('guarda no perfil e espelha nos splits em que a pessoa está; null tira', async () => {
    const lucas = await newUser();
    const a = await createSplit(lucas);
    const b = await createSplit(lucas, { name: 'Viagem' });
    const path = await upload(lucas, avatarPath(lucas.uid, 'eu.jpg'));
    await lucas.call('setProfilePhoto', { path });
    expect((await admin().doc(`users/${lucas.uid}`).get()).get('photoPath')).toBe(path);
    expect(await memberPhoto(a.splitId, 'Lucas')).toBe(path);
    expect(await memberPhoto(b.splitId, 'Lucas')).toBe(path);
    expect(await memberPhoto(a.splitId, 'Beatriz')).toBeNull();
    await lucas.call('setProfilePhoto', { path: null });
    expect(await memberPhoto(a.splitId, 'Lucas')).toBeNull();
  });

  it('recusa caminho de outra pessoa ou arquivo que não foi enviado', async () => {
    const lucas = await newUser();
    const bia = await newUser();
    const other = await upload(bia, avatarPath(bia.uid, 'bia.jpg'));
    expect(await reasonOf(lucas.call('setProfilePhoto', { path: other }))).toBe('proof-invalid');
    expect(await reasonOf(lucas.call('setProfilePhoto', { path: avatarPath(lucas.uid, 'nada.jpg') }))).toBe('proof-invalid');
  });

  it('quem cria ou entra já leva a foto; quem sai deixa de mostrar', async () => {
    const lucas = await newUser();
    const bia = await newUser();
    const photo = await upload(bia, avatarPath(bia.uid, 'bia.jpg'));
    await bia.call('setProfilePhoto', { path: photo });
    const mine = await upload(lucas, avatarPath(lucas.uid, 'eu.jpg'));
    await lucas.call('setProfilePhoto', { path: mine });
    const { splitId, code } = await createSplit(lucas);
    expect(await memberPhoto(splitId, 'Lucas')).toBe(mine);
    await bia.call('joinSplit', { code, memberId: await memberIdByName(splitId, 'Beatriz') });
    expect(await memberPhoto(splitId, 'Beatriz')).toBe(photo);
    await bia.call('leaveSplit', { splitId });
    expect(await memberPhoto(splitId, 'Beatriz')).toBeNull();
  });
});
