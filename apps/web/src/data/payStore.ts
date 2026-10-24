import { useSyncExternalStore } from 'react';
import type { ProofInfo } from '@qpq/shared';
import type { ExpenseDoc, PaymentDoc } from './model.ts';

/**
 * Pagamentos que o aparelho já mostra antes de o servidor responder (UX otimista).
 * Marcar parte paga não é edição da despesa (decisão 8), então fica fora do `expenseStore`:
 * aqui cada mudança é um remendo nos campos de pagamento de uma parte, que sai quando o
 * snapshot alcança o `paySeq` devolvido pelo servidor, ou some se o servidor recusar.
 */

/** `null` apaga o campo; ausente não mexe. */
export interface SharePatch {
  paid?: number | null;
  pendConf?: boolean | null;
  proof?: ProofInfo | null;
}

export interface ShareOp {
  kind: 'share';
  splitId: string;
  expenseId: string;
  memberId: string;
  patch: SharePatch;
  minPaySeq?: number;
}

/** Acerto novo (`doc`), desfeito (`doc: null`), com comprovante anexado (`proof`) ou confirmado por quem recebe (`confirmed`). */
export interface PaymentOp {
  kind: 'payment';
  splitId: string;
  id: string;
  doc?: PaymentDoc | null;
  proof?: ProofInfo;
  confirmed?: true;
  /** O servidor respondeu; `created: false` = nada a acertar, o acerto otimista some. No comprovante, `created` não importa. */
  settled?: { created: boolean };
}

/** Comprovante (foto) da despesa trocado ou tirado (`receipt: null`). Não é edição. */
export interface ReceiptOp {
  kind: 'receipt';
  splitId: string;
  expenseId: string;
  receipt: ProofInfo | null;
  /** Caminho que o servidor tinha quando a troca começou. */
  before: string | null;
  settled?: boolean;
}

export type PayOp = ShareOp | PaymentOp | ReceiptOp;

let ops: readonly PayOp[] = [];
const listeners = new Set<() => void>();

function set(next: readonly PayOp[]) {
  ops = next;
  for (const l of listeners) l();
}

/** Mostra a mudança agora; devolve como desfazê-la. */
export function startPayOp(op: PayOp): () => void {
  set([...ops, op]);
  return () => set(ops.filter((o) => o !== op));
}

/** O servidor gravou: a mudança sai quando o snapshot alcançar `paySeq`. */
export function confirmShareOp(op: ShareOp, paySeq: number): void {
  set(ops.map((o) => (o === op ? { ...op, minPaySeq: paySeq } : o)));
}

export function settlePaymentOp(op: PaymentOp, created: boolean): void {
  set(ops.map((o) => (o === op ? { ...op, settled: { created } } : o)));
}

export function settleReceiptOp(op: ReceiptOp): void {
  set(ops.map((o) => (o === op ? { ...op, settled: true } : o)));
}

function receiptDone(op: ReceiptOp, server: ExpenseDoc | undefined): boolean {
  const now = server?.receipt?.path ?? null;
  // O servidor já tem a foto nova, ou (depois de responder) mudou de qualquer jeito.
  return !server || now === (op.receipt?.path ?? null) || (!!op.settled && now !== op.before);
}

function shareDone(op: ShareOp, server: ExpenseDoc | undefined): boolean {
  return op.minPaySeq !== undefined && (!server || server.paySeq >= op.minPaySeq);
}

function paymentDone(op: PaymentOp, server: PaymentDoc | undefined): boolean {
  if (op.doc === null) return !!op.settled && !server;
  if (op.doc) return !!server || (!!op.settled && !op.settled.created);
  if (op.confirmed) return !server?.pendConf;
  // Comprovante: some quando o servidor já tem um, ou se o acerto deixou de existir.
  return !!server?.proof || (!!op.settled && !server);
}

function patchShare(e: ExpenseDoc, memberId: string, patch: SharePatch): ExpenseDoc {
  const field = <V,>(map: Record<string, V>, v: V | null | undefined): Record<string, V> => {
    if (v === undefined) return map;
    const next = { ...map };
    if (v === null) delete next[memberId];
    else next[memberId] = v;
    return next;
  };
  return { ...e, paid: field(e.paid, patch.paid), pendConf: field(e.pendConf, patch.pendConf), proof: field(e.proof, patch.proof) };
}

type ExpenseOp = ShareOp | ReceiptOp;

function expenseOpDone(op: ExpenseOp, server: ExpenseDoc | undefined): boolean {
  return op.kind === 'share' ? shareDone(op, server) : receiptDone(op, server);
}

/** Despesas do servidor com os pagamentos (e comprovantes da despesa) pendentes por cima. */
export function applyShareOps(splitId: string, expenses: readonly ExpenseDoc[], pending: readonly PayOp[]): ExpenseDoc[] {
  const mine = pending.filter((o): o is ExpenseOp => o.kind !== 'payment' && o.splitId === splitId);
  if (mine.length === 0) return expenses as ExpenseDoc[];
  return expenses.map((e) =>
    mine
      .filter((o) => o.expenseId === e.id && !expenseOpDone(o, e))
      .reduce((acc, o) => (o.kind === 'share' ? patchShare(acc, o.memberId, o.patch) : { ...acc, receipt: o.receipt }), e),
  );
}

/** Acertos do servidor com os pendentes por cima. */
export function applyPaymentOps(splitId: string, payments: readonly PaymentDoc[], pending: readonly PayOp[]): PaymentDoc[] {
  const mine = pending.filter((o): o is PaymentOp => o.kind === 'payment' && o.splitId === splitId);
  if (mine.length === 0) return payments as PaymentDoc[];
  const byId = new Map(payments.map((p) => [p.id, p]));
  for (const o of mine) {
    const server = byId.get(o.id);
    if (paymentDone(o, server)) continue;
    if (o.doc === null) byId.delete(o.id);
    else if (o.doc) byId.set(o.id, o.doc);
    else if (server && o.proof) byId.set(o.id, { ...server, proof: o.proof });
    else if (server && o.confirmed) byId.set(o.id, { ...server, pendConf: false });
  }
  return [...byId.values()];
}

/** Tira o que o servidor já alcançou (chamado a cada snapshot). */
export function pruneShareOps(splitId: string, expenses: readonly ExpenseDoc[]): void {
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const next = ops.filter((o) => !(o.kind !== 'payment' && o.splitId === splitId && expenseOpDone(o, byId.get(o.expenseId))));
  if (next.length !== ops.length) set(next);
}

export function prunePaymentOps(splitId: string, payments: readonly PaymentDoc[]): void {
  const byId = new Map(payments.map((p) => [p.id, p]));
  const next = ops.filter((o) => !(o.kind === 'payment' && o.splitId === splitId && paymentDone(o, byId.get(o.id))));
  if (next.length !== ops.length) set(next);
}

export function usePayOps(): readonly PayOp[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ops,
  );
}

/** Só para testes. */
export function resetPayOps(): void {
  set([]);
}
