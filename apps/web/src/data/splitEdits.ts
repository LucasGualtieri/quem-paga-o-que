import { useSyncExternalStore } from 'react';
import type { EntryIcon, PayMode, ProofVisibility } from '@qpq/shared';
import type { SplitDoc } from './model.ts';

/**
 * Mudanças no próprio split que o aparelho mostra antes do servidor responder (UX otimista):
 * editar nome e capa, modo de pagamento e quem vê comprovantes, finalizar e reabrir. Valem na home
 * e dentro do split; saem quando o snapshot do servidor já tem o mesmo valor, ou no primeiro
 * snapshot depois da resposta.
 */
export interface SplitPatch {
  name?: string;
  icon?: EntryIcon | null;
  clearPhoto?: true;
  status?: 'open' | 'done';
  doneAt?: Date | null;
  payMode?: PayMode;
  proofVisibility?: ProofVisibility;
}

interface Edit {
  splitId: string;
  patch: SplitPatch;
  settled: boolean;
}

let edits: readonly Edit[] = [];
const listeners = new Set<() => void>();

function set(next: readonly Edit[]) {
  edits = next;
  for (const l of listeners) l();
}

/** Mostra a mudança agora; devolve como confirmar (o servidor gravou) e como desfazer. */
export function startSplitEdit(splitId: string, patch: SplitPatch): { settle: () => void; undo: () => void } {
  const edit: Edit = { splitId, patch, settled: false };
  set([...edits, edit]);
  return {
    settle: () => set(edits.map((e) => (e === edit ? { ...e, settled: true } : e))),
    undo: () => set(edits.filter((e) => e !== edit)),
  };
}

const sameIcon = (a: EntryIcon | null | undefined, b: EntryIcon | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function reached(split: SplitDoc, p: SplitPatch): boolean {
  return (
    (p.name === undefined || split.name === p.name) &&
    (p.icon === undefined || sameIcon(split.icon, p.icon)) &&
    (!p.clearPhoto || !split.photo) &&
    (p.status === undefined || split.status === p.status) &&
    (p.payMode === undefined || (split.payMode ?? 'simple') === p.payMode) &&
    (p.proofVisibility === undefined || (split.proofVisibility ?? 'all') === p.proofVisibility)
  );
}

export function withSplitEdits(split: SplitDoc, pending: readonly Edit[] = edits): SplitDoc {
  return pending
    .filter((e) => e.splitId === split.id)
    .reduce<SplitDoc>((s, { patch: p }) => {
      const next: SplitDoc = { ...s };
      if (p.name !== undefined) next.name = p.name;
      if (p.icon !== undefined) next.icon = p.icon;
      if (p.clearPhoto) next.photo = null;
      if (p.status !== undefined) next.status = p.status;
      if (p.doneAt !== undefined) next.doneAt = p.doneAt;
      if (p.payMode !== undefined) next.payMode = p.payMode;
      if (p.proofVisibility !== undefined) next.proofVisibility = p.proofVisibility;
      return next;
    }, split);
}

/** A cada snapshot: tira o que o servidor já alcançou (ou já respondeu). */
export function pruneSplitEdits(splits: readonly SplitDoc[]): void {
  const byId = new Map(splits.map((s) => [s.id, s]));
  const next = edits.filter((e) => {
    const server = byId.get(e.splitId);
    return !server || (!e.settled && !reached(server, e.patch));
  });
  if (next.length !== edits.length) set(next);
}

export function useSplitEdits(): readonly Edit[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => edits,
  );
}

/** Só para testes. */
export function resetSplitEdits(): void {
  set([]);
}
