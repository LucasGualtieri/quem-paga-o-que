import { afterEach, describe, expect, it } from 'vitest';
import { confirmOp, mergeOps, pruneOps, resetOps, startOp } from './expenseStore.ts';
import type { ExpenseDoc } from './model.ts';

const doc = (id: string, over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  id,
  name: id,
  amount: 100,
  payer: 'a',
  members: ['a'],
  mode: 'equal',
  date: '2026-12-28',
  tags: ['other'],
  note: '',
  longDesc: '',
  author: 'a',
  version: 1,
  updatedBy: 'a',
  deletedAt: null,
  paid: {},
  pendConf: {},
  proof: {},
  receipt: null,
  paySeq: 0,
  ...over,
});

const pending = (ops: Array<{ splitId: string; doc: ExpenseDoc; minVersion?: number }>) => new Map(ops.map((o) => [o.doc.id, o]));

afterEach(resetOps);

describe('mergeOps', () => {
  it('mostra a despesa nova e a editada antes do servidor responder', () => {
    const server = [doc('e1')];
    const merged = mergeOps('s1', server, pending([{ splitId: 's1', doc: doc('e2') }, { splitId: 's1', doc: doc('e1', { name: 'novo', version: 2 }) }]));
    expect(merged.map((e) => [e.id, e.name])).toEqual([
      ['e1', 'novo'],
      ['e2', 'e2'],
    ]);
  });

  it('ignora mudanças de outro split', () => {
    expect(mergeOps('s1', [], pending([{ splitId: 's2', doc: doc('x') }]))).toEqual([]);
  });

  it('quando o servidor alcança a versão confirmada, a mudança local sai de cena', () => {
    const op = { splitId: 's1', doc: doc('e1', { name: 'local', version: 2 }), minVersion: 2 };
    expect(mergeOps('s1', [doc('e1', { name: 'servidor', version: 2 })], pending([op]))[0]?.name).toBe('servidor');
    // Ainda na versão antiga: continua valendo a local.
    expect(mergeOps('s1', [doc('e1', { name: 'servidor', version: 1 })], pending([op]))[0]?.name).toBe('local');
  });
});

describe('startOp, confirmOp e pruneOps', () => {
  it('desfazer tira só a própria mudança', () => {
    const undo = startOp({ splitId: 's1', doc: doc('e1') });
    const other = startOp({ splitId: 's1', doc: doc('e1', { name: 'mais nova' }) });
    undo();
    // A mais nova continua (a primeira já tinha sido substituída).
    other();
    expect(() => pruneOps('s1', [])).not.toThrow();
  });

  it('confirmada e alcançada pelo snapshot, sai da lista', () => {
    startOp({ splitId: 's1', doc: doc('e1', { version: 2 }) });
    confirmOp('e1', 2);
    confirmOp('inexistente', 3);
    pruneOps('s1', [doc('e1', { version: 1 })]);
    pruneOps('s1', [doc('e1', { version: 2 })]);
    pruneOps('s1', [doc('e1', { version: 2 })]);
  });
});
