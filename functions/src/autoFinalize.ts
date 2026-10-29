import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { AUTO_FINALIZE_DAYS, finalizeClockStart } from '@qpq/shared';
import { db, ledgerOf, readMoney, REGION, type SplitData } from './common.ts';
import { notify } from './notifications.ts';
import { purgeSplitProofs } from './proofs.ts';

/**
 * Finalização automática (spec 04): split aberto, com despesa, todos com saldo zero e sem mudança
 * no dinheiro há AUTO_FINALIZE_DAYS dias (contados do fim de "Termina em", se for depois). Confirmações pendentes não impedem. Todos são avisados
 * no sino; um admin pode reabrir (e aí a contagem recomeça).
 */

const DAY = 24 * 60 * 60 * 1000;

export async function autoFinalizeAt(now: number): Promise<string[]> {
  const cutoff = Timestamp.fromMillis(now - AUTO_FINALIZE_DAYS * DAY);
  const snap = await db().collection('splits').where('status', '==', 'open').where('moneyAt', '<=', cutoff).get();
  const done: string[] = [];
  for (const d of snap.docs) {
    const finalized = await db().runTransaction(async (tx) => {
      const split = (await tx.get(d.ref)).data() as (SplitData & { moneyAt?: Timestamp }) | undefined;
      if (!split || split.status !== 'open' || !split.moneyAt) return false;
      // Com "Termina em", a contagem só começa depois do fim do evento.
      if (finalizeClockStart(split.moneyAt.toMillis(), split.endsOn) > cutoff.toMillis()) return false;
      const money = await readMoney(tx, d.ref);
      if (money.expenses.length === 0) return false;
      if (Object.values(ledgerOf(split, money).net).some((v) => v !== 0)) return false;
      tx.update(d.ref, { status: 'done', doneAt: FieldValue.serverTimestamp(), autoFinalized: true });
      for (const member of Object.keys(split.members)) notify(tx, d.id, split, member, { kind: 'autoFinalized', from: '', amount: 0 });
      return true;
    });
    if (finalized) {
      // Como no Finalizar do admin: os comprovantes saem na hora (decisão 9).
      await purgeSplitProofs(d.id);
      done.push(d.id);
    }
  }
  return done;
}

export const autoFinalizeSplits = onSchedule({ schedule: 'every 1 hours', timeZone: 'America/Sao_Paulo', region: REGION }, async () => {
  await autoFinalizeAt(Date.now());
});
