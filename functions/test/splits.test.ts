import { doc, getDoc } from 'firebase/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoCover, type JoinSplitResponse, type PreviewInviteResponse } from '@qpq/shared';
import { admin, clearFirestore, createSplit, detailsOf, memberIdByName, newUser, reasonOf, splitDoc, type TestUser } from './helpers.ts';

beforeEach(clearFirestore);

const preview = (u: TestUser, code: string) => u.call<PreviewInviteResponse>('previewInvite', { code });
const join = (u: TestUser, req: object) => u.call<JoinSplitResponse>('joinSplit', req);
const canRead = async (u: TestUser, splitId: string) =>
  getDoc(doc(u.db, `splits/${splitId}`)).then(
    () => true,
    () => false,
  );

/** Split do Lucas com Beatriz e Catarina; Bia entra como Beatriz. */
async function scenario() {
  const lucas = await newUser();
  const bia = await newUser();
  const { splitId, code } = await createSplit(lucas);
  const beatriz = await memberIdByName(splitId, 'Beatriz');
  await join(bia, { code, memberId: beatriz });
  return { lucas, bia, splitId, code, beatriz, eu: await memberIdByName(splitId, 'Lucas'), catarina: await memberIdByName(splitId, 'Catarina') };
}

describe('createSplit', () => {
  it('cria o split com quem cria como admin ligado e os outros só pelo nome', async () => {
    const lucas = await newUser();
    const { splitId, code } = await createSplit(lucas);
    const s = await splitDoc(splitId);
    expect(s.name).toBe('Ano Novo');
    expect(s.status).toBe('open');
    expect(s.code).toBe(code);
    const byName = Object.fromEntries(Object.values(s.members).map((m) => [m.name, m]));
    expect(byName.Lucas).toMatchObject({ uid: lucas.uid, admin: true, joinOrder: 0, nameKey: 'lucas' });
    expect(byName.Beatriz).toMatchObject({ uid: null, admin: false, joinOrder: 1 });
    expect(byName.Catarina).toMatchObject({ uid: null, admin: false, joinOrder: 2 });
    expect(s.uids).toEqual([lucas.uid]);
    expect(s.adminUids).toEqual([lucas.uid]);
    expect(s.nextJoinOrder).toBe(3);
    expect(s.members[s.createdBy]?.name).toBe('Lucas');
    expect((await admin().doc(`inviteCodes/${code}`).get()).data()).toEqual({ splitId });
    expect((await admin().doc(`users/${lucas.uid}`).get()).data()?.displayName).toBe('Lucas');
    expect(await canRead(lucas, splitId)).toBe(true);
  });

  it('nome repetido não salva, mesmo com acento ou maiúscula diferente', async () => {
    const lucas = await newUser();
    const err = createSplit(lucas, { people: ['Beatriz', 'beatríz'] });
    expect(await detailsOf(err)).toMatchObject({ reason: 'name-taken', name: 'beatríz' });
    expect(await reasonOf(createSplit(lucas, { selfName: 'Lucas', people: ['LUCAS'] }))).toBe('name-taken');
  });

  it('dados inválidos não salvam', async () => {
    const lucas = await newUser();
    expect(await reasonOf(createSplit(lucas, { name: '  ' }))).toBe('invalid-input');
    expect(await reasonOf(createSplit(lucas, { selfName: '' }))).toBe('invalid-input');
    expect(await reasonOf(createSplit(lucas, { emoji: '💣' }))).toBe('invalid-input');
    expect(await reasonOf(createSplit(lucas, { icon: { kind: 'icon', name: 'nada' } as never }))).toBe('invalid-input');
    expect(await reasonOf(createSplit(lucas, { icon: { kind: 'emoji', value: 'abc' } }))).toBe('invalid-input');
  });

  it('capa com ícone ou emoji; sem escolha, a automática', async () => {
    const lucas = await newUser();
    const a = await createSplit(lucas, { icon: { kind: 'emoji', value: '🦄' } });
    const b = await createSplit(lucas, { icon: { kind: 'icon', name: 'beach' } });
    const c = await createSplit(lucas, { icon: null });
    expect((await splitDoc(a.splitId) as unknown as { icon: unknown }).icon).toEqual({ kind: 'emoji', value: '🦄' });
    expect((await lucas.call<{ icon: unknown }>('previewInvite', { code: b.code })).icon).toEqual({ kind: 'icon', name: 'beach' });
    // Sem escolha nenhuma: a capa automática, fixa para o split.
    expect((await lucas.call<{ icon: unknown }>('previewInvite', { code: c.code })).icon).toEqual(autoCover(c.splitId));
    // Split antigo (só com o emoji) continua com ele.
    expect((await lucas.call<{ icon: unknown }>('previewInvite', { code: (await createSplit(lucas)).code })).icon).toEqual({ kind: 'emoji', value: '🎆' });
    expect(await reasonOf(createSplit(lucas, { people: ['ok', ''] }))).toBe('invalid-input');
  });
});

