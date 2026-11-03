import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const db = getFirestore(initializeApp({ projectId: 'demo-qpq' }));
const splits = await db.collection('splits').where('name', 'in', ['Ano Novo Amigubis (celular)', 'Ano Novo Amigubis (computador)']).get();
for (const s of splits.docs) {
  const names = Object.fromEntries(Object.entries(s.get('members')).map(([id, m]) => [id, m.name]));
  for (const e of (await s.ref.collection('expenses').get()).docs) {
    const d = e.data();
    const adv = Object.fromEntries(Object.entries(d.advanced ?? {}).map(([id, n]) => [names[id], n]));
    const hist = (await e.ref.collection('history').orderBy('seq').get()).docs.map((h) => `${h.get('kind')}:${names[h.get('by')]}${h.get('memberId') ? '→' + names[h.get('memberId')] : ''}${h.get('to') !== undefined ? '=' + h.get('to') : ''}`);
    console.log(s.get('name'), '|', d.name, d.installments, '| advanced:', JSON.stringify(adv), '| history:', hist.join(', '));
  }
}
process.exit(0);
