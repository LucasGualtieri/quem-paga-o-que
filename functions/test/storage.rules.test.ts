import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { BUCKET, PROJECT } from './helpers.ts';

// Regras do Storage (decisão 9). Leem o split no Firestore (regras entre serviços).
let env: RulesTestEnvironment;

const split = {
  name: 'Ano Novo',
  status: 'open',
  members: {
    m1: { name: 'Lucas', uid: 'ana', admin: true, joinOrder: 0 },
    m2: { name: 'Bia', uid: 'bia', admin: false, joinOrder: 1 },
    m3: { name: 'Cat', uid: 'cat', admin: false, joinOrder: 2 },
  },
  uids: ['ana', 'bia', 'cat'],
  adminUids: ['ana'],
};

const PROOF = 'splits/s1/proofs/m2/m1/pix.jpg';
const RECEIPT = 'splits/s1/receipts/e1/nota.jpg';
const COVER = 'covers/s1/grupo.jpg';
const MB = 1024 * 1024;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('../storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'splits/s1'), split);
    const st = ctx.storage(BUCKET);
    for (const p of [PROOF, RECEIPT, COVER, 'users/bia/foto.jpg']) await st.ref(p).put(new Uint8Array(8), { contentType: 'image/jpeg' }).then();
  });
});

const storage = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage(BUCKET);
const read = (uid: string | null, path: string) => storage(uid).ref(path).getMetadata();
const put = (uid: string | null, path: string, size = 1024, contentType = 'image/jpeg') =>
  storage(uid).ref(path).put(new Uint8Array(size), { contentType }).then();
const remove = (uid: string | null, path: string) => storage(uid).ref(path).delete();

async function visibility(value: string) {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'splits/s1'), { proofVisibility: value }));
}

describe('comprovantes de pagamento', () => {
  it('"Todo o split" (padrão): qualquer participante vê; estranho não', async () => {
    await assertSucceeds(read('cat', PROOF));
    await assertSucceeds(read('bia', PROOF));
    await assertFails(read('zé', PROOF));
    await assertFails(read(null, PROOF));
  });

  it('"Só os envolvidos e admins": as duas pessoas e o admin veem; o resto não', async () => {
    await visibility('involved');
    await assertSucceeds(read('bia', PROOF));
    await assertSucceeds(read('ana', PROOF));
    await assertFails(read('cat', PROOF));
  });

  it('envia quem está no pagamento ou admin; só imagem de até 2 MB; split aberto', async () => {
    await assertSucceeds(put('bia', 'splits/s1/proofs/m2/m1/novo.jpg'));
    await assertSucceeds(put('ana', 'splits/s1/proofs/m2/m3/novo.jpg'));
    await assertFails(put('cat', 'splits/s1/proofs/m2/m1/novo.jpg'));
    await assertFails(put('bia', 'splits/s1/proofs/m2/m1/doc.pdf', 1024, 'application/pdf'));
    await assertFails(put('bia', 'splits/s1/proofs/m2/m1/grande.jpg', 2 * MB + 1));
    await assertFails(put('zé', 'splits/s1/proofs/m2/m1/novo.jpg'));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'splits/s1'), { status: 'done' }));
    await assertFails(put('bia', 'splits/s1/proofs/m2/m1/depois.jpg'));
  });

  it('ninguém troca nem apaga pelo app (só as Functions)', async () => {
    await assertFails(put('bia', PROOF));
    await assertFails(remove('bia', PROOF));
    await assertFails(remove('ana', PROOF));
  });
});

describe('comprovante da despesa e capa', () => {
  it('comprovante da despesa: todo o split vê, mesmo com "Só os envolvidos"', async () => {
    await visibility('involved');
    await assertSucceeds(read('cat', RECEIPT));
    await assertFails(read('zé', RECEIPT));
    await assertSucceeds(put('cat', 'splits/s1/receipts/e2/nota.jpg'));
    await assertFails(put('zé', 'splits/s1/receipts/e2/nota.jpg'));
    await assertFails(put('cat', RECEIPT));
  });

  it('capa: participantes veem; só admin envia', async () => {
    await assertSucceeds(read('cat', COVER));
    await assertFails(read('zé', COVER));
    await assertSucceeds(put('ana', 'covers/s1/nova.jpg'));
    await assertFails(put('bia', 'covers/s1/nova.jpg'));
  });
});

describe('foto de perfil', () => {
  it('quem tem login vê; só o dono envia e apaga', async () => {
    await assertSucceeds(read('cat', 'users/bia/foto.jpg'));
    await assertFails(read(null, 'users/bia/foto.jpg'));
    await assertSucceeds(put('bia', 'users/bia/nova.jpg'));
    await assertFails(put('cat', 'users/bia/nova.jpg'));
    await assertFails(put('bia', 'users/bia/doc.txt', 10, 'text/plain'));
    await assertSucceeds(remove('bia', 'users/bia/foto.jpg'));
  });
});

describe('caminhos desconhecidos', () => {
  it('fechados', async () => {
    await assertFails(put('ana', 'qualquer/coisa.jpg'));
    await assertFails(read('ana', 'splits/s1/outra/coisa.jpg'));
  });
});
