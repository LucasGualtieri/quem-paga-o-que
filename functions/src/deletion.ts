import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { EMPTY_SPLIT_DAYS, splitCover, type DeletedSplitData } from '@qpq/shared';
import { bucket, db, input, loadSplit, opts, REGION, requireAdmin, uidOf, type SplitData } from './common.ts';
import { col, noteData } from './notifications.ts';

/**
 * Excluir o split inteiro (spec 04): um admin exclui, ou a rotina diária apaga o split que ficou
 * 15 dias sem ninguém ligado. Some de vez: despesas, acertos, histórico, notificações, comprovantes,
 * capa e o convite. Fica só a lápide, para o link antigo explicar o que aconteceu.
 */

const DAY = 24 * 60 * 60 * 1000;

async function deleteRefs(refs: readonly DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db().batch();
    for (const r of refs.slice(i, i + 400)) batch.delete(r);
    await batch.commit();
  }
}

async function deletePrefix(prefix: string): Promise<void> {
  const [files] = await bucket().getFiles({ prefix });
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
}

/** Apaga tudo do split; `by` (memberId de quem excluiu) avisa os outros no sino. */
export async function destroySplit(ref: DocumentReference, split: SplitData, cause: DeletedSplitData['cause'], by: string | null): Promise<void> {
  const id = ref.id;
  const tomb: DeletedSplitData & { at: FieldValue } = { name: split.name, icon: splitCover({ ...split, id }), cause, byName: by ? (split.members[by]?.name ?? null) : null, at: FieldValue.serverTimestamp() };
  await db().doc(`deletedSplits/${id}`).set(tomb);
  // O convite continua existindo só para dizer que o split foi apagado.
  await db().doc(`inviteCodes/${split.code}`).set({ splitId: id, gone: true });
  const [notes, proofs] = await Promise.all([col().where('splitId', '==', id).get(), db().collection('proofs').where('splitId', '==', id).get()]);
  await deleteRefs([...notes.docs, ...proofs.docs].map((d) => d.ref));
  await db().recursiveDelete(ref);
  await Promise.all([deletePrefix(`splits/${id}/`), deletePrefix(`covers/${id}/`)]);
  if (!by) return;
  const batch = db().batch();
  for (const member of Object.keys(split.members)) {
    const data = member === by ? null : noteData(id, split, member, { kind: 'splitDeleted', from: by, amount: 0 });
    if (data) batch.create(col().doc(), data);
  }
  await batch.commit();
}

/** Só admin; com dinheiro pendente também (a folha mostra o que ficou pendente antes). */
export const deleteSplit = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const { ref, split, me } = await db().runTransaction(async (tx) => {
    const { ref, split } = await loadSplit(tx, data.splitId);
    const [me] = requireAdmin(split, uid);
    return { ref, split, me };
  });
  await destroySplit(ref, split, 'admin', me);
  return { ok: true };
});

/** Splits sem ninguém ligado há `EMPTY_SPLIT_DAYS` dias (contados de quando a última pessoa saiu). */
export async function purgeEmptySplitsAt(now: number): Promise<void> {
  const cutoff = Timestamp.fromMillis(now - EMPTY_SPLIT_DAYS * DAY);
  const snap = await db().collection('splits').where('emptySince', '<=', cutoff).get();
  for (const d of snap.docs) {
    const split = d.data() as SplitData;
    if (split.uids.length === 0) await destroySplit(d.ref, split, 'empty', null);
  }
}

export const purgeEmptySplits = onSchedule({ schedule: 'every day 04:30', timeZone: 'America/Sao_Paulo', region: REGION }, async () => {
  await purgeEmptySplitsAt(Date.now());
});