describe('previewInvite', () => {
  it('código inválido ou inexistente', async () => {
    const zé = await newUser();
    expect(await reasonOf(preview(zé, 'oi'))).toBe('invalid-code');
    expect(await reasonOf(preview(zé, 'ZZZ-ZZZ'))).toBe('invalid-code');
  });

  it('mostra os nomes e quais já foram escolhidos, aceitando o link inteiro', async () => {
    const { code, splitId } = await scenario();
    const zé = await newUser();
    const p = await preview(zé, `https://x.dev/app/#/convite/${code.toLowerCase()}`);
    expect(p.splitId).toBe(splitId);
    expect(p.name).toBe('Ano Novo');
    expect(p.createdByName).toBe('Lucas');
    expect(p.alreadyMember).toBe(false);
    expect(p.members.map((m) => [m.name, m.taken])).toEqual([
      ['Lucas', true],
      ['Beatriz', true],
      ['Catarina', false],
    ]);
  });

  it('quem já está no split é avisado', async () => {
    const { bia, code } = await scenario();
    expect((await preview(bia, code)).alreadyMember).toBe(true);
  });
});

describe('joinSplit', () => {
  it('escolher um nome livre liga a pessoa e libera a leitura do split', async () => {
    const { bia, splitId, beatriz } = await scenario();
    const s = await splitDoc(splitId);
    expect(s.members[beatriz]?.uid).toBe(bia.uid);
    expect(s.uids).toContain(bia.uid);
    expect(await canRead(bia, splitId)).toBe(true);
  });

  it('nome já escolhido trava para a primeira pessoa', async () => {
    const { code, beatriz } = await scenario();
    const zé = await newUser();
    expect(await reasonOf(join(zé, { code, memberId: beatriz }))).toBe('name-claimed');
  });

  it('duas pessoas escolhendo o mesmo nome ao mesmo tempo: só uma leva', async () => {
    const { code, catarina } = await scenario();
    const [a, b] = await Promise.all([newUser(), newUser()]);
    const results = await Promise.all([reasonOf(join(a, { code, memberId: catarina })), reasonOf(join(b, { code, memberId: catarina }))]);
    expect(results.sort()).toEqual([null, 'name-claimed'].sort());
  });

  it('"Não estou na lista": entra como participante novo, sem nome repetido', async () => {
    const { code, splitId } = await scenario();
    const zé = await newUser();
    expect(await reasonOf(join(zé, { code, newName: ' catarína ' }))).toBe('name-taken');
    const { memberId } = await join(zé, { code, newName: '  Zé   Carlos ' });
    const m = (await splitDoc(splitId)).members[memberId];
    expect(m).toMatchObject({ name: 'Zé Carlos', uid: zé.uid, admin: false, isNew: true, joinOrder: 3 });
  });

  it('quem já está no split não ganha um segundo nome', async () => {
    const { bia, code, beatriz, catarina } = await scenario();
    expect((await join(bia, { code, memberId: catarina })).memberId).toBe(beatriz);
    expect((await join(bia, { code, newName: 'Outra' })).memberId).toBe(beatriz);
  });

  it('código errado', async () => {
    const zé = await newUser();
    expect(await reasonOf(join(zé, { code: 'ZZZ-ZZZ', newName: 'Zé' }))).toBe('invalid-code');
  });
});

