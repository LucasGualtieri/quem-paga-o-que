import type { JoinOrder } from '../src/index.ts';

/** Ordem de entrada no split: lucas criou, depois bia, cat e fel. */
export const order: JoinOrder = { lucas: 0, bia: 1, cat: 2, fel: 3 };

export const all = ['lucas', 'bia', 'cat', 'fel'] as const;
