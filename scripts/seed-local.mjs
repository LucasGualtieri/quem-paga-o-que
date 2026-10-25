// Split de exemplo para testar à mão nos emuladores (npm run dev:lan chama sozinho).
// Cria "Rolê de teste" com Beatriz, Catarina e Fillipe, despesas e saldos para cima e para
// baixo, e deixa o nome "Lucas" livre e sem admin: quem entrar pelo convite como Lucas vira admin.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const HOST = '127.0.0.1';
const PROJECT = 'demo-qpq';
process.env.FIRESTORE_EMULATOR_HOST ??= `${HOST}:8080`;
const db = getFirestore(adminInit({ projectId: PROJECT }, 'seed-admin'));

let n = 0;
async function user() {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' }, `seed-${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const fns = getFunctions(app, 'us-east1');
  connectFunctionsEmulator(fns, HOST, 5001);
  await signInAnonymously(auth);
  return async (name, data) => (await httpsCallable(fns, name)(data)).data;
}

const id = () => `seed${Date.now().toString(36)}${(n++).toString(36)}xyz`;

async function seed(name, icon) {
  const bia = await user();
  const { splitId, code } = await bia('createSplit', { name, icon, selfName: 'Beatriz', people: ['Lucas', 'Catarina', 'Fillipe'] });
  const preview = await bia('previewInvite', { code });
  const m = Object.fromEntries(preview.members.map((x) => [x.name, x.id]));
  const fi = await user();
  await fi('joinSplit', { code, memberId: m.Fillipe });
  const all = [m.Lucas, m.Beatriz, m.Catarina, m.Fillipe];
  const add = (name, amount, payer, members, tags, date) => bia('createExpense', { splitId, id: id(), expense: { name, amount, payer, members, mode: 'equal', date, tags } });
  // Pizza: você deve à Beatriz, mas a Gasolina vira o par (a Pizza aparece "compensado no saldo").
  await add('Pizza', 9000, m.Beatriz, all, ['food'], '2026-10-23');
  await add('Gasolina', 12000, m.Lucas, [m.Lucas, m.Beatriz, m.Catarina], ['transport'], '2026-10-24');
  await add('Mercado', 6000, m.Fillipe, [m.Lucas, m.Fillipe], ['food'], '2026-10-24');
  await add('Uber', 3000, m.Lucas, [m.Lucas, m.Catarina], ['transport'], '2026-10-25');
  // Por itens com resto da compra (o detalhe mostra a divisão de cada item e do resto).
  await bia('createExpense', {
    splitId,
    id: id(),
    expense: {
      name: 'Mercearia',
      amount: 20000,
      payer: m.Beatriz,
      members: all,
      mode: 'items',
      date: '2026-10-25',
      tags: ['food'],
      items: [
        { name: 'Xeque Mate', amount: 5000, members: [m.Lucas, m.Beatriz] },
        { name: 'Pão de sal', amount: 2500, members: [m.Lucas, m.Beatriz, m.Fillipe], mode: 'frac', w: { [m.Lucas]: 2, [m.Beatriz]: 2, [m.Fillipe]: 1 } },
      ],
      rest: all,
    },
  });
  // Ninguém ligado é admin: quem entrar como Lucas vira admin (decisão 4).
  const ref = db.doc(`splits/${splitId}`);
  const snap = await ref.get();
  const members = snap.get('members');
  for (const k of Object.keys(members)) members[k].admin = false;
  await ref.update({ members, adminUids: [] });
  return code;
}

const ip = process.argv[2] ?? 'localhost';
const phone = await seed('Rolê de teste (celular)', { kind: 'icon', name: 'beach' });
const desk = await seed('Rolê de teste (computador)', { kind: 'icon', name: 'pizza' });
console.log('\nPronto. Entre como "Lucas" (você vira admin):');
console.log(`  Celular (mesma rede Wi-Fi): http://${ip}:5173/#/convite/${phone}`);
console.log(`  Computador:                 http://localhost:5173/#/convite/${desk}\n`);
process.exit(0);