describe('setAdmin (decisão 4 e Fase 3)', () => {
  it('membro não promove ninguém', async () => {
    const { bia, splitId, catarina } = await scenario();
    expect(await reasonOf(bia.call('setAdmin', { splitId, memberId: catarina, admin: true }))).toBe('not-admin');
  });

  it('só quem já entrou pode virar admin', async () => {
    const { lucas, splitId, catarina } = await scenario();
    expect(await reasonOf(lucas.call('setAdmin', { splitId, memberId: catarina, admin: true }))).toBe('not-joined');
  });

  it('admin promove e tira admin de outro', async () => {
    const { lucas, bia, splitId, beatriz } = await scenario();
    await lucas.call('setAdmin', { splitId, memberId: beatriz, admin: true });
    expect((await splitDoc(splitId)).adminUids.sort()).toEqual([lucas.uid, bia.uid].sort());
    await lucas.call('setAdmin', { splitId, memberId: beatriz, admin: false });
    expect((await splitDoc(splitId)).adminUids).toEqual([lucas.uid]);
  });

  it('último admin deixa de ser admin: o papel passa para quem entrou primeiro (decisão 4, revista)', async () => {
    const { lucas, bia, splitId, beatriz, eu } = await scenario();
    await lucas.call('setAdmin', { splitId, memberId: eu, admin: false });
    const s = await splitDoc(splitId);
    expect(s.members[eu]?.admin).toBe(false);
    expect(s.members[beatriz]?.admin).toBe(true);
    expect(s.adminUids).toEqual([bia.uid]);
  });

  it('com outro admin, deixar de ser admin não passa o papel para mais ninguém', async () => {
    const { lucas, splitId, beatriz, eu, catarina, code } = await scenario();
    const cat = await newUser();
    await join(cat, { code, memberId: catarina });
    await lucas.call('setAdmin', { splitId, memberId: catarina, admin: true });
    await lucas.call('setAdmin', { splitId, memberId: eu, admin: false });
    const s = await splitDoc(splitId);
    expect(s.members[beatriz]?.admin).toBe(false);
    expect(s.adminUids).toEqual([cat.uid]);
  });

  it('sem ninguém para herdar: o split fica sem admin e o próximo que entrar vira admin', async () => {
    const lucas = await newUser();
    const { splitId, code } = await createSplit(lucas);
    const eu = await memberIdByName(splitId, 'Lucas');
    await lucas.call('setAdmin', { splitId, memberId: eu, admin: false });
    expect((await splitDoc(splitId)).adminUids).toEqual([]);
    const bia = await newUser();
    await join(bia, { code, memberId: await memberIdByName(splitId, 'Beatriz') });
    expect((await splitDoc(splitId)).adminUids).toEqual([bia.uid]);
    // Quem chega depois, já com admin, entra como membro.
    const cat = await newUser();
    await join(cat, { code, memberId: await memberIdByName(splitId, 'Catarina') });
    expect((await splitDoc(splitId)).adminUids).toEqual([bia.uid]);
  });
});

describe('releaseName (decisão 3)', () => {
  it('só admin libera, e não o próprio nome', async () => {
    const { lucas, bia, splitId, eu, beatriz } = await scenario();
    expect(await reasonOf(bia.call('releaseName', { splitId, memberId: eu }))).toBe('not-admin');
    expect(await reasonOf(lucas.call('releaseName', { splitId, memberId: eu }))).toBe('self-action');
    expect(await reasonOf(lucas.call('releaseName', { splitId, memberId: await memberIdByName(splitId, 'Catarina') }))).toBe('not-joined');
    expect(beatriz).toBeTruthy();
  });

  it('libera o nome, tira o admin e a pessoa perde o acesso; o nome continua no split', async () => {
    const { lucas, bia, splitId, code, beatriz } = await scenario();
    await lucas.call('setAdmin', { splitId, memberId: beatriz, admin: true });
    await lucas.call('releaseName', { splitId, memberId: beatriz });
    const s = await splitDoc(splitId);
    expect(s.members[beatriz]).toMatchObject({ name: 'Beatriz', uid: null, admin: false });
    expect(s.uids).not.toContain(bia.uid);
    expect(s.adminUids).toEqual([lucas.uid]);
    expect(await canRead(bia, splitId)).toBe(false);
    const zé = await newUser();
    await join(zé, { code, memberId: beatriz });
    expect((await splitDoc(splitId)).members[beatriz]?.uid).toBe(zé.uid);
  });
});

