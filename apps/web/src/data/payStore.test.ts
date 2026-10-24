import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPaymentOps,
  applyShareOps,
  confirmShareOp,
  prunePaymentOps,
  pruneShareOps,
  resetPayOps,
  settlePaymentOp,
  settleReceiptOp,
  startPayOp,
  usePayOps,
  type PaymentOp,
  type ReceiptOp,
  type ShareOp,
} from './payStore.ts';
import type { ExpenseDoc, PaymentDoc } from './model.ts';

afterEach(resetPayOps);

const exp = (over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  id: 'e1',
  name: 'Pizza',
  amount: 900,
  payer: 'm1',
  members: ['m1', 'm2', 'm3'],
  mode: 'equal',
  date: '2026-12-28',
  tags: ['other'],
  note: '',
  longDesc: '',
  author: 'm1',
  version: 1,
  updatedBy: 'm1',
  deletedAt: null,
  paid: {},
  pendConf: {},
  proof: {},
  receipt: null,
  paySeq: 0,
  ...over,
});
const pay = (over: Partial<PaymentDoc> = {}): PaymentDoc => ({ id: 'p1', from: 'm2', to: 'm1', amount: 300, by: 'm2', when: null, proof: null, ...over });
const current = () => renderHook(() => usePayOps()).result.current;

describe('partes de despesa', () => {
  it('a marcação aparece na hora e sai quando o snapshot alcança o paySeq do servidor', () => {
    const op: ShareOp = { kind: 'share', splitId: 's1', expenseId: 'e1', memberId: 'm2', patch: { paid: 300, pendConf: true } };
    startPayOp(op);
    expect(applyShareOps('s1', [exp()], current())[0]).toMatchObject({ paid: { m2: 300 }, pendConf: { m2: true } });
    expect(applyShareOps('s2', [exp()], current())[0]!.paid).toEqual({});
    confirmShareOp(op, 1);
    // Snapshot atrasado: a marcação continua.
    pruneShareOps('s1', [exp()]);
    expect(current()).toHaveLength(1);
    pruneShareOps('s1', [exp({ paySeq: 1, paid: { m2: 300 } })]);
    expect(current()).toHaveLength(0);
  });

  it('null apaga (Desfazer, Não recebi); o servidor recusar desfaz', () => {
    const base = exp({ paid: { m2: 300 }, pendConf: { m2: true }, proof: { m2: { path: 'x', at: 1, by: 'm2' } } });
    const undo = startPayOp({ kind: 'share', splitId: 's1', expenseId: 'e1', memberId: 'm2', patch: { paid: null, pendConf: null, proof: null } });
    expect(applyShareOps('s1', [base], current())[0]).toMatchObject({ paid: {}, pendConf: {}, proof: {} });
    undo();
    expect(applyShareOps('s1', [base], current())[0]).toBe(base);
  });

  it('despesa que sumiu do servidor leva a marcação confirmada junto', () => {
    const op: ShareOp = { kind: 'share', splitId: 's1', expenseId: 'e1', memberId: 'm2', patch: { pendConf: null } };
    startPayOp(op);
    confirmShareOp(op, 3);
    pruneShareOps('s1', []);
    expect(current()).toHaveLength(0);
  });
});

describe('acertos', () => {
  it('acerto novo aparece na hora; sai quando o servidor tem o mesmo id', () => {
    const op: PaymentOp = { kind: 'payment', splitId: 's1', id: 'p1', doc: pay() };
    startPayOp(op);
    expect(applyPaymentOps('s1', [], current())).toEqual([pay()]);
    expect(applyPaymentOps('s2', [], current())).toEqual([]);
    prunePaymentOps('s1', [pay({ amount: 300, when: new Date(1) })]);
    expect(current()).toHaveLength(0);
  });

  it('nada a acertar no servidor: o acerto otimista some', () => {
    const op: PaymentOp = { kind: 'payment', splitId: 's1', id: 'p1', doc: pay() };
    startPayOp(op);
    settlePaymentOp(op, false);
    expect(applyPaymentOps('s1', [], current())).toEqual([]);
    prunePaymentOps('s1', []);
    expect(current()).toHaveLength(0);
  });

  it('desfazer some na hora; sai quando o servidor também não tem mais', () => {
    const op: PaymentOp = { kind: 'payment', splitId: 's1', id: 'p1', doc: null };
    startPayOp(op);
    expect(applyPaymentOps('s1', [pay()], current())).toEqual([]);
    settlePaymentOp(op, true);
    prunePaymentOps('s1', [pay()]);
    expect(current()).toHaveLength(1);
    prunePaymentOps('s1', []);
    expect(current()).toHaveLength(0);
  });

  it('comprovante anexado aparece na hora; sai quando o servidor tem um', () => {
    const proof = { path: 'splits/s1/proofs/m2/m1/a.jpg', at: 1, by: 'm2' };
    const op: PaymentOp = { kind: 'payment', splitId: 's1', id: 'p1', proof };
    startPayOp(op);
    expect(applyPaymentOps('s1', [pay()], current())[0]!.proof).toEqual(proof);
    // Antes de o acerto chegar do servidor, o comprovante espera.
    expect(applyPaymentOps('s1', [], current())).toEqual([]);
    prunePaymentOps('s1', [pay({ proof })]);
    expect(current()).toHaveLength(0);
    startPayOp(op);
    settlePaymentOp(op, true);
    prunePaymentOps('s1', []);
    expect(current()).toHaveLength(0);
  });

  it('Confirmar um acerto tira o "para conferir" na hora; sai quando o servidor confirmou', () => {
    startPayOp({ kind: 'payment', splitId: 's1', id: 'p1', confirmed: true });
    expect(applyPaymentOps('s1', [pay({ pendConf: true })], current())[0]!.pendConf).toBe(false);
    prunePaymentOps('s1', [pay({ pendConf: true })]);
    expect(current()).toHaveLength(1);
    prunePaymentOps('s1', [pay({ pendConf: false })]);
    expect(current()).toHaveLength(0);
  });
});

describe('comprovante da despesa', () => {
  const nota = { path: 'splits/s1/receipts/e1/n.jpg', at: 1, by: 'm1' };

  it('aparece na hora; sai quando o servidor tem a mesma foto', () => {
    const op: ReceiptOp = { kind: 'receipt', splitId: 's1', expenseId: 'e1', receipt: nota, before: null };
    startPayOp(op);
    expect(applyShareOps('s1', [exp()], current())[0]!.receipt).toEqual(nota);
    pruneShareOps('s1', [exp()]);
    expect(current()).toHaveLength(1);
    pruneShareOps('s1', [exp({ receipt: nota })]);
    expect(current()).toHaveLength(0);
  });

  it('tirar a foto; se outra pessoa trocou antes do snapshot, vale o servidor', () => {
    const op: ReceiptOp = { kind: 'receipt', splitId: 's1', expenseId: 'e1', receipt: null, before: nota.path };
    startPayOp(op);
    expect(applyShareOps('s1', [exp({ receipt: nota })], current())[0]!.receipt).toBeNull();
    settleReceiptOp(op);
    pruneShareOps('s1', [exp({ receipt: { ...nota, path: 'outra' } })]);
    expect(current()).toHaveLength(0);
  });
});
