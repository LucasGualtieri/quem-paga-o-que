// Split de exemplo para testar à mão nos emuladores (npm run dev:lan chama sozinho).
// Cria "Rolê de teste" com Beatriz, Catarina e Fillipe, despesas e saldos para cima e para
// baixo (no modo simplificado e no detalhado), e deixa o nome "Lucas" livre e sem admin: quem entrar pelo convite como Lucas vira admin.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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

async function seed(name, icon, mode = 'simple') {
  const bia = await user();
  const { splitId, code } = await bia('createSplit', { name, icon, selfName: 'Beatriz', people: ['Lucas', 'Catarina', 'Fillipe'] });
  const preview = await bia('previewInvite', { code });
  const m = Object.fromEntries(preview.members.map((x) => [x.name, x.id]));
  const fi = await user();
  await fi('joinSplit', { code, memberId: m.Fillipe });
  // Beatriz tem chave Pix (o Lucas copia o Pix dela); Fillipe não (o Lucas pode pedir a chave).
  await bia('setPixKey', { key: 'beatriz@exemplo.com' });
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
  // Detalhado: Fillipe acerta com a Beatriz, e o acerto marca as partes do par ("Paga no acerto").
  if (mode === 'detailed') {
    await bia('setPayMode', { splitId, mode });
    await fi('createPayment', { splitId, id: id(), from: m.Fillipe, to: m.Beatriz });
  }
  // Ninguém ligado é admin: quem entrar como Lucas vira admin (decisão 4).
  const ref = db.doc(`splits/${splitId}`);
  const snap = await ref.get();
  const members = snap.get('members');
  for (const k of Object.keys(members)) members[k].admin = false;
  await ref.update({ members, adminUids: [] });
  return code;
}

/**
 * Split já quitado há 2 dias (Hotel pago pelo Lucas; Beatriz e Fillipe acertaram, esperando
 * confirmação): quem entrar como Lucas vira admin e já vê a sugestão de finalizar.
 */
async function seedSettled(name) {
  const bia = await user();
  const { splitId, code } = await bia('createSplit', { name, icon: { kind: 'icon', name: 'bed' }, selfName: 'Beatriz', people: ['Lucas', 'Fillipe'] });
  const preview = await bia('previewInvite', { code });
  const m = Object.fromEntries(preview.members.map((x) => [x.name, x.id]));
  const fi = await user();
  await fi('joinSplit', { code, memberId: m.Fillipe });
  const trio = [m.Lucas, m.Beatriz, m.Fillipe];
  await bia('createExpense', { splitId, id: id(), expense: { name: 'Hotel', amount: 30000, payer: m.Lucas, members: trio, mode: 'equal', date: '2026-10-20', tags: ['stay'] } });
  await bia('createPayment', { splitId, id: id(), from: m.Beatriz, to: m.Lucas });
  await fi('createPayment', { splitId, id: id(), from: m.Fillipe, to: m.Lucas });
  const ref = db.doc(`splits/${splitId}`);
  const members = (await ref.get()).get('members');
  for (const k of Object.keys(members)) members[k].admin = false;
  // Quitado há 2 dias: passa das 24 h da sugestão, ainda longe dos 7 dias da finalização automática.
  await ref.update({ members, adminUids: [], moneyAt: Timestamp.fromMillis(Date.now() - 2 * 24 * 3600_000) });
  return code;
}

/**
 * Viagem com hospedagem parcelada (spec 05), igual à viagem de ano novo: Airbnb de R$ 2.500,00
 * pago pela Beatriz em 4x, vencendo todo dia 2, dividido igualmente entre os quatro. A próxima
 * parcela já está no saldo; as outras aparecem como parcelas futuras. Quem entrar como Lucas
 * vira admin.
 */
async function seedInstallments(name) {
  const bia = await user();
  const { splitId, code } = await bia('createSplit', { name, icon: { kind: 'emoji', value: '😀' }, selfName: 'Beatriz', people: ['Lucas', 'Catarina', 'Fillipe'] });
  const preview = await bia('previewInvite', { code });
  const m = Object.fromEntries(preview.members.map((x) => [x.name, x.id]));
  const fi = await user();
  await fi('joinSplit', { code, memberId: m.Fillipe });
  // Próximo dia 2 (horário de Brasília): a 1ª parcela ainda vai vencer e já está no saldo.
  const now = new Date(Date.now() - 3 * 3600_000);
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() < 2 ? 0 : 1), 2)).toISOString().slice(0, 10);
  const all = [m.Lucas, m.Beatriz, m.Catarina, m.Fillipe];
  const today = now.toISOString().slice(0, 10);
  await bia('createExpense', { splitId, id: id(), expense: { name: 'Airbnb', amount: 250000, payer: m.Beatriz, members: all, mode: 'equal', date: today, tags: ['stay'], icon: { kind: 'icon', name: 'home' }, installments: { count: 4, first } } });
  const ref = db.doc(`splits/${splitId}`);
  const members = (await ref.get()).get('members');
  for (const k of Object.keys(members)) members[k].admin = false;
  await ref.update({ members, adminUids: [] });
  return code;
}

const ip = process.argv[2] ?? 'localhost';
// `--so-parcelas`: cria só a viagem parcelada, na infra que já está rodando (sem apagar nada).
if (process.argv.includes('--so-parcelas')) {
  const p = await seedInstallments('Ano Novo Amigubis (celular)');
  const d = await seedInstallments('Ano Novo Amigubis (computador)');
  console.log('\nViagem com hospedagem parcelada (Airbnb em 4x). Entre como "Lucas":');
  console.log(`  Celular:    http://${ip}:5173/#/convite/${p}`);
  console.log(`  Computador: http://localhost:5173/#/convite/${d}\n`);
  process.exit(0);
}
const phone = await seed('Rolê de teste (celular)', { kind: 'icon', name: 'beach' });
const desk = await seed('Rolê de teste (computador)', { kind: 'icon', name: 'pizza' });
const phoneDet = await seed('Rolê detalhado (celular)', { kind: 'icon', name: 'tent' }, 'detailed');
const deskDet = await seed('Rolê detalhado (computador)', { kind: 'icon', name: 'music' }, 'detailed');
const phoneDone = await seedSettled('Viagem quitada (celular)');
const deskDone = await seedSettled('Viagem quitada (computador)');
const phoneInst = await seedInstallments('Ano Novo Amigubis (celular)');
const deskInst = await seedInstallments('Ano Novo Amigubis (computador)');
console.log('\nPronto. Entre como "Lucas" (você vira admin):');
console.log(`  Celular (mesma rede Wi-Fi): http://${ip}:5173/#/convite/${phone}`);
console.log(`  Computador:                 http://localhost:5173/#/convite/${desk}`);
console.log('Mesmo rolê no modo de pagamento detalhado (Fillipe já acertou com a Beatriz):');
console.log(`  Celular:    http://${ip}:5173/#/convite/${phoneDet}`);
console.log(`  Computador: http://localhost:5173/#/convite/${deskDet}`);
console.log('Split quitado há 2 dias (sugestão de finalizar):');
console.log(`  Celular:    http://${ip}:5173/#/convite/${phoneDone}`);
console.log(`  Computador: http://localhost:5173/#/convite/${deskDone}`);
console.log('Viagem com hospedagem parcelada (Airbnb em 4x, a próxima parcela já no saldo):');
console.log(`  Celular:    http://${ip}:5173/#/convite/${phoneInst}`);
console.log(`  Computador: http://localhost:5173/#/convite/${deskInst}\n`);
process.exit(0);