describe('leaveSplit (decisão 4)', () => {
  it('membro com saldo zero sai: desvincula, o nome fica e ele perde o acesso', async () => {
    const { bia, splitId, beatriz } = await scenario();
    await bia.call('leaveSplit', { splitId });
    const s = await splitDoc(splitId);
    expect(s.members[beatriz]).toMatchObject({ name: 'Beatriz', uid: null });
    expect(await canRead(bia, splitId)).toBe(false);
  });

  it('com saldo diferente de zero, não sai', async () => {
    const { bia, splitId, beatriz, eu } = await scenario();
    await admin().collection(`splits/${splitId}/expenses`).add({ amount: 3000, payer: eu, members: [eu, beatriz], mode: 'equal' });
    expect(await detailsOf(bia.call('leaveSplit', { splitId }))).toMatchObject({ reason: 'balance-not-zero', amount: -1500 });
  });

  it('parte paga zera o saldo e libera a saída', async () => {
    const { bia, splitId, beatriz, eu } = await scenario();
    await admin().collection(`splits/${splitId}/expenses`).add({ amount: 3000, payer: eu, members: [eu, beatriz], mode: 'equal', paid: { [beatriz]: 1500 } });
    expect(await reasonOf(bia.call('leaveSplit', { splitId }))).toBeNull();
  });

  it('último admin sai: o papel passa para quem entrou primeiro entre os que ficam', async () => {
    const { lucas, bia, splitId, beatriz, eu } = await scenario();
    await lucas.call('leaveSplit', { splitId });
    const s = await splitDoc(splitId);
    expect(s.members[eu]).toMatchObject({ uid: null, admin: false });
    expect(s.members[beatriz]?.admin).toBe(true);
    expect(s.adminUids).toEqual([bia.uid]);
  });

  it('último admin sai sem ninguém mais no split: o próximo que entrar vira admin', async () => {
    const lucas = await newUser();
    const { splitId, code } = await createSplit(lucas);
    await lucas.call('leaveSplit', { splitId });
    expect((await splitDoc(splitId)).adminUids).toEqual([]);
    const cat = await newUser();
    await join(cat, { code, newName: 'Fellipe' });
    const s = await splitDoc(splitId);
    expect(s.adminUids).toEqual([cat.uid]);
  });

  it('quem não está no split', async () => {
    const { splitId } = await scenario();
    const zé = await newUser();
    expect(await reasonOf(zé.call('leaveSplit', { splitId }))).toBe('not-member');
  });
});

describe('removeMember', () => {
  it('só admin remove, e não a si mesmo', async () => {
    const { lucas, bia, splitId, eu, catarina } = await scenario();
    expect(await reasonOf(bia.call('removeMember', { splitId, memberId: catarina }))).toBe('not-admin');
    expect(await reasonOf(lucas.call('removeMember', { splitId, memberId: eu }))).toBe('self-action');
  });

  it('bloqueia com saldo diferente de zero ("Quitem as contas antes de remover")', async () => {
    const { lucas, splitId, catarina, eu } = await scenario();
    await admin().collection(`splits/${splitId}/payments`).add({ from: catarina, to: eu, amount: 500 });
    expect(await detailsOf(lucas.call('removeMember', { splitId, memberId: catarina }))).toMatchObject({
      reason: 'balance-not-zero',
      name: 'Catarina',
      amount: 500,
    });
  });

  it('bloqueia quem aparece em alguma despesa ("Edite-as antes de remover")', async () => {
    const { lucas, splitId, catarina, eu } = await scenario();
    await admin()
      .collection(`splits/${splitId}/expenses`)
      .add({ amount: 1000, payer: eu, members: [eu], mode: 'items', items: [{ amount: 1000, members: [eu] }], rest: [catarina] });
    expect(await detailsOf(lucas.call('removeMember', { splitId, memberId: catarina }))).toMatchObject({ reason: 'in-expenses', name: 'Catarina' });
  });

  it('remove quem está quitado e fora das despesas, inclusive quem já entrou', async () => {
    const { lucas, bia, splitId, beatriz } = await scenario();
    await lucas.call('removeMember', { splitId, memberId: beatriz });
    const s = await splitDoc(splitId);
    expect(s.members[beatriz]).toBeUndefined();
    expect(s.uids).toEqual([lucas.uid]);
    expect(await canRead(bia, splitId)).toBe(false);
  });
});
