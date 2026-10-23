import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PROJECT } from './helpers.ts';

let env: RulesTestEnvironment;

const split = {
  name: 'Ano Novo',
  members: {
    m1: { name: 'Lucas', nameKey: 'lucas', uid: 'ana', admin: true, joinOrder: 0 },
    m2: { name: 'Bia', nameKey: 'bia', uid: 'bia', admin: false, joinOrder: 1 },
  },
  uids: ['ana', 'bia'],
  adminUids: ['ana'],
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'splits/s1'), split);
    await setDoc(doc(db, 'splits/s1/expenses/e1'), { name: 'Pizza', amount: 1000 });
    await setDoc(doc(db, 'splits/s1/payments/p1'), { from: 'm2', to: 'm1', amount: 100 });
    await setDoc(doc(db, 'inviteCodes/ABC-234'), { splitId: 's1' });
    await setDoc(doc(db, 'users/ana'), { displayName: 'Lucas' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('splits: leitura', () => {
  it('quem está no split lê; estranho e anônimo sem login não', async () => {
    await assertSucceeds(getDoc(doc(as('bia'), 'splits/s1')));
    await assertFails(getDoc(doc(as('zé'), 'splits/s1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'splits/s1')));
  });

  it('a home lista só os splits em que a pessoa está', async () => {
    await assertSucceeds(getDocs(query(collection(as('bia'), 'splits'), where('uids', 'array-contains', 'bia'))));
    await assertFails(getDocs(collection(as('bia'), 'splits')));
    await assertFails(getDocs(query(collection(as('zé'), 'splits'), where('uids', 'array-contains', 'bia'))));
  });

  it('despesas e acertos: só quem está no split lê', async () => {
    await assertSucceeds(getDocs(collection(as('bia'), 'splits/s1/expenses')));
    await assertSucceeds(getDocs(collection(as('bia'), 'splits/s1/payments')));
    await assertFails(getDocs(collection(as('zé'), 'splits/s1/expenses')));
    await assertFails(getDocs(collection(as('zé'), 'splits/s1/payments')));
  });
});

describe('splits: escrita direta é sempre negada (tudo passa por Functions)', () => {
  it('nem admin muda participantes, papéis ou espelhos', async () => {
    await assertFails(updateDoc(doc(as('ana'), 'splits/s1'), { 'members.m2.admin': true }));
    await assertFails(updateDoc(doc(as('ana'), 'splits/s1'), { adminUids: ['ana', 'bia'] }));
    await assertFails(updateDoc(doc(as('bia'), 'splits/s1'), { uids: ['ana', 'bia', 'zé'] }));
  });

  it('ninguém cria nem apaga split direto', async () => {
    await assertFails(setDoc(doc(as('ana'), 'splits/s2'), { ...split, uids: ['ana'] }));
    await assertFails(deleteDoc(doc(as('ana'), 'splits/s1')));
  });

  it('despesas e acertos: escrita fechada até as Fases 5 e 6', async () => {
    await assertFails(setDoc(doc(as('ana'), 'splits/s1/expenses/e2'), { name: 'x' }));
    await assertFails(setDoc(doc(as('ana'), 'splits/s1/payments/p2'), { amount: 1 }));
  });
});

describe('códigos de convite e usuários', () => {
  it('ninguém lê códigos de convite direto (só a Function)', async () => {
    await assertFails(getDoc(doc(as('ana'), 'inviteCodes/ABC-234')));
    await assertFails(getDocs(collection(as('ana'), 'inviteCodes')));
  });

  it('cada um lê só o próprio perfil', async () => {
    await assertSucceeds(getDoc(doc(as('ana'), 'users/ana')));
    await assertFails(getDoc(doc(as('bia'), 'users/ana')));
  });

  it('qualquer outra coleção é fechada', async () => {
    await assertFails(getDoc(doc(as('ana'), 'qualquer/coisa')));
    await assertFails(setDoc(doc(as('ana'), 'qualquer/coisa'), { a: 1 }));
  });
});

describe('perfil e preferências (Fase 4)', () => {
  it('a pessoa grava o próprio nome e preferências válidas', async () => {
    await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana'), { displayName: 'Ana', 'prefs.theme': 'dark', 'prefs.inapp': false }));
    await assertSucceeds(setDoc(doc(as('bia'), 'users/bia'), { prefs: { lang: 'en', askProof: true } }));
  });

  it('valores inválidos, campos extras e o perfil dos outros são negados', async () => {
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { 'prefs.theme': 'roxo' }));
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { 'prefs.inapp': 'sim' }));
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { displayName: '' }));
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { displayName: 'x'.repeat(41) }));
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { 'prefs.push': true }));
    await assertFails(updateDoc(doc(as('ana'), 'users/ana'), { recovery: { active: true } }));
    await assertFails(updateDoc(doc(as('bia'), 'users/ana'), { displayName: 'Bia' }));
  });

  it('tokens de recuperação e de fusão: só as Functions', async () => {
    await assertFails(getDoc(doc(as('ana'), 'recoveryTokens/x')));
    await assertFails(setDoc(doc(as('ana'), 'mergeTokens/x'), { guestUid: 'ana' }));
  });
});

describe('histórico de despesas (Fase 5)', () => {
  it('quem está no split lê; ninguém escreve', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'splits/s1/expenses/e1/history/h1'), { kind: 'created' });
    });
    await assertSucceeds(getDocs(collection(as('bia'), 'splits/s1/expenses/e1/history')));
    await assertFails(getDocs(collection(as('zé'), 'splits/s1/expenses/e1/history')));
    await assertFails(setDoc(doc(as('ana'), 'splits/s1/expenses/e1/history/h2'), { kind: 'x' }));
  });

  it('despesas continuam sem escrita direta, mesmo do autor ou do admin', async () => {
    await assertFails(updateDoc(doc(as('ana'), 'splits/s1/expenses/e1'), { name: 'x' }));
    await assertFails(setDoc(doc(as('bia'), 'splits/s1/expenses/e9'), { name: 'x', amount: 1 }));
    await assertFails(deleteDoc(doc(as('ana'), 'splits/s1/expenses/e1')));
  });
});
