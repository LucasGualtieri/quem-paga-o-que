import { shares } from './shares.ts';
import type { Cents, Expense, Installments, JoinOrder, MemberId, Shares } from './types.ts';

/** No máximo 24 parcelas mensais (spec 05). */
export const MAX_INSTALLMENTS = 24;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Último dia do mês (`month` de 1 a 12). */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Datas de vencimento (AAAA-MM-DD): todo mês no dia da primeira; dia que não existe no mês vira
 * o último dia (31 jan → 28 fev → 31 mar).
 */
export function installmentDates(plan: Installments): string[] {
  const m = YMD.exec(plan.first);
  if (!m) return [];
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const out: string[] = [];
  for (let i = 0; i < plan.count; i++) {
    const idx = mo - 1 + i;
    const year = y + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const day = Math.min(d, daysIn(year, month));
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

/** A parte de uma pessoa em `count` parcelas; os centavos que sobram vão para a primeira. */
export function splitInstallments(share: Cents, count: number): Cents[] {
  const base = Math.floor(share / count);
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? share - base * count : 0));
}

/** Plano válido: de 2 a MAX_INSTALLMENTS parcelas e primeira data no formato AAAA-MM-DD. */
export function isValidPlan(plan: Installments): boolean {
  return Number.isInteger(plan.count) && plan.count >= 2 && plan.count <= MAX_INSTALLMENTS && YMD.test(plan.first) && installmentDates(plan)[0] === plan.first;
}

/**
 * Quantas parcelas de `id` já contam (revisto em 29/10/2026): as vencidas até `today`
 * (AAAA-MM-DD, horário de Brasília) mais a próxima, que se paga antes de vencer; ou as
 * antecipadas, o que for maior. Sem `today`, todas.
 */
export function dueCount(expense: Pick<Expense, 'installments' | 'advanced'>, id: MemberId, today?: string): number {
  const plan = expense.installments;
  if (!plan) return 1;
  if (today === undefined) return plan.count;
  const byDate = installmentDates(plan).filter((d) => d <= today).length + 1;
  return Math.min(plan.count, Math.max(byDate, expense.advanced?.[id] ?? 0));
}

/**
 * A parte de cada um que já conta no saldo: sem parcelas, a parte inteira; parcelada, as
 * parcelas vencidas até `today`, a próxima e as antecipadas. Sem `today`, a parte inteira.
 */
export function dueShares(expense: Expense, order: JoinOrder, today?: string): Shares {
  const full = shares(expense, order);
  const plan = expense.installments;
  if (!plan || today === undefined) return full;
  const out: Shares = {};
  for (const [id, v] of Object.entries(full)) {
    const n = dueCount(expense, id, today);
    out[id] = splitInstallments(v, plan.count)
      .slice(0, n)
      .reduce((s, x) => s + x, 0);
  }
  return out;
}
