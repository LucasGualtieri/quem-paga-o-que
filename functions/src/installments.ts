import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { dueCount, installmentDates, shares, splitInstallments } from '@qpq/calc';
import { brasiliaDay } from '@qpq/shared';
import { db, fail, input, loadSplit, opts, orderOf, requireMember, requireOpen, text, today, touchMoney, uidOf, type SplitData } from './common.ts';
import { addHistory, loadExpense, type StoredExpense } from './expenses.ts';
import { notify } from './notifications.ts';

/**
 * Despesa parcelada (spec 05): cada parcela só entra no saldo quando vence. "Antecipar" faz as
 * parcelas de uma pessoa contarem antes; a rotina de hora em hora avisa quem deve quando uma vence.
 */

/** Antecipar a próxima parcela (ou todas) de `memberId`: a própria pessoa, quem pagou ou admin. */
export const advanceInstallments = onCall(opts, async (req) => {
  const uid = uidOf(req);
  const data = input(req);
  const splitId = text(data.splitId);
  return db().runTransaction(async (tx) => {
    const { split } = await loadSplit(tx, splitId);
    const [me, mine] = requireMember(split, uid);
    requireOpen(split);
    const { ref, e } = await loadExpense(tx, splitId, data.expenseId);
    if (e.deletedAt) fail('expense-missing');
    const plan = e.installments;
    if (!plan) fail('invalid-input');
    const id = text(data.memberId);
    if (id === e.payer || !((shares(e, orderOf(split))[id] ?? 0) > 0)) fail('invalid-input');
    if (me !== id && me !== e.payer && !mine.admin) fail('not-involved');
    const now = dueCount(e, id, today());
    if (now >= plan.count) return { advanced: plan.count };
    const advanced = data.all === true ? plan.count : now + 1;
    const version = e.version + 1;
    tx.update(ref, { [`advanced.${id}`]: advanced, version, updatedBy: me, updatedAt: FieldValue.serverTimestamp() });
    touchMoney(tx, ref);
    await addHistory(tx, ref, { seq: version, kind: 'advanced', by: me, memberId: id, to: advanced });
    return { advanced };
  });
});

type Notified = StoredExpense & { instNext?: string | null; instN?: number | null };

/**
 * Parcelas que venceram até `now` (horário de Brasília): a seguinte de cada uma entra no saldo.
 * Avisa no sino quem deve aquela parte (menos quem já antecipou e quem não entrou no split) e
 * marca a hora no dinheiro do split. Despesa excluída ou split finalizado ficam para depois
 * (Desfazer ou Reabrir retomam de onde pararam).
 */
export async function notifyDueAt(now: number): Promise<number> {
  const day = brasiliaDay(now);
  const snap = await db().collectionGroup('expenses').where('instNext', '<=', day).get();
  let sent = 0;
  for (const d of snap.docs) {
    sent += await db().runTransaction(async (tx) => {
      const splitRef = d.ref.parent.parent!;
      const split = (await tx.get(splitRef)).data() as SplitData | undefined;
      const e = (await tx.get(d.ref)).data() as Notified | undefined;
      if (!split || !e || split.status !== 'open' || e.deletedAt || !e.installments || !e.instN || !e.instNext || e.instNext > day) return 0;
      const plan = e.installments;
      const dates = installmentDates(plan);
      const parts = Object.entries(shares(e, orderOf(split))).filter(([id, v]) => id !== e.payer && v > 0);
      let n = e.instN;
      let count = 0;
      // Venceu a parcela n: entra a n + 1 (a última, ao vencer, não traz nenhuma).
      for (; n < plan.count && dates[n - 1]! <= day; n++) {
        const next = n + 1;
        for (const [id, share] of parts) {
          // Quem antecipou já tem a parcela no saldo: não há nada novo para avisar. Quem não
          // entrou no split não recebe aviso.
          if ((e.advanced?.[id] ?? 0) >= next || !split.members[id]?.uid) continue;
          notify(tx, splitRef.id, split, id, { kind: 'installmentDue', from: e.payer, amount: splitInstallments(share, plan.count)[next - 1]!, expId: d.id, expName: e.name ?? '', memberId: id, inst: { n: next, of: plan.count, due: dates[next - 1]! } });
          count++;
        }
      }
      tx.update(d.ref, n >= plan.count ? { instNext: null, instN: null } : { instNext: dates[n - 1]!, instN: n });
      touchMoney(tx, d.ref);
      return count;
    });
  }
  return sent;
}
