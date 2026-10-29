import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { dueShares, type Expense } from '@qpq/calc';
import type { ProofInfo } from '@qpq/shared';
import { orderOf, today, touchMoney, type SplitData } from './common.ts';
import { addHistory } from './expenses.ts';
import { unregister } from './proofs.ts';

/**
 * Acerto do modo detalhado (spec 06): o acerto do par marca como pagas todas as partes em aberto
 * entre as duas pessoas, nos dois sentidos ("Paga no acerto" / "Compensada no acerto"). Quem mexe
 * no saldo são as partes; o registro do acerto vira recibo (`viaShares`, fora do @qpq/calc), com
 * o valor transferido, o comprovante e a confirmação. Desfazer o acerto desmarca as partes.
 *
 * Regra das transações: tudo o que é lido aqui (`read*`) vem antes de qualquer escrita (`write*`).
 */

/**
 * Uma parte coberta pelo acerto: a despesa e quem devia. Se a parte já tinha um pedaço pago (a
 * despesa foi editada depois de outro pagamento), `prev*` guardam esse pedaço para o Desfazer.
 */
export interface Cover {
  e: string;
  m: string;
  prev?: number;
  prevAt?: number;
  prevVia?: string;
}

export interface StoredPayment {
  from: string;
  to: string;
  amount: number;
  proof?: ProofInfo | null;
  /** Registrado por quem não recebe: espera Confirmar ou "Não recebi" de quem recebe. */
  pendConf?: boolean;
  /** Recibo de acerto que marcou as partes (não conta no saldo). */
  viaShares?: boolean;
  covers?: Cover[];
  /** Acertos antigos (do modo simplificado) do mesmo par que este acerto incorporou. */
  absorbs?: string[];
  absorbedBy?: string;
}

type ExpenseData = Expense & { version: number; paySeq?: number; deletedAt?: unknown; via?: Record<string, string>; pendConf?: Record<string, boolean>; proof?: Record<string, ProofInfo | null> };

/** Uma parte em aberto entre as duas pessoas, pronta para marcar. */
export interface OpenShare {
  ref: DocumentReference;
  e: ExpenseData;
  m: string;
  share: number;
}

/** Partes em aberto entre `a` e `b`, nos dois sentidos, nas despesas ativas. */
export function openShares(split: SplitData, expenses: readonly DocumentSnapshot[], a: string, b: string): OpenShare[] {
  const out: OpenShare[] = [];
  const order = orderOf(split);
  for (const d of expenses) {
    const e = d.data() as ExpenseData;
    if (e.deletedAt) continue;
    const debtor = e.payer === b ? a : e.payer === a ? b : null;
    if (!debtor) continue;
    const share = dueShares(e, order, today())[debtor] ?? 0;
    if (share > 0 && (e.paid?.[debtor] ?? 0) < share) out.push({ ref: d.ref, e, m: debtor, share });
  }
  return out;
}

/** Acertos antigos do par que ainda contam no saldo (feitos no modo simplificado). */
export function legacyOf(payments: readonly DocumentSnapshot[], a: string, b: string): DocumentSnapshot[] {
  return payments.filter((d) => {
    const p = d.data() as StoredPayment;
    return !p.viaShares && ((p.from === a && p.to === b) || (p.from === b && p.to === a));
  });
}

/** O que o acerto grava de si: as partes cobertas e os acertos antigos que ele incorpora. */
export function coversOf(open: readonly OpenShare[], legacy: readonly DocumentSnapshot[]): { viaShares: true; covers: Cover[]; absorbs: string[] } {
  const covers = open.map((o): Cover => {
    const prev = o.e.paid?.[o.m] ?? 0;
    if (prev <= 0) return { e: o.ref.id, m: o.m };
    const at = (o.e as { paidAt?: Record<string, number> }).paidAt?.[o.m];
    const via = o.e.via?.[o.m];
    return { e: o.ref.id, m: o.m, prev, ...(at ? { prevAt: at } : {}), ...(via ? { prevVia: via } : {}) };
  });
  return { viaShares: true, covers, absorbs: legacy.map((d) => d.id) };
}

