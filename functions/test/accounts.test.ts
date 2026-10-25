import { EmailAuthProvider, linkWithCredential, signInWithCustomToken } from 'firebase/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateRecoveryResponse, PreviewMergeResponse, RedeemRecoveryResponse, RegenerateCodeResponse } from '@qpq/shared';
import { admin, clearAuth, clearFirestore, createSplit, memberIdByName, newAccount, newDevice, newUser, reasonOf, splitDoc, type TestUser } from './helpers.ts';

beforeEach(async () => {
  await clearFirestore();
  await clearAuth();
});

const createLink = (u: TestUser) => u.call<CreateRecoveryResponse>('createRecoveryLink', {});

describe('link de recuperação (decisão 6)', () => {
  it('devolve a identidade do convidado em outro aparelho, mais de uma vez', async () => {
    const guest = await newUser();
    const { token } = await createLink(guest);
    expect(token.length).toBeGreaterThanOrEqual(40);
    for (let i = 0; i < 2; i++) {
      const device = newDevice();
      const { customToken } = await device.call<RedeemRecoveryResponse>('redeemRecovery', { token });
      const { user } = await signInWithCustomToken(device.auth, customToken);
      expect(user.uid).toBe(guest.uid);
    }
    expect((await admin().doc(`users/${guest.uid}`).get()).get('recovery.active')).toBe(true);
  });

  it('quem voltou pelo link continua convidado (pode gerar outro link e juntar contas)', async () => {
    const guest = await newUser();
    const { token } = await createLink(guest);
    const device = newDevice();
    const { customToken } = await device.call<RedeemRecoveryResponse>('redeemRecovery', { token });
    await signInWithCustomToken(device.auth, customToken);
    expect(await reasonOf(device.call('createRecoveryLink', {}))).toBeNull();
    expect(await reasonOf(device.call('prepareMerge', {}))).toBeNull();
  });

  it('gerar outro revoga o anterior', async () => {
    const guest = await newUser();
    const first = await createLink(guest);
    const second = await createLink(guest);
    const device = newDevice();
    expect(await reasonOf(device.call('redeemRecovery', { token: first.token }))).toBe('invalid-recovery');
    expect(await reasonOf(device.call('redeemRecovery', { token: second.token }))).toBeNull();
  });

  it('revogar em Sua conta derruba o link', async () => {
    const guest = await newUser();
    const { token } = await createLink(guest);
    await guest.call('revokeRecovery', {});
    expect(await reasonOf(newDevice().call('redeemRecovery', { token }))).toBe('invalid-recovery');
    expect((await admin().doc(`users/${guest.uid}`).get()).get('recovery.active')).toBe(false);
  });

  it('salvar a conta revoga o link (decisão 6)', async () => {
    const guest = await newUser();
    const { token } = await createLink(guest);
    await linkWithCredential(guest.auth.currentUser!, EmailAuthProvider.credential('salvo@exemplo.com', 'senha-123'));
    expect(await reasonOf(newDevice().call('redeemRecovery', { token }))).toBe('invalid-recovery');
  });

  it('só convidado cria link; token inventado não vale', async () => {
    const account = await newAccount();
    expect(await reasonOf(createLink(account))).toBe('not-guest');
    expect(await reasonOf(newDevice().call('redeemRecovery', { token: 'x'.repeat(43) }))).toBe('invalid-recovery');
  });
});

describe('gerar novo código de convite (decisão 6)', () => {
  it('só admin; o código antigo para na hora e quem já entrou continua', async () => {
    const lucas = await newUser();
    const { splitId, code } = await createSplit(lucas);
    const bia = await newUser();
    await bia.call('joinSplit', { code, memberId: await memberIdByName(splitId, 'Beatriz') });

    expect(await reasonOf(bia.call('regenerateCode', { splitId }))).toBe('not-admin');
    const { code: next } = await lucas.call<RegenerateCodeResponse>('regenerateCode', { splitId });
    expect(next).not.toBe(code);
    expect((await splitDoc(splitId)).code).toBe(next);
    const zé = await newUser();
    expect(await reasonOf(zé.call('previewInvite', { code }))).toBe('invalid-code');
    expect(await reasonOf(zé.call('previewInvite', { code: next }))).toBeNull();
    expect((await splitDoc(splitId)).uids).toContain(bia.uid);
  });
});

