import { onCall } from 'firebase-functions/v2/https';
import { db, fail, input, ledgerOf, loadSplit, memberOf, opts, readMoney, requireMember, requireOpen, text, uidOf, type SplitData } from './common.ts';
import { col, notify } from './notifications.ts';

/**
 * Incentivo ao Pix (spec 06 e 07): quem deve pede a chave a quem ainda não cadastrou, uma vez por
 * split; quando a pessoa cadastra, quem pediu é avisado e o pedido sai do sino dela.
 */

/** "Pedir chave Pix": só quem deve à pessoa, que já entrou no split e não tem chave. */
export const requestPix = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [me] = requireMember(split, uid);
    requireOpen(split);
    const to = text(data.to);
    const target = Object.hasOwn(split.members, to) ? split.members[to]! : fail('invalid-input');
    if (to === me) fail('self-action');
    if (!target.uid) fail('not-joined');
    if (target.pix) fail('invalid-input');
    // Pix só existe em reais.
    if ((split.currency ?? 'BRL') !== 'BRL') fail('invalid-input');
    // Já pediu neste split: não pede de novo (nem enche o sino de quem recebe).
    if (split.pixAsks?.[to]?.[me]) return;
    const owed = ledgerOf(split, await readMoney(tx, ref)).M[me]?.[to] ?? 0;
    if (owed <= 0) fail('not-involved');
    tx.update(ref, { [`pixAsks.${to}.${me}`]: 'asked' });
    notify(tx, ref.id, split, to, { kind: 'pixRequested', from: me, amount: owed });
  });
  return {};
});

/**
 * A pessoa cadastrou a chave: em cada split em que pediram, avisa quem pediu ("Lucas cadastrou a
 * chave Pix") e tira do sino dela os pedidos. Chamado por `setPixKey` depois de gravar a chave.
 */
export async function answerPixAsks(uid: string): Promise<void> {
  const splits = await db().collection('splits').where('uids', 'array-contains', uid).get();
  for (const d of splits.docs) {
    await db().runTransaction(async (tx) => {
      const split = (await tx.get(d.ref)).data() as SplitData | undefined;
      const mine = split && memberOf(split, uid);
      if (!split || !mine) return;
      const asks = Object.entries(split.pixAsks?.[mine[0]] ?? {}).filter(([, v]) => v === 'asked');
      const notes = await tx.get(col().where('to', '==', uid).where('splitId', '==', d.id).where('kind', '==', 'pixRequested'));
      for (const n of notes.docs) if (!n.get('hidden')) tx.update(n.ref, { hidden: true });
      for (const [from] of asks) {
        tx.update(d.ref, { [`pixAsks.${mine[0]}.${from}`]: 'told' });
        notify(tx, d.id, split, from, { kind: 'pixAdded', from: mine[0], amount: 0 });
      }
    });
  }
}
