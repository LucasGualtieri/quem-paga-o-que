import type { JoinOrder, MemberId } from './types.ts';

/** `joinOrder` do participante; falha se ele não for do split. */
export function joinOf(id: MemberId, order: JoinOrder): number {
  const j = order[id];
  if (j === undefined) throw new Error(`Participante desconhecido no split: ${id}`);
  return j;
}

/** Ids na ordem de entrada no split. */
export function byJoinOrder(ids: readonly MemberId[], order: JoinOrder): MemberId[] {
  return [...ids].sort((a, b) => joinOf(a, order) - joinOf(b, order));
}
