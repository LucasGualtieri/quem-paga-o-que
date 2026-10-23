import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { firebase } from '../firebase.ts';
import { pruneOps, mergeOps, useOps } from './expenseStore.ts';
import { activeExpenses, type ExpenseDoc, type PaymentDoc, type SplitDoc } from './model.ts';
import { applyPaymentOps, applyShareOps, prunePaymentOps, pruneShareOps, usePayOps } from './payStore.ts';

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

const stamp = (v: unknown): Date | null => (v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null);

/** Documento do Firestore → despesa (datas viram Date; campos que faltam, vazios). */
export function toExpenseDoc(id: string, d: Record<string, unknown>): ExpenseDoc {
  return {
    ...(d as unknown as ExpenseDoc),
    id,
    note: (d.note as string | undefined) ?? '',
    longDesc: (d.longDesc as string | undefined) ?? '',
    tags: (d.tags as string[] | undefined) ?? ['other'],
    paid: (d.paid as ExpenseDoc['paid'] | undefined) ?? {},
    pendConf: (d.pendConf as ExpenseDoc['pendConf'] | undefined) ?? {},
    proof: (d.proof as ExpenseDoc['proof'] | undefined) ?? {},
    receipt: (d.receipt as ExpenseDoc['receipt'] | undefined) ?? null,
    paySeq: (d.paySeq as number | undefined) ?? 0,
    deletedAt: stamp(d.deletedAt),
    createdAt: stamp(d.createdAt),
    updatedAt: stamp(d.updatedAt),
  };
}

/**
 * Todas as despesas do split (inclusive as excluídas) em tempo real, já com as
 * mudanças que o aparelho mostra antes do servidor responder.
 */
export function useExpenses(splitId: string, enabled: boolean): { expenses: ExpenseDoc[]; loaded: boolean } {
  const [server, setServer] = useState<ExpenseDoc[] | null>(null);
  const ops = useOps();
  const payOps = usePayOps();
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(firebase().db, 'splits', splitId, 'expenses'),
      (s) => {
        const docs = s.docs.map((d) => toExpenseDoc(d.id, d.data()));
        setServer(docs);
        pruneOps(splitId, docs);
        pruneShareOps(splitId, docs);
      },
      () => setServer([]),
    );
  }, [splitId, enabled]);
  // Edições por cima do servidor e, por cima delas, os pagamentos (que não são edição; decisão 8).
  const expenses = useMemo(() => applyShareOps(splitId, mergeOps(splitId, server ?? [], ops), payOps), [splitId, server, ops, payOps]);
  return { expenses, loaded: server !== null };
}

export interface HistoryEntry {
  id: string;
  seq: number;
  /** Edição (created, edited, deleted, restored) ou pagamento (paid, received, unpaid, confirmed, disputed, proof). */
  kind: string;
  by: string;
  at: Date | null;
  from?: number;
  to?: number;
  /** Nos pagamentos: de quem é a parte. */
  memberId?: string;
}

/** Pela hora (pagamentos não sobem a versão); empate pela versão. */
export function byHistoryTime(a: HistoryEntry, b: HistoryEntry): number {
  return (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity) || a.seq - b.seq;
}

export function useHistory(splitId: string, expenseId: string): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(
    () =>
      onSnapshot(
        collection(firebase().db, 'splits', splitId, 'expenses', expenseId, 'history'),
        (s) =>
          setEntries(
            s.docs
              .map((d) => ({ ...(d.data() as Omit<HistoryEntry, 'id' | 'at'>), id: d.id, at: stamp(d.data().at) }))
              .sort(byHistoryTime),
          ),
        () => setEntries([]),
      ),
    [splitId, expenseId],
  );
  return entries;
}

const NO_PAYMENTS: readonly PaymentDoc[] = [];

export function toPaymentDoc(id: string, d: Record<string, unknown>): PaymentDoc {
  return { ...(d as unknown as PaymentDoc), id, when: stamp(d.when), proof: (d.proof as PaymentDoc['proof'] | undefined) ?? null };
}

/** Despesas e acertos do split; o saldo nunca é guardado, sempre calculado deles (e sem as excluídas). */
export function useMoney(splitId: string, enabled: boolean): { expenses: ExpenseDoc[]; payments: readonly PaymentDoc[]; loaded: boolean } {
  const { expenses, loaded } = useExpenses(splitId, enabled);
  const [server, setServer] = useState<readonly PaymentDoc[]>(NO_PAYMENTS);
  const payOps = usePayOps();
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(firebase().db, 'splits', splitId, 'payments'),
      (s) => {
        const docs = s.docs.map((d) => toPaymentDoc(d.id, d.data()));
        setServer(docs);
        prunePaymentOps(splitId, docs);
      },
      () => {},
    );
  }, [splitId, enabled]);
  const payments = useMemo(() => applyPaymentOps(splitId, server, payOps), [splitId, server, payOps]);
  return useMemo(() => ({ expenses: activeExpenses(expenses), payments, loaded }), [expenses, payments, loaded]);
}

export interface Prefs {
  inapp?: boolean;
  email?: boolean;
  selfName?: boolean;
  askProof?: boolean;
  theme?: 'light' | 'dark';
  lang?: 'pt-BR' | 'en';
}

export interface Profile {
  displayName: string;
  /** Foto de perfil no Storage. */
  photoPath: string | null;
  prefs: Prefs;
  /** Link de recuperação ativo (só as Functions escrevem). */
  recovery: { active: boolean; createdAt: Date | null };
}

const EMPTY_PROFILE: Profile = { displayName: '', photoPath: null, prefs: {}, recovery: { active: false, createdAt: null } };

/** Perfil e preferências do usuário (users/{uid}), em tempo real. */
export function useProfile(uid: string | null): Loadable<Profile> {
  const [state, setState] = useState<Loadable<Profile>>({ status: 'loading' });
  useEffect(() => {
    if (!uid) return;
    setState({ status: 'loading' });
    return onSnapshot(
      doc(firebase().db, 'users', uid),
      (snap) => {
        const d = snap.data() ?? {};
        const rec = (d.recovery ?? {}) as { active?: boolean; createdAt?: { toDate(): Date } };
        setState({
          status: 'ready',
          data: {
            displayName: (d.displayName as string | undefined) ?? '',
            photoPath: (d.photoPath as string | undefined) ?? null,
            prefs: (d.prefs as Prefs | undefined) ?? {},
            recovery: { active: !!rec.active, createdAt: rec.createdAt?.toDate() ?? null },
          },
        });
      },
      () => setState({ status: 'ready', data: EMPTY_PROFILE }),
    );
  }, [uid]);
  return state;
}

export function useProfileName(uid: string | null): string {
  const p = useProfile(uid);
  return p.status === 'ready' ? p.data.displayName : '';
}

/** Grava nome e preferências; o cache local do Firestore já mostra a mudança na hora. */
export function saveProfile(uid: string, patch: { displayName?: string; prefs?: Prefs; photoPath?: string | null }): Promise<void> {
  return setDoc(doc(firebase().db, 'users', uid), patch, { merge: true });
}
