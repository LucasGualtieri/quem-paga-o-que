import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { NotificationData } from '@qpq/shared';
import { firebase } from '../firebase.ts';

/** Notificação como o app usa (notifications/{id}); só as Functions criam. */
export type NotificationDoc = NotificationData & { id: string; at: Date | null };

const stamp = (v: unknown): Date | null => (v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null);

/** As notificações da pessoa, mais novas primeiro, sem as escondidas (despesa excluída, acerto desfeito). */
export function useNotifications(uid: string | null): NotificationDoc[] | null {
  const [list, setList] = useState<NotificationDoc[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(firebase().db, 'notifications'), where('to', '==', uid), orderBy('at', 'desc'), limit(50));
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as NotificationData), id: d.id, at: stamp(d.data().at) })).filter((n) => !n.hidden)),
      () => setList([]),
    );
  }, [uid]);
  return list;
}

/** Abrir um item marca como lido; o cache local do Firestore mostra na hora. */
export function markRead(id: string): Promise<void> {
  return updateDoc(doc(firebase().db, 'notifications', id), { read: true });
}

export function markAllRead(ids: readonly string[]): Promise<void> {
  const batch = writeBatch(firebase().db);
  for (const id of ids) batch.update(doc(firebase().db, 'notifications', id), { read: true });
  return batch.commit();
}

/** Contagem do sino: até "9+". */
export function bellCount(unread: number): string {
  return unread > 9 ? '9+' : String(unread);
}

type T = (key: string, opts?: Record<string, unknown>) => string;

export interface NotificationView {
  title: string;
  sub: string;
  /** Para onde o item leva: o detalhe da despesa (com destaque) ou o Meu saldo do split. */
  to: string;
}

/**
 * Textos e destino de cada aviso (spec 07). `name(id)` dá o nome atual de um participante;
 * `money` formata centavos.
 */
export function viewOf(n: NotificationDoc, t: T, name: (id: string | null) => string, money: (c: number) => string, date: (ymd: string) => string = (ymd) => ymd): NotificationView {
  const amount = money(n.amount);
  const from = name(n.from) || n.fromName;
  const what = n.expName ?? t('notif.settle');
  const proof = n.hasProof ? t('notif.withProof') : t('notif.noProof');
  const state = n.status === 'confirmed' ? t('notif.confirmed') : n.status === 'disputed' ? t('notif.youDisputed') : '';
  const to = n.expId ? `/s/${n.splitId}/despesa/${n.expId}?n=${n.id}` : `/s/${n.splitId}/saldo`;
  switch (n.kind) {
    case 'paid':
      return { title: t('notif.paid', { name: from, amount }), sub: `${what} · ${n.splitName} · ${proof}${state}`, to };
    case 'settled': {
      const iReceived = n.toMember === n.payTo;
      const title =
        n.from === n.payFrom || n.from === n.payTo
          ? iReceived
            ? t('notif.paid', { name: from, amount })
            : t('notif.receivedFrom', { name: from, amount })
          : iReceived
            ? t('notif.adminPaid', { name: from, who: name(n.payFrom), amount })
            : t('notif.adminReceived', { name: from, who: name(n.payTo), amount });
      return { title, sub: `${t('notif.settle')} · ${n.splitName}${state}`, to };
    }
    case 'proof':
      return { title: t('notif.proof', { name: from }), sub: `${what} · ${n.splitName} · ${amount}`, to };
    case 'disputed':
      return { title: t('notif.disputed', { name: from, amount }), sub: `${what} · ${n.splitName}`, to };
    case 'autoFinalized':
      return { title: t('notif.autoFinalized', { split: n.splitName }), sub: t('notif.autoFinalizedSub'), to: `/s/${n.splitId}` };
    case 'pixRequested':
      // Abre o Meu saldo do split com a folha da chave Pix já aberta.
      return { title: t('notif.pixRequested', { name: from }), sub: `${n.splitName} · ${t('notif.pixRequestedSub', { amount })}`, to: `/s/${n.splitId}/saldo?pix=1` };
    case 'pixAdded':
      return { title: t('notif.pixAdded', { name: from }), sub: `${n.splitName} · ${t('notif.pixAddedSub')}`, to: `/s/${n.splitId}/saldo` };
    case 'installmentDue':
      // A próxima parcela entrou no saldo: a parte de quem recebe cresce para quem pagou a despesa.
      return {
        title: t('notif.instDue', { n: n.inst?.n ?? 0, of: n.inst?.of ?? 0, what }),
        sub: `${t('notif.instDueSub', { amount, name: from, date: date(n.inst?.due ?? '') })} · ${n.splitName}`,
        to: `/s/${n.splitId}/despesa/${n.expId}`,
      };
    case 'splitDeleted':
      // Leva à explicação do split apagado.
      return { title: t('notif.splitDeleted', { name: from, split: n.splitName }), sub: t('notif.splitDeletedSub'), to: `/s/${n.splitId}` };
  }
}
