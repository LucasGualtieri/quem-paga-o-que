import { useSyncExternalStore } from 'react';

/** Pequeno store em memória para estado otimista que atravessa telas. */
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    use(): T {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
      );
    },
  };
}

/** Splits que você acabou de deixar: somem da home na hora; voltam se o servidor recusar. */
export const hiddenSplits = store<ReadonlySet<string>>(new Set());

export function hideSplit(id: string, hidden: boolean): void {
  const next = new Set(hiddenSplits.get());
  if (hidden) next.add(id);
  else next.delete(id);
  hiddenSplits.set(next);
}

/**
 * Entradas em andamento: a tela do split abre na hora (com o carregando) e só
 * começa a ler quando o servidor confirma a entrada.
 */
export const pendingJoins = store<ReadonlyMap<string, Promise<unknown>>>(new Map());

export function trackJoin(splitId: string, p: Promise<unknown>): void {
  pendingJoins.set(new Map(pendingJoins.get()).set(splitId, p));
  const done = () => {
    const next = new Map(pendingJoins.get());
    next.delete(splitId);
    pendingJoins.set(next);
  };
  p.then(done, done);
}
