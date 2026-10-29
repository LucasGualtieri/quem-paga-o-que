import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExpenseInput } from '@qpq/shared';
import { useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { docFromInput, fromDoc, toInput } from '../data/expenseForm.ts';
import { confirmOp, enqueue, enqueueAll, setConflict, startOp } from '../data/expenseStore.ts';
import { dueCount } from '@qpq/calc';
import { today, type ExpenseDoc, type Member, type SplitDoc } from '../data/model.ts';
import { useLang } from '../i18n/index.ts';
import { todayStr } from './common.tsx';
import { useReasonText } from './reasons.ts';

/** Decisão 7: com parte paga ou pagamento esperando confirmação, não dá para excluir. */
export function hasPayments(e: ExpenseDoc): boolean {
  return Object.values(e.paid).some((v) => v > 0) || Object.values(e.pendConf).some(Boolean);
}

/** Id gerado no aparelho: a despesa já aparece com ele antes de o servidor responder. */
export const newExpenseId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');

const NAME_MAX = 80;

/** "Pizza" → "Pizza (cópia)"; a cópia de uma cópia não ganha outro sufixo. Cabe nos 80 caracteres. */
export function copyName(name: string, suffix: string): string {
  if (name.endsWith(` ${suffix}`)) return name;
  return `${name.slice(0, NAME_MAX - suffix.length - 1).trimEnd()} ${suffix}`;
}

/**
 * Lançar, editar, excluir e desfazer despesas. Tudo é otimista: a mudança aparece na hora,
 * e só volta (com aviso) se o servidor recusar; o servidor continua sendo a autoridade.
 */
export function useExpenseActions(split: SplitDoc, me: Member) {
  const { t } = useTranslation();
  const lang = useLang();
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

  /** Excluir ou desfazer várias de uma vez (seleção): uma chamada só, tudo ou nada. */
  const markMany = useCallback(
    (list: readonly ExpenseDoc[], deleted: boolean) => {
      const undos = list.map((e) => startOp({ splitId, doc: { ...e, deletedAt: deleted ? new Date() : null, version: e.version + 1 } }));
      const expenseIds = list.map((e) => e.id);
      enqueueAll(expenseIds, () => (deleted ? api.deleteExpenses({ splitId, expenseIds }) : api.restoreExpenses({ splitId, expenseIds }))).then(
        (r) => {
          for (const [id, v] of Object.entries(r.versions)) confirmOp(id, v);
        },
        (error) => {
          for (const undo of undos) undo();
          fail(error);
        },
      );
    },
    [splitId, fail],
  );

  const removeMany = useCallback(
    (list: readonly ExpenseDoc[]) => {
      if (list.length === 1) return remove(list[0]!);
      markMany(list, true);
      toast.show({
        text: t('expense.deletedMany', { count: list.length }),
        onUndo: () => markMany(list.map((e) => ({ ...e, deletedAt: new Date(), version: e.version + 1 })), false),
      });
    },
    [markMany, remove, toast, t],
  );

  /** Duplicar: cópia nova, de hoje, com "(cópia)" no nome; sem pagamentos, comprovante nem histórico. */
  const duplicate = useCallback(
    (e: ExpenseDoc) => {
      const id = newExpenseId();
      const input = { ...toInput(fromDoc(e, lang)), name: copyName(e.name, t('expense.copySuffix')), date: todayStr() };
      const doc = docFromInput(id, input, me.id, 1);
      const undo = startOp({ splitId, doc });
      enqueue(id, () => api.createExpense({ splitId, id, expense: input })).then(
        (r) => confirmOp(id, r.version),
        (error) => {
          undo();
          fail(error);
        },
      );
      toast.show({ text: t('expense.duplicated'), onUndo: () => mark({ ...doc, version: 1 }, true) });
      return id;
    },
    [splitId, me.id, lang, mark, toast, t, fail],
  );

  /** "Antecipar parcelas" (spec 05): as parcelas de `memberId` passam a contar agora. */
  const advance = useCallback(
    (e: ExpenseDoc, memberId: string, all: boolean) => {
      const plan = e.installments;
      if (!plan) return;
      const now = dueCount(e, memberId, today());
      const doc: ExpenseDoc = { ...e, advanced: { ...e.advanced, [memberId]: all ? plan.count : Math.min(plan.count, now + 1) }, version: e.version + 1 };
      const undo = startOp({ splitId, doc });
      enqueue(e.id, () => api.advanceInstallments({ splitId, expenseId: e.id, memberId, ...(all ? { all: true } : {}) })).then(
        () => confirmOp(e.id, e.version + 1),
        (error) => {
          undo();
          fail(error);
        },
      );
      toast.show({ text: t(all ? 'expense.plan.advancedAll' : 'expense.plan.advancedNext') });
    },
    [splitId, toast, t, fail],
  );

  return { create, update, remove, removeMany, duplicate, advance, restore: (e: ExpenseDoc) => mark(e, false) };
}
