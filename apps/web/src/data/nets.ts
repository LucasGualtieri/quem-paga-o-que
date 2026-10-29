import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import type { Payment } from '@qpq/calc';
import { DEFAULT_CURRENCY, type Currency } from '@qpq/shared';
import { firebase } from '../firebase.ts';
import { toExpenseDoc } from './hooks.ts';
import { balances, currencyOf, myMember, type Money, type SplitDoc } from './model.ts';

/** Seu saldo em cada split, recalculado das despesas e acertos (nunca guardado). */
export function useMyNets(splits: SplitDoc[], uid: string | null): Record<string, number> {
  const ids = splits.map((s) => s.id).join(',');
  const [money, setMoney] = useState<Record<string, Money>>({});
  useEffect(() => {
    if (!ids) return;
    const { db } = firebase();
    const offs = ids.split(',').flatMap((id) => [
      onSnapshot(collection(db, 'splits', id, 'expenses'), (s) => setMoney((m) => ({ ...m, [id]: { payments: [], ...m[id], expenses: s.docs.map((d) => toExpenseDoc(d.id, d.data())).filter((e) => !e.deletedAt) } })), () => {}),
      onSnapshot(collection(db, 'splits', id, 'payments'), (s) => setMoney((m) => ({ ...m, [id]: { expenses: [], ...m[id], payments: s.docs.map((d) => d.data() as Payment) } })), () => {}),
    ]);
    return () => offs.forEach((off) => off());
  }, [ids]);
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of splits) {
      const me = uid ? myMember(s, uid) : null;
      out[s.id] = me ? (balances(s, money[s.id] ?? { expenses: [], payments: [] })[me.id] ?? 0) : 0;
    }
    return out;
  }, [splits, money, uid]);
}

/** "No total, você deve/recebe": só os splits passados (a home passa os em andamento; spec 04). */
export function totalsOf(splits: readonly SplitDoc[], nets: Record<string, number>): { owe: number; recv: number; total: number } {
  let owe = 0;
  let recv = 0;
  for (const s of splits) {
    const c = nets[s.id] ?? 0;
    if (c < 0) owe -= c;
    else recv += c;
  }
  return { owe, recv, total: recv - owe };
}

/**
 * Total da home por moeda (sem câmbio): uma linha para cada moeda dos splits, a mais usada
 * primeiro. Com uma moeda só, é o total de sempre.
 */
export function totalsByCurrency(splits: readonly SplitDoc[], nets: Record<string, number>): Array<{ currency: Currency; owe: number; recv: number; total: number }> {
  const groups = new Map<Currency, SplitDoc[]>();
  for (const s of splits) groups.set(currencyOf(s), [...(groups.get(currencyOf(s)) ?? []), s]);
  if (groups.size === 0) groups.set(DEFAULT_CURRENCY, []);
  return [...groups.entries()].sort(([, a], [, b]) => b.length - a.length).map(([currency, list]) => ({ currency, ...totalsOf(list, nets) }));
}