describe('fusão convidado → conta existente (decisão 5)', () => {
  it('prepareMerge só como convidado', async () => {
    const account = await newAccount();
    expect(await reasonOf(account.call('prepareMerge', {}))).toBe('not-guest');
  });

  it('sem conflito: os nomes do convidado passam para a conta e o convidado some', async () => {
    const guest = await newUser();
    const { splitId } = await createSplit(guest, { selfName: 'Lucas G.' });
    const { token } = await guest.call<{ token: string }>('prepareMerge', {});
    const account = await newAccount();

    const preview = await account.call<PreviewMergeResponse>('previewMerge', { token });
    expect(preview).toEqual({ splitCount: 1, conflicts: [] });
    await account.call('mergeGuest', { token, keep: {} });

    const s = await splitDoc(splitId);
    const lucas = s.members[await memberIdByName(splitId, 'Lucas G.')];
    expect(lucas).toMatchObject({ uid: account.uid, admin: true });
    expect(s.uids).toEqual([account.uid]);
    expect(s.adminUids).toEqual([account.uid]);
    expect(await reasonOf(account.call('mergeGuest', { token, keep: {} }))).toBe('invalid-merge');
    // A identidade de convidado deixa de existir.
    expect((await admin().doc(`users/${guest.uid}`).get()).exists).toBe(false);
  });

  it('mesmo split dos dois lados: pergunta qual manter; o outro fica livre e o admin é herdado', async () => {
    const account = await newAccount();
    const { splitId, code } = await createSplit(account, { selfName: 'Lucas', people: ['Bia', 'Lucas G.'] });
    const guest = await newUser();
    const guestMember = await memberIdByName(splitId, 'Lucas G.');
    await guest.call('joinSplit', { code, memberId: guestMember });

    const { token } = await guest.call<{ token: string }>('prepareMerge', {});
    const preview = await account.call<PreviewMergeResponse>('previewMerge', { token });
    expect(preview.splitCount).toBe(1);
    expect(preview.conflicts).toEqual([
      { splitId, splitName: 'Ano Novo', icon: { kind: 'emoji', value: '🎆' }, guest: { id: guestMember, name: 'Lucas G.' }, account: { id: await memberIdByName(splitId, 'Lucas'), name: 'Lucas' } },
    ]);

    // Sem escolha para o conflito, não junta.
    expect(await reasonOf(account.call('mergeGuest', { token, keep: {} }))).toBe('merge-choice');

    // Fica o nome do convidado; o da conta (que era admin) fica livre e o admin passa para o nome que fica.
    await account.call('mergeGuest', { token, keep: { [splitId]: guestMember } });
    const s = await splitDoc(splitId);
    expect(s.members[guestMember]).toMatchObject({ uid: account.uid, admin: true });
    expect(s.members[await memberIdByName(splitId, 'Lucas')]).toMatchObject({ uid: null, admin: false });
    expect(s.adminUids).toEqual([account.uid]);
  });

  it('token de outra pessoa ou vencido não vale', async () => {
    const guest = await newUser();
    const { token } = await guest.call<{ token: string }>('prepareMerge', {});
    // O próprio convidado não pode usar o token.
    expect(await reasonOf(guest.call('previewMerge', { token }))).toBe('invalid-merge');
    await admin()
      .collection('mergeTokens')
      .get()
      .then((s) => Promise.all(s.docs.map((d) => d.ref.update({ expiresAt: new Date(Date.now() - 1000) }))));
    const account = await newAccount();
    expect(await reasonOf(account.call('previewMerge', { token }))).toBe('invalid-merge');
  });

  it('o link de recuperação do convidado para de valer depois da fusão', async () => {
    const guest = await newUser();
    const { token: link } = await createLink(guest);
    const { token } = await guest.call<{ token: string }>('prepareMerge', {});
    const account = await newAccount();
    await account.call('mergeGuest', { token, keep: {} });
    expect(await reasonOf(newDevice().call('redeemRecovery', { token: link }))).toBe('invalid-recovery');
  });

  it('nome da conta vazio herda o do convidado; preferências da conta valem', async () => {
    const guest = await newUser();
    await createSplit(guest, { selfName: 'Lucas G.' });
    await admin().doc(`users/${guest.uid}`).set({ prefs: { theme: 'dark' } }, { merge: true });
    const account = await newAccount();
    await admin().doc(`users/${account.uid}`).set({ prefs: { theme: 'light' } });
    const { token } = await guest.call<{ token: string }>('prepareMerge', {});
    await account.call('mergeGuest', { token, keep: {} });
    const doc = (await admin().doc(`users/${account.uid}`).get()).data();
    expect(doc).toMatchObject({ displayName: 'Lucas G.', prefs: { theme: 'light' } });
  });
});