/**
 * Marca as partes no acerto `pid` e incorpora os acertos antigos do par. As de quem pagou o acerto
 * ficam "a conferir" enquanto o acerto espera confirmação; as compensadas (do outro lado) já valem.
 */
export async function writeCovers(tx: Transaction, open: readonly OpenShare[], legacy: readonly DocumentSnapshot[], pid: string, by: string, pendingDebtor: string | null): Promise<void> {
  for (const d of legacy) tx.update(d.ref, { viaShares: true, absorbedBy: pid });
  for (const o of open) {
    tx.update(o.ref, {
      [`paid.${o.m}`]: o.share,
      [`paidAt.${o.m}`]: Date.now(),
      [`via.${o.m}`]: pid,
      [`pendConf.${o.m}`]: o.m === pendingDebtor ? true : FieldValue.delete(),
      paySeq: (o.e.paySeq ?? 0) + 1,
    });
    await addHistory(tx, o.ref, { seq: o.e.version, kind: 'settled', by, memberId: o.m });
  }
}

/** O que desfazer um acerto precisa ler: as despesas cobertas e os acertos incorporados. */
export async function readSettlement(tx: Transaction, splitRef: DocumentReference, p: StoredPayment) {
  if (!p.viaShares) return { expenses: [], absorbed: [] };
  const ids = [...new Set((p.covers ?? []).map((c) => c.e))];
  const expenses = await Promise.all(ids.map((id) => tx.get(splitRef.collection('expenses').doc(id))));
  const absorbed = await Promise.all((p.absorbs ?? []).map((id) => tx.get(splitRef.collection('payments').doc(id))));
  return { expenses, absorbed };
}

export type Settlement = Awaited<ReturnType<typeof readSettlement>>;

/** Desfaz o acerto `pid`: desmarca as partes que ainda são dele e devolve os acertos incorporados. */
export async function undoSettlement(tx: Transaction, ref: DocumentReference, p: StoredPayment, read: Settlement, by: string): Promise<void> {
  for (const d of read.expenses) {
    if (!d.exists) continue;
    const e = d.data() as ExpenseData;
    const mine = (p.covers ?? []).filter((c) => c.e === d.id && e.via?.[c.m] === ref.id);
    if (mine.length === 0) continue;
    const update: Record<string, unknown> = { paySeq: (e.paySeq ?? 0) + 1 };
    for (const c of mine) {
      const del = FieldValue.delete();
      update[`pendConf.${c.m}`] = del;
      // Volta ao pedaço que já estava pago antes do acerto (com o comprovante dele), ou a nada.
      if (c.prev) {
        Object.assign(update, { [`paid.${c.m}`]: c.prev, [`paidAt.${c.m}`]: c.prevAt ?? del, [`via.${c.m}`]: c.prevVia ?? del });
        continue;
      }
      unregister(tx, e.proof?.[c.m]);
      Object.assign(update, { [`paid.${c.m}`]: del, [`paidAt.${c.m}`]: del, [`proof.${c.m}`]: del, [`via.${c.m}`]: del });
    }
    tx.update(d.ref, update);
    for (const c of mine) await addHistory(tx, d.ref, { seq: e.version, kind: 'unpaid', by, memberId: c.m });
  }
  for (const a of read.absorbed) if (a.get('absorbedBy') === ref.id) tx.update(a.ref, { viaShares: FieldValue.delete(), absorbedBy: FieldValue.delete() });
  unregister(tx, p.proof);
  tx.delete(ref);
  touchMoney(tx, ref);
}

/** Confirmar o acerto: as partes que ele marcou deixam de estar "a conferir". */
export function confirmCovers(tx: Transaction, pid: string, read: Settlement, p: StoredPayment): void {
  for (const d of read.expenses) {
    if (!d.exists) continue;
    const e = d.data() as ExpenseData;
    const pend = (p.covers ?? []).filter((c) => c.e === d.id && e.via?.[c.m] === pid && e.pendConf?.[c.m]);
    if (pend.length) tx.update(d.ref, { ...Object.fromEntries(pend.map((c) => [`pendConf.${c.m}`, FieldValue.delete()])), paySeq: (e.paySeq ?? 0) + 1 });
  }
}
