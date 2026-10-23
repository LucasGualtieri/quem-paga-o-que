import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Expense, Payment } from '@qpq/calc';
import { firebase } from '../firebase.ts';
import type { Money, SplitDoc } from './model.ts';

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'denied' };

/** Splits em que a pessoa está, em tempo real (a regra só deixa listar com este filtro). */
export function useMySplits(uid: string | null): Loadable<SplitDoc[]> {
  const [state, setState] = useState<Loadable<SplitDoc[]>>({ status: 'loading' });
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(firebase().db, 'splits'), where('uids', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => setState({ status: 'ready', data: snap.docs.map((d) => ({ ...(d.data() as Omit<SplitDoc, 'id'>), id: d.id })) }),
      () => setState({ status: 'denied' }),
    );
  }, [uid]);
  return state;
}

export function useSplit(splitId: string, uid: string | null): Loadable<SplitDoc> {
  const [state, setState] = useState<Loadable<SplitDoc>>({ status: 'loading' });
  useEffect(() => {
    if (!uid) return;
    setState({ status: 'loading' });
    return onSnapshot(
      doc(firebase().db, 'splits', splitId),
      (snap) => setState(snap.exists() ? { status: 'ready', data: { ...(snap.data() as Omit<SplitDoc, 'id'>), id: snap.id } } : { status: 'denied' }),
      () => setState({ status: 'denied' }),
    );
  }, [splitId, uid]);
  return state;
}

const EMPTY: Money = { expenses: [], payments: [] };

/** Despesas e acertos do split; saldo nunca é guardado, sempre calculado deles. */
export function useMoney(splitId: string, enabled: boolean): Money {
  const [money, setMoney] = useState<Money>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    const { db } = firebase();
    const offE = onSnapshot(collection(db, 'splits', splitId, 'expenses'), (s) => setMoney((m) => ({ ...m, expenses: s.docs.map((d) => d.data() as Expense) })), () => {});
    const offP = onSnapshot(collection(db, 'splits', splitId, 'payments'), (s) => setMoney((m) => ({ ...m, payments: s.docs.map((d) => d.data() as Payment) })), () => {});
    return () => {
      offE();
      offP();
    };
  }, [splitId, enabled]);
  return money;
}

export function useProfileName(uid: string | null): string {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(firebase().db, 'users', uid),
      (snap) => setName((snap.get('displayName') as string | undefined) ?? ''),
      () => {},
    );
  }, [uid]);
  return name;
}
