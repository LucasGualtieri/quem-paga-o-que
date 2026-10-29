import { isValidPlan } from './installments.ts';
import { effectiveAmount, scaledWeight, WEIGHT_SCALE } from './shares.ts';
import type { Cents, Expense, ExpenseError, ExpenseErrorCode, JoinOrder, MemberId, SplitMode, Weights } from './types.ts';

const isPositiveCents = (v: number) => Number.isInteger(v) && v > 0;

/**
 * Motivos que impedem salvar a despesa (docs/spec/05-despesas-e-divisao.md).
 * Lista vazia = pode salvar.
 */
export function validateExpense(expense: Expense, order: JoinOrder): ExpenseError[] {
  const errors: ExpenseError[] = [];
  const known = (ids: readonly MemberId[]) => ids.every((id) => order[id] !== undefined);
  const total = effectiveAmount(expense);

  if (!isPositiveCents(total)) errors.push({ code: 'amount-invalid' });
  if (!known([expense.payer, ...expense.members])) errors.push({ code: 'unknown-member' });
  if (expense.installments && !isValidPlan(expense.installments)) errors.push({ code: 'installments-invalid' });

  if (expense.mode !== 'items') {
    const code = checkSplit(total, expense.members, expense.mode, expense.w);
    if (code) errors.push({ code });
    return errors;
  }

  const items = expense.items ?? [];
  if (items.length === 0) errors.push({ code: 'no-items' });
  items.forEach((it, scope) => {
    if (!isPositiveCents(it.amount)) errors.push({ code: 'amount-invalid', scope });
    if (!known(it.members)) errors.push({ code: 'unknown-member', scope });
    const code = checkSplit(it.amount, it.members, it.mode ?? 'equal', it.w);
    if (code) errors.push({ code, scope });
  });

  const rest = total - items.reduce((s, it) => s + it.amount, 0);
  if (rest < 0) {
    errors.push({ code: 'items-exceed-total' });
  } else if (rest > 0) {
    const restIds = expense.rest ?? [];
    if (!known(restIds)) errors.push({ code: 'unknown-member', scope: 'rest' });
    const code = checkSplit(rest, restIds, expense.restMode ?? 'equal', expense.restW);
    if (code) errors.push({ code, scope: 'rest' });
  }
  return errors;
}

function checkSplit(
  amount: Cents,
  members: readonly MemberId[],
  mode: SplitMode,
  w: Weights | undefined,
): ExpenseErrorCode | null {
  if (members.length === 0) return 'no-members';
  if (mode === 'equal') return null;

  const vals = members.map((id) => w?.[id] ?? 0);
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return 'weights-invalid';
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  switch (mode) {
    case 'frac':
      return sum(vals.map(scaledWeight)) === 0 ? 'weights-zero' : null;
    case 'pct':
      return sum(vals.map(scaledWeight)) === 100 * WEIGHT_SCALE ? null : 'pct-not-100';
    case 'exact':
      if (!vals.every(Number.isInteger)) return 'weights-invalid';
      return sum(vals) === amount ? null : 'exact-mismatch';
  }
}
