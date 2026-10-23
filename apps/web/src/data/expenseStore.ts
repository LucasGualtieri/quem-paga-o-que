import { useSyncExternalStore } from 'react';
import type { ExpenseDoc } from './model.ts';

/**
 * Mudanças de despesa que o aparelho já mostra, antes de o servidor responder (UX otimista).
 * Cada uma guarda a despesa como ficará; sai quando o servidor confirma e o snapshot alcança a
 * versão, ou quando o servidor recusa.
 */
export interface Op {
  splitId: string;
  doc: ExpenseDoc;
  /** Versão devolvida pelo servidor; com ela, a mudança sai quando o snapshot a alcança. */
  minVersion?: number;
}

let ops: ReadonlyMap<string, Op> = new Map();
const listeners = new Set<() => void>();

function set(next: Map<string, Op>) {
  ops = next;
  for (const l of listeners) l();
}

/** Mostra a mudança agora; devolve como desfazê-la. */
export function startOp(op: Op): () => void {
  set(new Map(ops).set(op.doc.id, op));
  return () => removeOp(op.doc.id, op);
}

function removeOp(id: string, only?: Op) {
  const cur = ops.get(id);
  if (!cur || (only && cur !== only)) return;
  const next = new Map(ops);
  next.delete(id);
  set(next);
}

export function confirmOp(id: string, version: number): void {
  const cur = ops.get(id);
  if (cur) set(new Map(ops).set(id, { ...cur, minVersion: version }));
}

/** Aplica as mudanças pendentes de um split sobre o que o servidor mandou. */
export function mergeOps(splitId: string, server: readonly ExpenseDoc[], pending: ReadonlyMap<string, Op>): ExpenseDoc[] {
  const byId = new Map(server.map((e) => [e.id, e]));
  for (const op of pending.values()) {
    if (op.splitId !== splitId) continue;
    const s = byId.get(op.doc.id);
    if (op.minVersion !== undefined && s && s.version >= op.minVersion) continue;
    byId.set(op.doc.id, op.doc);
  }
  return [...byId.values()];
}

/** Tira as mudanças que o servidor já alcançou. */
export function pruneOps(splitId: string, server: readonly ExpenseDoc[]): void {
  const byId = new Map(server.map((e) => [e.id, e]));
  let next: Map<string, Op> | null = null;
  for (const [id, op] of ops) {
    const s = byId.get(id);
    if (op.splitId === splitId && op.minVersion !== undefined && s && s.version >= op.minVersion) {
      next ??= new Map(ops);
      next.delete(id);
    }
  }
  if (next) set(next);
}

export function useOps(): ReadonlyMap<string, Op> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ops,
  );
}

/** Só para testes. */
export function resetOps(): void {
  set(new Map());
}

// ---------- Conflito de edição (decisão 8) ----------

/** "Beatriz alterou esta despesa enquanto você editava." — guarda a edição para o "por cima". */
export interface Conflict {
  splitId: string;
  expenseId: string;
  /** Quem alterou antes. */
  name: string;
  retry: () => void;
}

let conflict: Conflict | null = null;
const conflictListeners = new Set<() => void>();

export function setConflict(c: Conflict | null): void {
  conflict = c;
  for (const l of conflictListeners) l();
}

export function useConflict(): Conflict | null {
  return useSyncExternalStore(
    (cb) => {
      conflictListeners.add(cb);
      return () => conflictListeners.delete(cb);
    },
    () => conflict,
  );
}

// ---------- Ordem das gravações ----------

const queues = new Map<string, Promise<unknown>>();

/**
 * Roda as chamadas de uma mesma despesa uma depois da outra: "Desfazer" logo depois de
 * lançar só chega ao servidor depois de a despesa existir lá.
 */
export function enqueue<T>(expenseId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(expenseId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(expenseId, next);
  const clear = () => {
    if (queues.get(expenseId) === next) queues.delete(expenseId);
  };
  next.then(clear, clear);
  return next;
}
