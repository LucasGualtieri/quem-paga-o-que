import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { proofPath, receiptPath, type ProofInfo } from '@qpq/shared';
import { useToast } from '../components/index.ts';
import { api, detailsOf } from '../data/api.ts';
import { enqueue } from '../data/expenseStore.ts';
import { previewPhoto, uploadPhoto } from '../data/files.ts';
import { sharesOf, type ExpenseDoc, type Member, type PaymentDoc, type SplitDoc } from '../data/model.ts';
import { confirmShareOp, settlePaymentOp, settleReceiptOp, startPayOp, type PaymentOp, type ReceiptOp, type ShareOp, type SharePatch } from '../data/payStore.ts';
import { ImageError, photoName } from '../lib/image.ts';
import { useReasonText } from './reasons.ts';

function newPaymentId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `p${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')}`;
}

/**
 * Pagamentos (spec 06): marcar pago / Recebi, Desfazer, Confirmar, Não recebi, acerto pelo
 * Saldo e comprovante. Tudo otimista: muda na hora e só volta, com aviso, se o servidor recusar.
 */
export function usePayActions(split: SplitDoc, me: Member) {
  const { t } = useTranslation();
  const toast = useToast();
  const reasonText = useReasonText();
  const splitId = split.id;
  const nameOf = useCallback((id: string) => split.members[id]?.name ?? '', [split]);

  const fail = useCallback(
    (error: unknown) => toast.show({ kind: 'error', text: error instanceof ImageError ? t('pay.imageError') : reasonText(detailsOf(error)) }),
    [toast, reasonText, t],
  );

  /** Uma mudança numa parte: aparece na hora, vai para o servidor na fila da despesa. */
  const shareChange = useCallback(
    (e: ExpenseDoc, memberId: string, patch: SharePatch, call: () => Promise<{ paySeq: number }>) => {
      const op: ShareOp = { kind: 'share', splitId, expenseId: e.id, memberId, patch };
      const undo = startPayOp(op);
      return enqueue(e.id, call).then(
        (r) => {
          confirmShareOp(op, r.paySeq);
          return true;
        },
        (error) => {
          undo();
          fail(error);
          return false;
        },
      );
    },
    [splitId, fail],
  );

  const proofFor = (path: string): ProofInfo => ({ path, at: Date.now(), by: me.id });

  /** Envia a foto e anexa à parte (na mesma fila da despesa, depois da marcação). */
  const attachShare = useCallback(
    (e: ExpenseDoc, memberId: string, file: File, announce = true) => {
      const path = proofPath(splitId, memberId, e.payer, photoName());
      previewPhoto(path, file);
      void shareChange(e, memberId, { proof: proofFor(path) }, async () => {
        await uploadPhoto(path, file);
        const r = await api.attachProof({ splitId, kind: 'share', expenseId: e.id, memberId, path });
        return { paySeq: r.paySeq ?? 0 };
      }).then((ok) => ok && announce && toast.show({ text: t('pay.proofSent') }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitId, shareChange, toast, t, me.id],
  );

  const ref = (e: ExpenseDoc, memberId: string) => ({ splitId, expenseId: e.id, memberId });

  const unmark = useCallback(
    (e: ExpenseDoc, memberId: string) => void shareChange(e, memberId, { paid: null, pendConf: null, proof: null }, () => api.unmarkShare(ref(e, memberId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shareChange],
  );

  /** "Marcar como pago" (quem deve, ou admin) ou "Recebi" (quem pagou a despesa); com foto, já anexa. */
  const mark = useCallback(
    (e: ExpenseDoc, memberId: string, file?: File | null) => {
      const share = sharesOf(e, split)[memberId] ?? 0;
      const iAmPayer = me.id === e.payer;
      void shareChange(e, memberId, { paid: Math.max(share, e.paid[memberId] ?? 0), pendConf: iAmPayer ? null : true }, () => api.markShare(ref(e, memberId)));
      if (file) attachShare(e, memberId, file, false);
      toast.show({ text: iAmPayer ? t('pay.received') : t('pay.recorded'), onUndo: () => unmark(e, memberId) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [split, me.id, shareChange, attachShare, unmark, toast, t],
  );

  const confirm = useCallback(
    (e: ExpenseDoc, memberId: string) => {
      void shareChange(e, memberId, { pendConf: null }, () => api.confirmShare(ref(e, memberId)));
      toast.show({ text: t('pay.confirmed') });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shareChange, toast, t],
  );

  /** "Não recebi": desfaz a parte paga e apaga o comprovante. */
  const dispute = useCallback(
    (e: ExpenseDoc, memberId: string) => {
      void shareChange(e, memberId, { paid: null, pendConf: null, proof: null }, () => api.disputeShare(ref(e, memberId)));
      toast.show({ text: t('pay.disputed', { name: nameOf(memberId) }) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shareChange, toast, t, nameOf],
  );

  /** Acerto de um pagamento entre duas pessoas: registra na hora; o servidor confere o valor. */
  const paymentChange = useCallback(
    (op: PaymentOp, call: () => Promise<boolean>) => {
      const undo = startPayOp(op);
      return enqueue(op.id, call).then(
        (created) => {
          settlePaymentOp(op, created);
          return true;
        },
        (error) => {
          undo();
          fail(error);
          return false;
        },
      );
    },
    [fail],
  );

  const attachPayment = useCallback(
    (p: PaymentDoc, file: File, announce = true) => {
      const path = proofPath(splitId, p.from, p.to, photoName());
      previewPhoto(path, file);
      void paymentChange({ kind: 'payment', splitId, id: p.id, proof: proofFor(path) }, async () => {
        await uploadPhoto(path, file);
        await api.attachProof({ splitId, kind: 'payment', paymentId: p.id, path });
        return true;
      }).then((ok) => ok && announce && toast.show({ text: t('pay.proofSent') }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitId, paymentChange, toast, t, me.id],
  );

  const undoPayment = useCallback(
    (p: PaymentDoc) =>
      void paymentChange({ kind: 'payment', splitId, id: p.id, doc: null }, async () => {
        await api.deletePayment({ splitId, paymentId: p.id });
        return true;
      }),
    [splitId, paymentChange],
  );

  const settle = useCallback(
    (from: string, to: string, amount: number, file?: File | null) => {
      const id = newPaymentId();
      const doc: PaymentDoc = { id, from, to, amount, by: me.id, when: new Date(), proof: null };
      void paymentChange({ kind: 'payment', splitId, id, doc }, async () => (await api.createPayment({ splitId, id, from, to })).amount > 0);
      if (file) attachPayment(doc, file, false);
      toast.show({ text: t('pay.recorded'), onUndo: () => undoPayment(doc) });
    },
    [splitId, me.id, paymentChange, attachPayment, undoPayment, toast, t],
  );

  /** Comprovante (foto) da despesa: troca na hora; `null` tira. */
  const setReceipt = useCallback(
    async (e: Pick<ExpenseDoc, 'id' | 'receipt'>, file: File | null) => {
      const path = file ? receiptPath(splitId, e.id, photoName()) : null;
      if (path && file) previewPhoto(path, file);
      const op: ReceiptOp = { kind: 'receipt', splitId, expenseId: e.id, receipt: path ? proofFor(path) : null, before: e.receipt?.path ?? null };
      const undo = startPayOp(op);
      try {
        await enqueue(e.id, async () => {
          if (path && file) await uploadPhoto(path, file);
          await api.setReceipt({ splitId, expenseId: e.id, path });
        });
        settleReceiptOp(op);
      } catch (error) {
        undo();
        fail(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitId, fail, me.id],
  );

  return { mark, unmark, confirm, dispute, attachShare, settle, undoPayment, attachPayment, setReceipt };
}
