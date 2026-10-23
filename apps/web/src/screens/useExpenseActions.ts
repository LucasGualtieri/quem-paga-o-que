import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExpenseInput } from '@qpq/shared';
import { useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { docFromInput } from '../data/expenseForm.ts';
import { confirmOp, enqueue, setConflict, startOp } from '../data/expenseStore.ts';
import type { ExpenseDoc, Member, SplitDoc } from '../data/model.ts';
import { useReasonText } from './reasons.ts';

/** Decisão 7: com parte paga ou pagamento esperando confirmação, não dá para excluir. */
export function hasPayments(e: ExpenseDoc): boolean {
  return Object.values(e.paid).some((v) => v > 0) || Object.values(e.pendConf).some(Boolean);
}

/**
 * Lançar, editar, excluir e desfazer despesas. Tudo é otimista: a mudança aparece na hora,
 * e só volta (com aviso) se o servidor recusar; o servidor continua sendo a autoridade.
 */
export function useExpenseActions(split: SplitDoc, me: Member) {
  const { t } = useTranslation();
  const toast = useToast();
  const reasonText = useReasonText();
  const splitId = split.id;

  const fail = useCallback((error: unknown) => toast.show({ kind: 'error', text: reasonText(detailsOf(error)) }), [toast, reasonText]);

  const mark = useCallback(
    (e: ExpenseDoc, deleted: boolean) => {
      const doc: ExpenseDoc = { ...e, deletedAt: deleted ? new Date() : null, version: e.version + 1 };
      const undo = startOp({ splitId, doc });
      enqueue(e.id, () => (deleted ? api.deleteExpense({ splitId, expenseId: e.id }) : api.restoreExpense({ splitId, expenseId: e.id }))).then(
        (r) => confirmOp(e.id, r.version),
        (error) => {
          undo();
          fail(error);
        },
      );
    },
    [splitId, fail],
  );

  const remove = useCallback(
    (e: ExpenseDoc) => {
      mark(e, true);
      toast.show({ text: t('expense.deleted'), onUndo: () => mark({ ...e, deletedAt: new Date(), version: e.version + 1 }, false) });
    },
    [mark, toast, t],
  );

  const create = useCallback(
    (id: string, input: ExpenseInput) => {
      const doc = docFromInput(id, input, me.id, 1);
      const undo = startOp({ splitId, doc });
      enqueue(id, () => api.createExpense({ splitId, id, expense: input })).then(
        (r) => confirmOp(id, r.version),
        (error) => {
          undo();
          fail(error);
        },
      );
      toast.show({ text: t('expense.added'), onUndo: () => mark({ ...doc, version: 1 }, true) });
    },
    [splitId, me.id, mark, toast, t, fail],
  );

  /** `expectedVersion`: a versão que a pessoa estava editando (decisão 8). `force`: "Salvar a minha por cima". */
  const update = useCallback(
    (prev: ExpenseDoc, input: ExpenseInput, expectedVersion: number, force = false) => {
      const doc = docFromInput(prev.id, input, me.id, prev.version + 1, prev);
      const undo = startOp({ splitId, doc });
      enqueue(prev.id, () => api.updateExpense({ splitId, expenseId: prev.id, expectedVersion, expense: input, ...(force ? { force: true } : {}) })).then(
        (r) => confirmOp(prev.id, r.version),
        (error) => {
          undo();
          const d = detailsOf(error);
          if (d?.reason === 'version-conflict') {
            setConflict({ splitId, expenseId: prev.id, name: d.name ?? '', retry: () => update(prev, input, expectedVersion, true) });
          } else fail(error);
        },
      );
    },
    [splitId, me.id, fail],
  );

  return { create, update, remove, restore: (e: ExpenseDoc) => mark(e, false) };
}
